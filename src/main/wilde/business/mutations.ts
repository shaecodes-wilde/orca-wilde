import { randomUUID } from 'node:crypto'
import type SyncDatabase from '../../sqlite/sync-database'
import type { BusinessMutation } from '../../../shared/wilde/commands'
import { type BusinessRecord, recordSchema } from '../../../shared/wilde/domain'
import { readRecord, validateRecordRelations, writeRecord } from './record-integrity'

export function applyMutation(
  db: SyncDatabase,
  mutation: BusinessMutation,
  requestId: string,
  reviewed: boolean
): void {
  const id = mutation.operation === 'save' ? mutation.record.id : mutation.id
  const current = readRecord(db, id)
  const revision = mutation.operation === 'save' ? mutation.record.revision : mutation.revision
  if ((current?.revision ?? 0) !== revision) {
    throw new Error('Record changed. Refresh and review again.')
  }
  if (current && ['execution', 'outcome'].includes(current.type)) {
    throw new Error('Evidence is immutable. Import a correction instead.')
  }
  const now = new Date().toISOString()
  if (mutation.operation === 'delete') {
    if (!reviewed || !current?.archivedAt) {
      throw new Error('Archive this record, then preview permanent deletion.')
    }
    const referenced = db
      .prepare(
        "SELECT 1 FROM records WHERE client_id=? OR project_id=? OR json_extract(body,'$.projectId')=? OR json_extract(body,'$.workflowId')=? OR json_extract(body,'$.correctsId')=? OR json_extract(body,'$.voidsId')=? LIMIT 1"
      )
      .get(id, id, id, id, id, id)
    const history = db
      .prepare('SELECT 1 FROM history WHERE entity_id<>? AND client_id=? LIMIT 1')
      .get(id, id)
    if (referenced || history) {
      throw new Error('This record has history or references. Keep it archived instead.')
    }
    db.prepare('DELETE FROM records WHERE id=?').run(id)
    db.prepare('DELETE FROM history WHERE entity_id=?').run(id)
  } else {
    if (mutation.operation === 'archive' && !current) {
      throw new Error('Record no longer exists.')
    }
    const candidate =
      mutation.operation === 'save'
        ? mutation.record
        : recordSchema.parse({ ...current, archivedAt: mutation.archived ? now : null })
    if (current && current.type !== candidate.type) {
      throw new Error('Record type cannot change.')
    }
    if (
      !reviewed &&
      current &&
      ((candidate.type === 'assignment' && JSON.stringify(current) !== JSON.stringify(candidate)) ||
        (candidate.type === 'project' &&
          current.type === 'project' &&
          candidate.clientId !== current.clientId) ||
        (candidate.type === 'workflow' &&
          current.type === 'workflow' &&
          (candidate.clientId !== current.clientId || candidate.ownership !== current.ownership)))
    ) {
      throw new Error('Preview the assignment change before saving.')
    }
    if (candidate.type === 'execution' || candidate.type === 'outcome') {
      throw new Error('Use the validated evidence import or collector.')
    }
    validateRecordRelations(db, candidate)
    const saved = recordSchema.parse({
      ...candidate,
      revision: revision + 1,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    })
    if (current) {
      db.prepare('INSERT INTO history(entity_id,client_id,at,body) VALUES (?,?,?,?)').run(
        id,
        'clientId' in current ? current.clientId : current.type === 'client' ? id : null,
        now,
        JSON.stringify(current)
      )
    }
    writeRecord(db, saved)
  }
  const attribution = mutation.operation === 'save' ? mutation.record : current
  db.prepare('INSERT INTO activity VALUES (?,?,?,?,?,?)').run(
    randomUUID(),
    requestId,
    mutation.operation,
    id,
    attribution && 'clientId' in attribution
      ? attribution.clientId
      : attribution?.type === 'client'
        ? id
        : null,
    now
  )
}

export function expandProjectMoves(
  db: SyncDatabase,
  mutations: BusinessMutation[]
): BusinessMutation[] {
  const expanded = [...mutations]
  for (const mutation of mutations) {
    if (mutation.operation !== 'save' || mutation.record.type !== 'project') {
      continue
    }
    const project = mutation.record
    const current = readRecord(db, project.id)
    if (current?.type !== 'project' || current.clientId === project.clientId) {
      continue
    }
    const rows = db.prepare('SELECT body FROM records WHERE project_id=?').all(project.id)
    for (const row of rows) {
      const record: BusinessRecord = recordSchema.parse(JSON.parse(String(row.body)))
      if (mutations.some((item) => item.operation === 'save' && item.record.id === record.id)) {
        continue
      }
      expanded.push({
        operation: 'save',
        record: recordSchema.parse({ ...record, clientId: project.clientId })
      })
    }
  }
  if (expanded.length > 1000) {
    throw new Error('Change affects more than 1,000 records. Split the operation.')
  }
  return expanded
}
