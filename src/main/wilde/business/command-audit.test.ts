import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { BusinessDatabase } from './database'
import { recordCommandAudit } from './command-audit'
import { newRecordFields, type Client } from '../../../shared/wilde/domain'
import type { CommandAudit, BusinessRequest } from '../../../shared/wilde/commands'
import { backupSchema, digest } from './backup'

const stores: BusinessDatabase[] = []
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }
})
function open() {
  const store = new BusinessDatabase(
    join(mkdtempSync(join(tmpdir(), 'wilde-command-audit-')), 'business.sqlite')
  )
  stores.push(store)
  return store
}
function run(store: BusinessDatabase, command: BusinessRequest['command']) {
  return store.execute({ requestId: randomUUID(), command })
}
function seedClient(store: BusinessDatabase) {
  const client: Client = {
    ...newRecordFields(),
    type: 'client',
    name: 'Disposable client',
    kind: 'internal',
    status: 'active',
    owner: '',
    contacts: '',
    tags: [],
    notes: '',
    links: []
  }
  expect(run(store, { operation: 'save', record: client }).status).toBe('success')
  return client
}
function restore(store: BusinessDatabase, content: string) {
  const preview = run(store, { operation: 'import-preview', mode: 'merge', content })
  expect(preview.status, preview.message).toBe('needs-confirmation')
  if (!preview.preview) {
    throw new Error('Missing preview')
  }
  expect(run(store, { operation: 'commit', token: preview.preview.token }).status).toBe('success')
}
function exportFile(store: BusinessDatabase) {
  const result = run(store, { operation: 'export' })
  if (!result.exported) {
    throw new Error(result.message)
  }
  return result.exported
}

describe('real SQLite command audit boundary', () => {
  it('writes enum-only scoped evidence once per request and bumps revision once', () => {
    const store = open()
    const client = seedClient(store)
    const input: CommandAudit = {
      requestId: randomUUID(),
      action: 'client.open',
      status: 'success',
      clientId: client.id
    }
    const before = Number(store.metadata('revision'))
    recordCommandAudit(store, input)
    recordCommandAudit(store, input)
    expect(Number(store.metadata('revision'))).toBe(before + 1)
    const rows = store.db.prepare('SELECT * FROM activity WHERE request_id=?').all(input.requestId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      operation: 'command:client.open:success',
      entity_id: client.id,
      client_id: client.id
    })
    expect(JSON.stringify(rows)).not.toContain(client.name)
    expect(() => recordCommandAudit(store, { ...input, status: 'failed' })).toThrow('conflicts')
    expect(Number(store.metadata('revision'))).toBe(before + 1)
  })
  it('rejects invalid clients, unknown actions and raw transcript fields without recording them', () => {
    const store = open()
    const input: CommandAudit = {
      requestId: randomUUID(),
      action: 'unresolved',
      status: 'rejected',
      clientId: null
    }
    expect(() => recordCommandAudit(store, { ...input, clientId: randomUUID() })).toThrow(
      'existing client'
    )
    expect(() => recordCommandAudit(store, { ...input, action: 'shell.execute' })).toThrow()
    expect(() => recordCommandAudit(store, { ...input, transcript: 'private text' })).toThrow()
    expect(store.snapshot().activity).toHaveLength(0)
    expect(store.metadata('revision')).toBe('0')
  })
  it('round trips scoped/global foreign-owner audit and deduplicates request replay after restore', () => {
    const source = open()
    const client = seedClient(source)
    const scoped: CommandAudit = {
      requestId: randomUUID(),
      action: 'project.list',
      status: 'success',
      clientId: client.id
    }
    const global: CommandAudit = {
      requestId: randomUUID(),
      action: 'unresolved',
      status: 'needs-choice',
      clientId: null
    }
    recordCommandAudit(source, scoped)
    recordCommandAudit(source, global)
    const content = exportFile(source)
    const target = open()
    restore(target, content)
    restore(target, content)
    const before = target.metadata('revision')
    recordCommandAudit(target, scoped)
    recordCommandAudit(target, global)
    expect(target.metadata('revision')).toBe(before)
    expect(
      target.db.prepare("SELECT * FROM activity WHERE operation LIKE 'command:%'").all()
    ).toHaveLength(2)
  })
  it('refuses malformed audit scope or unknown status in a recomputed-digest backup', () => {
    const source = open()
    const client = seedClient(source)
    recordCommandAudit(source, {
      requestId: randomUUID(),
      action: 'client.open',
      status: 'success',
      clientId: client.id
    })
    for (const mode of ['scope', 'status']) {
      const backup = backupSchema.parse(JSON.parse(exportFile(source)))
      const audit = backup.activity.find((entry) => entry.operation.startsWith('command:'))
      if (!audit) {
        throw new Error('Missing audit')
      }
      if (mode === 'scope') {
        audit.entityId = randomUUID()
      } else {
        audit.operation = 'command:client.open:private-text'
      }
      const { digest: _digest, ...body } = backup
      const target = open()
      const result = run(target, {
        operation: 'import-preview',
        mode: 'merge',
        content: JSON.stringify({ ...body, digest: digest(body) })
      })
      expect(result.status).toBe('failed')
      expect(target.snapshot().records).toHaveLength(0)
    }
  })
  it('retains audited client deletion history across backup restore', () => {
    const source = open()
    const client = seedClient(source)
    recordCommandAudit(source, {
      requestId: randomUUID(),
      action: 'client.open',
      status: 'success',
      clientId: client.id
    })
    expect(
      run(source, { operation: 'archive', id: client.id, revision: 1, archived: true }).status
    ).toBe('success')
    const preview = run(source, {
      operation: 'preview',
      mutations: [{ operation: 'delete', id: client.id, revision: 2 }]
    })
    if (!preview.preview) {
      throw new Error(preview.message)
    }
    expect(run(source, { operation: 'commit', token: preview.preview.token }).status).toBe(
      'success'
    )
    const target = open()
    restore(target, exportFile(source))
    expect(target.snapshot().records).toHaveLength(0)
    expect(
      target.db
        .prepare("SELECT * FROM activity WHERE operation='command:client.open:success'")
        .all()
    ).toHaveLength(1)
  })
})
