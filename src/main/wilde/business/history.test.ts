import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { BusinessDatabase } from './database'
import { commitCollectedPage } from './collection-store'
import {
  newRecordFields,
  type BusinessRecord,
  type Client,
  type Workflow
} from '../../../shared/wilde/domain'
import type { BusinessRequest } from '../../../shared/wilde/commands'

const stores: BusinessDatabase[] = []
function database(): BusinessDatabase {
  const store = new BusinessDatabase(
    join(mkdtempSync(join(tmpdir(), 'wilde-history-')), 'business.sqlite')
  )
  stores.push(store)
  return store
}
function execute(store: BusinessDatabase, command: BusinessRequest['command']) {
  return store.execute({ requestId: randomUUID(), command })
}
function customer(store: BusinessDatabase, name: string): Client {
  const record: Client = {
    ...newRecordFields(),
    type: 'client',
    name,
    kind: 'external',
    status: 'active',
    owner: '',
    contacts: '',
    notes: '',
    tags: [],
    links: []
  }
  expect(execute(store, { operation: 'save', record }).status).toBe('success')
  return record
}
function saved(store: BusinessDatabase, id: string): BusinessRecord {
  return store.snapshot().records.find((record) => record.id === id)!
}
function reviewed(store: BusinessDatabase, record: BusinessRecord) {
  const preview = execute(store, {
    operation: 'preview',
    mutations: [{ operation: 'save', record }]
  })
  expect(preview.status).toBe('needs-confirmation')
  expect(execute(store, { operation: 'commit', token: preview.preview!.token }).status).toBe(
    'success'
  )
}
afterEach(() => {
  vi.useRealTimers()
  for (const store of stores.splice(0)) {
    store.close()
  }
})

it('retains original delivery and outcome attribution when project/workflow move; restores all evidence', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
  const store = database()
  const a = customer(store, 'Client A')
  const b = customer(store, 'Client B')
  const project = {
    ...newRecordFields(),
    type: 'project' as const,
    clientId: a.id,
    title: 'Delivery',
    outcome: '',
    status: 'active' as const,
    priority: 'normal' as const,
    nextAction: '',
    dueDate: null,
    milestones: '',
    links: []
  }
  execute(store, { operation: 'save', record: project })
  const delivery = {
    ...newRecordFields(),
    type: 'knowledge' as const,
    clientId: a.id,
    projectId: project.id,
    title: 'Delivered',
    body: 'Original-client handoff',
    kind: 'delivery' as const,
    state: 'curated' as const,
    provenance: 'Operator',
    url: null
  }
  execute(store, { operation: 'save', record: delivery })
  const instanceId = randomUUID()
  const checkpoint = {
    generation: randomUUID(),
    resource: 'executions' as const,
    cursor: null,
    startedAt: new Date().toISOString(),
    lastSuccess: new Date().toISOString(),
    oldestObserved: null,
    incomplete: true,
    message: 'Fixture capture'
  }
  commitCollectedPage(store, {
    instanceId,
    workflows: [
      {
        workflowId: 'workflow-1',
        title: 'Observed',
        active: true,
        observedAt: new Date().toISOString()
      }
    ],
    checkpoint
  })
  const workflow = store
    .snapshot()
    .records.find((record): record is Workflow => record.type === 'workflow')!
  reviewed(store, { ...workflow, ownership: 'exclusive', clientId: a.id, projectId: project.id })
  vi.setSystemTime(new Date('2026-09-02T12:00:00Z'))
  const event = {
    clientId: a.id,
    projectId: project.id,
    eventType: 'report_delivered',
    occurredAt: new Date().toISOString(),
    sourceNamespace: 'fixture',
    sourceReference: 'delivery-1',
    idempotencyKey: 'delivery-1',
    workflowId: workflow.id,
    executionId: null,
    correctsId: null,
    voidsId: null
  }
  const preview = execute(store, {
    operation: 'import-preview',
    mode: 'outcomes',
    content: JSON.stringify({ format: 'wilde-outcomes', version: 1, events: [event] })
  })
  expect(execute(store, { operation: 'commit', token: preview.preview!.token }).status).toBe(
    'success'
  )
  const observed = {
    executionId: 'run-1',
    workflowId: 'workflow-1',
    status: 'success',
    mode: 'manual',
    startedAt: new Date().toISOString(),
    stoppedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    retryOf: null
  }
  commitCollectedPage(store, { instanceId, executions: [observed], checkpoint })
  vi.setSystemTime(new Date('2026-09-03T12:00:00Z'))
  reviewed(store, { ...project, revision: 1, clientId: b.id })
  expect(saved(store, delivery.id)).toMatchObject({ clientId: a.id })
  expect(saved(store, workflow.id)).toMatchObject({ clientId: b.id })
  commitCollectedPage(store, {
    instanceId,
    executions: [{ ...observed, observedAt: new Date().toISOString() }],
    checkpoint
  })
  expect(
    store
      .snapshot(a.id)
      .records.filter((record) => ['execution', 'outcome', 'knowledge'].includes(record.type))
  ).toHaveLength(3)
  const content = execute(store, { operation: 'export' }).exported!
  const restore = database()
  const restorePreview = execute(restore, { operation: 'import-preview', mode: 'replace', content })
  expect(restorePreview.status).toBe('needs-confirmation')
  expect(
    execute(restore, { operation: 'commit', token: restorePreview.preview!.token }).status
  ).toBe('success')
  expect(restore.snapshot().records.sort((left, right) => left.id.localeCompare(right.id))).toEqual(
    store.snapshot().records.sort((left, right) => left.id.localeCompare(right.id))
  )
  expect(restore.snapshot().activity.length).toBe(store.snapshot().activity.length + 1)
})

it('rolls back failed change sets, refuses stale preview and permits reviewed unreferenced deletion', () => {
  const store = database()
  const client = customer(store, 'Disposable')
  const preview = execute(store, {
    operation: 'preview',
    mutations: [{ operation: 'archive', id: client.id, revision: 1, archived: true }]
  })
  customer(store, 'Concurrent change')
  expect(execute(store, { operation: 'commit', token: preview.preview!.token }).status).toBe(
    'stale-context'
  )
  expect(saved(store, client.id).archivedAt).toBeNull()
  const invalid = execute(store, {
    operation: 'preview',
    mutations: [
      { operation: 'archive', id: client.id, revision: 1, archived: true },
      { operation: 'archive', id: randomUUID(), revision: 0, archived: true }
    ]
  })
  expect(invalid.status).toBe('failed')
  expect(saved(store, client.id).archivedAt).toBeNull()
  execute(store, { operation: 'archive', id: client.id, revision: 1, archived: true })
  const deletion = execute(store, {
    operation: 'preview',
    mutations: [{ operation: 'delete', id: client.id, revision: 2 }]
  })
  expect(deletion.status).toBe('needs-confirmation')
  expect(execute(store, { operation: 'commit', token: deletion.preview!.token }).status).toBe(
    'success'
  )
  expect(store.snapshot().records.some((record) => record.id === client.id)).toBe(false)
})

it('fails closed for a newer schema or corrupt database, without replacing source files', () => {
  const store = database()
  const file = store.file
  store.db.pragma('user_version = 99')
  expect(() => new BusinessDatabase(file)).toThrow('newer app')
  const corrupt = join(mkdtempSync(join(tmpdir(), 'wilde-corrupt-')), 'business.sqlite')
  writeFileSync(corrupt, 'not a database')
  expect(() => new BusinessDatabase(corrupt)).toThrow()
})
