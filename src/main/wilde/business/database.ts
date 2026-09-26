import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import SyncDatabase from '../../sqlite/sync-database'
import {
  commandSchema,
  type BusinessRequest,
  type BusinessResult,
  type BusinessMutation
} from '../../../shared/wilde/commands'
import { recordSchema, type BusinessSnapshot } from '../../../shared/wilde/domain'
import { migrateBusinessDatabase } from './migrations'
import { exportBusinessBackup } from './business-store-export'
import { applyMutation, expandProjectMoves } from './mutations'
import { digest, parseBackup, type BusinessBackup } from './backup'
import { validateRecordRelations, writeRecord } from './record-integrity'
import { applyOutcomeImport } from './outcome-import'
import { businessFailure } from './business-errors'
import { mutationImpact } from './mutation-impact'
import { applyBackupEvidence } from './backup-history-import'

type Preview = {
  revision: number
  expires: number
  mutations?: BusinessMutation[]
  backup?: BusinessBackup
  mode?: 'merge' | 'replace'
  outcomes?: string
}
export class BusinessDatabase {
  readonly db: SyncDatabase
  private previews = new Map<string, Preview>()
  constructor(readonly file: string) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    this.db = new SyncDatabase(file)
    try {
      migrateBusinessDatabase(this.db, file)
    } catch (error) {
      this.db.close()
      throw error
    }
  }
  close(): void {
    this.db.close()
  }
  metadata(key: string): string {
    return String(this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value ?? '')
  }
  snapshot(clientId?: string): BusinessSnapshot {
    const rows = clientId
      ? this.db
          .prepare(
            "SELECT body FROM records WHERE client_id=? OR id=? ORDER BY kind='execution', rowid DESC LIMIT 10001"
          )
          .all(clientId, clientId)
      : this.db
          .prepare("SELECT body FROM records ORDER BY kind='execution', rowid DESC LIMIT 10001")
          .all()
    const activity = clientId
      ? this.db
          .prepare('SELECT * FROM activity WHERE client_id=? ORDER BY at DESC LIMIT 200')
          .all(clientId)
      : this.db.prepare('SELECT * FROM activity ORDER BY at DESC LIMIT 200').all()
    return {
      ownerId: this.metadata('ownerId'),
      revision: Number(this.metadata('revision')),
      records: rows.slice(0, 10000).map((row) => recordSchema.parse(JSON.parse(String(row.body)))),
      activity: activity.map((row) => ({
        id: String(row.id),
        requestId: String(row.request_id),
        operation: String(row.operation),
        entityId: String(row.entity_id),
        clientId: row.client_id === null ? null : String(row.client_id),
        at: String(row.at)
      })),
      truncated: rows.length > 10000
    }
  }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  bumpRevision(): void {
    this.db.prepare("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run()
  }
  execute(input: unknown): BusinessResult {
    const parsed = commandSchema.safeParse(input)
    if (!parsed.success) {
      return {
        status: 'rejected',
        message: 'Invalid business request. Check required fields and size limits.'
      }
    }
    const request = parsed.data
    try {
      return this.dispatch(request)
    } catch (error) {
      return businessFailure(error)
    }
  }
  private dispatch(request: BusinessRequest): BusinessResult {
    const { command, requestId } = request
    if (command.operation === 'snapshot') {
      return { status: 'success', message: 'Loaded', snapshot: this.snapshot(command.clientId) }
    }
    if (command.operation === 'export') {
      return {
        status: 'success',
        message: 'Backup contains business information; store it securely.',
        exported: exportBusinessBackup(this)
      }
    }
    if (command.operation === 'preview') {
      return this.preview({ mutations: expandProjectMoves(this.db, command.mutations) }, requestId)
    }
    if (command.operation === 'import-preview') {
      if (command.mode === 'outcomes') {
        return this.preview({ outcomes: command.content }, requestId)
      }
      return this.preview({ backup: parseBackup(command.content), mode: command.mode }, requestId)
    }
    const requestDigest = digest(command)
    const prior = this.db.prepare('SELECT digest,result FROM requests WHERE id=?').get(requestId)
    if (prior) {
      if (prior.digest !== requestDigest) {
        throw new Error('Request ID was already used for another change.')
      }
      return { status: 'success', message: 'Already saved', snapshot: this.snapshot() }
    }
    let preview: Preview | undefined
    if (command.operation === 'commit') {
      preview = this.previews.get(command.token)
      if (
        !preview ||
        preview.expires < Date.now() ||
        preview.revision !== Number(this.metadata('revision'))
      ) {
        throw new Error('Preview expired or data changed. Review again.')
      }
      this.previews.delete(command.token)
      if (preview.backup) {
        this.db.prepare('VACUUM INTO ?').run(`${this.file}.before-import-${Date.now()}`)
      }
    }
    this.transaction(() => {
      if (preview) {
        this.applyPreview(preview, requestId)
      } else if (command.operation !== 'commit') {
        applyMutation(this.db, command, requestId, false)
      }
      this.bumpRevision()
      this.db.prepare('INSERT INTO requests VALUES (?,?,?)').run(requestId, requestDigest, '{}')
    })
    return { status: 'success', message: 'Saved', snapshot: this.snapshot() }
  }
  private preview(input: Partial<Preview>, requestId: string): BusinessResult {
    for (const [id, preview] of this.previews) {
      if (preview.expires < Date.now()) {
        this.previews.delete(id)
      }
    }
    if (this.previews.size >= 20) {
      throw new Error('Too many pending previews. Finish one or wait five minutes.')
    }
    const preview: Preview = {
      ...input,
      revision: Number(this.metadata('revision')),
      expires: Date.now() + 300000
    }
    const token = randomUUID()
    this.db.exec('BEGIN IMMEDIATE')
    let outcomeCounts: { adds: number; skips: number } | undefined
    try {
      if (preview.outcomes) {
        outcomeCounts = applyOutcomeImport(this, preview.outcomes, requestId)
      } else {
        this.applyPreview(preview, requestId)
      }
      if (this.db.prepare('PRAGMA foreign_key_check').all().length) {
        throw new Error('Import contains invalid relationships.')
      }
    } finally {
      this.db.exec('ROLLBACK')
    }
    this.previews.set(token, preview)
    const records =
      preview.backup?.records ??
      preview.mutations?.flatMap((item) => (item.operation === 'save' ? [item.record] : [])) ??
      []
    const adds = records.filter(
      (record) => !this.db.prepare('SELECT id FROM records WHERE id=?').get(record.id)
    ).length
    return {
      status: 'needs-confirmation',
      message: 'Review the exact change before applying.',
      preview: {
        token,
        affected: preview.mutations ? mutationImpact(this.db, preview.mutations) : undefined,
        targets: preview.mutations?.flatMap((mutation) =>
          mutation.operation === 'save' && mutation.record.type === 'assignment'
            ? [mutation.record.target]
            : []
        ),
        adds: outcomeCounts?.adds ?? adds,
        changes: records.length - adds,
        skips: outcomeCounts?.skips ?? 0,
        conflicts: 0,
        unresolved: records.filter(
          (record) =>
            record.type === 'assignment' && record.target.ownerId !== this.metadata('ownerId')
        ).length,
        description: outcomeCounts
          ? `${outcomeCounts.adds} imported business assertions; ${outcomeCounts.skips} identical duplicates. Original event UTC timestamps and source references are retained. This import is not independent proof of the upstream event.`
          : preview.mode === 'replace'
            ? `Replace the business store with ${records.length} records. A recovery snapshot will be retained. Credentials and Orca sessions are excluded.`
            : `${records.length || preview.mutations?.length} records: ${records
                .slice(0, 20)
                .map((record) =>
                  'title' in record ? record.title : 'name' in record ? record.name : record.type
                )
                .join(', ')}. Historical evidence keeps its original client.`
      }
    }
  }
  private applyPreview(preview: Preview, requestId: string): void {
    if (preview.outcomes) {
      applyOutcomeImport(this, preview.outcomes, requestId)
      return
    }
    if (preview.mutations) {
      for (const mutation of preview.mutations) {
        applyMutation(this.db, mutation, requestId, true)
      }
    }
    if (!preview.backup) {
      return
    }
    if (preview.mode === 'replace') {
      this.db.exec(
        'PRAGMA defer_foreign_keys = ON; DELETE FROM records; DELETE FROM history; DELETE FROM activity; DELETE FROM checkpoints;'
      )
    }
    for (const record of preview.backup.records) {
      const prior = this.db.prepare('SELECT body FROM records WHERE id=?').get(record.id)
      if (prior && digest(JSON.parse(String(prior.body))) !== digest(record)) {
        throw new Error(
          'Import conflicts with existing records. Use a reviewed full restore or resolve the file before importing.'
        )
      }
      if (!prior) {
        writeRecord(this.db, record)
      }
    }
    for (const record of preview.backup.records) {
      validateRecordRelations(this.db, record, true)
    }
    applyBackupEvidence(this, preview.backup)
    this.db
      .prepare('INSERT INTO activity VALUES (?,?,?,?,?,?)')
      .run(
        randomUUID(),
        requestId,
        'import',
        this.metadata('ownerId'),
        null,
        new Date().toISOString()
      )
  }
}
