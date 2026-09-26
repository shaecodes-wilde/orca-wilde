import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { BusinessDatabase } from './database'
import { backupSchema, digest, parseBackup, type BusinessBackup } from './backup'
import {
  newRecordFields,
  type Client,
  type Workflow,
  type DeliveryProject
} from '../../../shared/wilde/domain'

const stores: BusinessDatabase[] = []
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }
})
function open() {
  const store = new BusinessDatabase(
    join(mkdtempSync(join(tmpdir(), 'wilde-backup-integrity-')), 'business.sqlite')
  )
  stores.push(store)
  return store
}
function client(name: string): Client {
  return {
    ...newRecordFields(),
    revision: 1,
    type: 'client',
    name,
    kind: 'internal',
    status: 'active',
    owner: '',
    contacts: '',
    tags: [],
    notes: '',
    links: []
  }
}
function example(): BusinessBackup {
  const first = client('Disposable A')
  const second = client('Disposable B')
  const project: DeliveryProject = {
    ...newRecordFields(),
    revision: 2,
    type: 'project',
    clientId: second.id,
    title: 'Moved project',
    outcome: '',
    status: 'active',
    priority: 'normal',
    nextAction: '',
    dueDate: null,
    milestones: '',
    links: []
  }
  const workflow: Workflow = {
    ...newRecordFields(),
    revision: 3,
    type: 'workflow',
    instanceId: randomUUID(),
    workflowId: 'source-fixture',
    title: 'Disposable workflow',
    active: true,
    observedAt: new Date().toISOString(),
    purpose: '',
    environment: 'test',
    maintainer: '',
    ownership: 'exclusive',
    clientId: second.id,
    projectId: project.id
  }
  const at = new Date().toISOString()
  return {
    format: 'wilde-business',
    version: 1,
    sourceOwnerId: randomUUID(),
    exportedAt: at,
    records: [first, second, project, workflow],
    history: [
      {
        entityId: project.id,
        clientId: first.id,
        at,
        record: { ...project, revision: 1, clientId: first.id }
      },
      {
        entityId: workflow.id,
        clientId: first.id,
        at,
        record: { ...workflow, revision: 1, clientId: first.id }
      },
      {
        entityId: workflow.id,
        clientId: second.id,
        at,
        record: { ...workflow, revision: 2, clientId: second.id }
      }
    ],
    activity: [
      {
        id: randomUUID(),
        requestId: randomUUID(),
        operation: 'save',
        entityId: workflow.id,
        clientId: first.id,
        at
      }
    ],
    checkpoints: [
      {
        instanceId: workflow.instanceId,
        checkpoint: {
          generation: randomUUID(),
          resource: 'executions',
          cursor: 'non-durable-cursor',
          startedAt: at,
          lastSuccess: at,
          oldestObserved: at,
          incomplete: false,
          message: 'Source fixture'
        }
      }
    ],
    digest: '0'.repeat(64)
  }
}
function encode(backup: BusinessBackup): string {
  const { digest: _digest, ...body } = backupSchema.parse(backup)
  return JSON.stringify({ ...body, digest: digest(body) })
}
function preview(store: BusinessDatabase, backup: BusinessBackup) {
  return store.execute({
    requestId: randomUUID(),
    command: { operation: 'import-preview', mode: 'merge', content: encode(backup) }
  })
}
function merge(store: BusinessDatabase, backup: BusinessBackup) {
  const result = preview(store, backup)
  expect(result.status, result.message).toBe('needs-confirmation')
  if (!result.preview) {
    throw new Error('No preview')
  }
  const saved = store.execute({
    requestId: randomUUID(),
    command: { operation: 'commit', token: result.preview.token }
  })
  expect(saved.status, saved.message).toBe('success')
}

describe('real SQLite backup evidence integrity', () => {
  it.each(['entity', 'client', 'type'])(
    'rejects digest-valid history %s poisoning without applying records',
    (field) => {
      const store = open()
      const backup = example()
      const row = backup.history[1]
      if (field === 'entity') {
        row.entityId = backup.records[0].id
      }
      if (field === 'client') {
        row.clientId = backup.records[1].id
      }
      if (field === 'type') {
        row.record = { ...client('Injected'), id: row.entityId }
        row.clientId = row.entityId
      }
      expect(preview(store, backup).status).toBe('failed')
      expect(store.snapshot().records).toHaveLength(0)
      expect(store.db.prepare('SELECT * FROM history').all()).toHaveLength(0)
    }
  )
  it.each(['records', 'activity', 'checkpoints', 'history'] as const)(
    'rejects duplicate %s stable identities even with a recomputed digest',
    (key) => {
      const backup = example()
      if (key === 'records') {
        backup.records.push(structuredClone(backup.records[0]))
      }
      if (key === 'activity') {
        backup.activity.push(structuredClone(backup.activity[0]))
      }
      if (key === 'checkpoints') {
        backup.checkpoints.push(structuredClone(backup.checkpoints[0]))
      }
      if (key === 'history') {
        backup.history.push(structuredClone(backup.history[0]))
      }
      expect(() => parseBackup(encode(backup))).toThrow('Duplicate')
    }
  )
  it('preserves moved-client history and same-timestamp revisions; repeated merge is idempotent', () => {
    const store = open()
    const backup = example()
    merge(store, backup)
    merge(store, backup)
    expect(store.snapshot().records).toHaveLength(4)
    expect(store.db.prepare('SELECT * FROM history').all()).toHaveLength(3)
    expect(
      store.db.prepare('SELECT * FROM activity WHERE id=?').all(backup.activity[0].id)
    ).toHaveLength(1)
    const checkpoint = store.db.prepare('SELECT body FROM checkpoints').get()
    expect(JSON.parse(String(checkpoint?.body))).toMatchObject({ cursor: null, incomplete: true })
  })
  it.each(['history', 'activity', 'checkpoint'])(
    'rejects conflicting existing %s evidence and rolls back preceding new records',
    (kind) => {
      const store = open()
      const original = example()
      merge(store, original)
      const conflicting = structuredClone(original)
      conflicting.records.push(client('Must roll back'))
      if (kind === 'history') {
        const history = conflicting.history[1]
        if (history.record.type === 'workflow') {
          history.record.purpose = 'Conflicting historical evidence'
        }
      }
      if (kind === 'activity') {
        conflicting.activity[0].operation = 'archive'
      }
      if (kind === 'checkpoint') {
        conflicting.checkpoints[0].checkpoint.generation = randomUUID()
      }
      expect(preview(store, conflicting).status).toBe('failed')
      expect(store.snapshot().records).toHaveLength(4)
      expect(store.db.prepare('SELECT * FROM history').all()).toHaveLength(3)
    }
  )
  it('round trips deleted-client audit records and imported foreign owner activity', () => {
    const store = open()
    const backup = example()
    const deletedId = randomUUID()
    backup.activity.push(
      {
        id: randomUUID(),
        requestId: randomUUID(),
        operation: 'save',
        entityId: deletedId,
        clientId: deletedId,
        at: backup.exportedAt
      },
      {
        id: randomUUID(),
        requestId: randomUUID(),
        operation: 'delete',
        entityId: deletedId,
        clientId: deletedId,
        at: backup.exportedAt
      },
      {
        id: randomUUID(),
        requestId: randomUUID(),
        operation: 'import',
        entityId: randomUUID(),
        clientId: null,
        at: backup.exportedAt
      }
    )
    merge(store, backup)
    merge(store, backup)
    expect(
      store.db.prepare('SELECT * FROM activity WHERE entity_id=?').all(deletedId)
    ).toHaveLength(2)
  })
})
