import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { BusinessDatabase } from './database'
import {
  newRecordFields,
  type Client,
  type DeliveryProject,
  type Knowledge
} from '../../../shared/wilde/domain'
import type { BusinessRequest } from '../../../shared/wilde/commands'

const stores: BusinessDatabase[] = []
function open(
  file = join(mkdtempSync(join(tmpdir(), 'wilde-business-test-')), 'business.sqlite')
): BusinessDatabase {
  const store = new BusinessDatabase(file)
  stores.push(store)
  return store
}
function run(
  store: BusinessDatabase,
  command: BusinessRequest['command'],
  requestId = randomUUID()
) {
  return store.execute({ requestId, command })
}
function client(name = 'Maritime Solar'): Client {
  return {
    ...newRecordFields(),
    type: 'client',
    name,
    kind: 'external',
    status: 'active',
    owner: '',
    contacts: '',
    tags: [],
    notes: '',
    links: []
  }
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close()
    } catch {
      /* Already closed during restart. */
    }
  }
})
describe('real business SQLite', () => {
  it('persists the first client/project/note journey and exact workspace identity across reopen', () => {
    const store = open()
    const customer = client()
    expect(run(store, { operation: 'save', record: customer }).status).toBe('success')
    const project: DeliveryProject = {
      ...newRecordFields(),
      type: 'project',
      clientId: customer.id,
      title: 'Checklist',
      outcome: 'Repeatable delivery',
      status: 'active',
      priority: 'normal',
      nextAction: 'Review',
      dueDate: null,
      milestones: '',
      links: []
    }
    expect(run(store, { operation: 'save', record: project }).status).toBe('success')
    const note: Knowledge = {
      ...newRecordFields(),
      type: 'knowledge',
      clientId: customer.id,
      projectId: project.id,
      title: 'Delivery decision',
      body: 'Keep the existing process.',
      kind: 'decision',
      state: 'curated',
      provenance: 'Operator',
      url: null
    }
    expect(run(store, { operation: 'save', record: note }).status).toBe('success')
    expect(
      run(store, {
        operation: 'save',
        record: {
          ...newRecordFields(),
          type: 'assignment',
          clientId: customer.id,
          projectId: project.id,
          reason: 'Delivery',
          target: {
            kind: 'worktree',
            ownerId: store.metadata('ownerId'),
            hostId: 'ssh:fixture',
            stableId: 'wt2:ssh:immutable',
            name: 'Checklist',
            locator: 'old-path'
          }
        }
      }).status
    ).toBe('success')
    store.close()
    const reopened = open(store.file)
    expect(reopened.snapshot(customer.id).records).toHaveLength(4)
    expect(reopened.snapshot().records.find((record) => record.id === note.id)).toMatchObject({
      body: note.body
    })
    expect(
      reopened.snapshot().records.find((record) => record.type === 'assignment')
    ).toMatchObject({ target: { stableId: 'wt2:ssh:immutable', hostId: 'ssh:fixture' } })
  })
  it('rejects cross-client projects, archive writes, stale revisions and changed retry payloads', () => {
    const store = open()
    const a = client()
    const b = client('Other')
    const requestId = randomUUID()
    expect(run(store, { operation: 'save', record: a }, requestId).status).toBe('success')
    expect(run(store, { operation: 'save', record: a }, requestId).status).toBe('success')
    expect(run(store, { operation: 'save', record: b }, requestId).status).toBe('failed')
    run(store, { operation: 'save', record: b })
    expect(run(store, { operation: 'save', record: { ...a, name: 'Stale' } }).status).toBe(
      'stale-context'
    )
    run(store, { operation: 'archive', id: a.id, revision: 1, archived: true })
    const note: Knowledge = {
      ...newRecordFields(),
      type: 'knowledge',
      clientId: a.id,
      projectId: null,
      title: 'Blocked',
      body: '',
      kind: 'note',
      state: 'curated',
      provenance: '',
      url: null
    }
    expect(run(store, { operation: 'save', record: note }).status).toBe('failed')
    expect(store.snapshot().records).toHaveLength(2)
  })
  it('previews and restores a backup atomically, keeps foreign targets unresolved and rejects corrupt digest', () => {
    const original = open()
    const a = client()
    run(original, { operation: 'save', record: a })
    const content = run(original, { operation: 'export' }).exported!
    const restored = open()
    const preview = run(restored, { operation: 'import-preview', content, mode: 'merge' })
    expect(preview.status).toBe('needs-confirmation')
    expect(restored.snapshot().records).toHaveLength(0)
    expect(run(restored, { operation: 'commit', token: preview.preview!.token }).status).toBe(
      'success'
    )
    expect(restored.snapshot().records).toEqual(original.snapshot().records)
    expect(restored.metadata('ownerId')).not.toBe(original.metadata('ownerId'))
    expect(
      run(restored, {
        operation: 'import-preview',
        content: content.replace('Maritime Solar', 'Other Customer'),
        mode: 'replace'
      }).status
    ).toBe('failed')
    expect(restored.snapshot().records).toEqual(original.snapshot().records)
  })
  it('imports outcomes idempotently and refuses conflicting evidence without partial changes', () => {
    const store = open()
    const a = client()
    run(store, { operation: 'save', record: a })
    const event = {
      clientId: a.id,
      projectId: null,
      eventType: 'enquiry_received',
      occurredAt: new Date().toISOString(),
      sourceNamespace: 'fixture',
      sourceReference: 'form:123',
      idempotencyKey: '123',
      workflowId: null,
      executionId: null,
      correctsId: null,
      voidsId: null
    }
    const content = JSON.stringify({ format: 'wilde-outcomes', version: 1, events: [event] })
    const preview = run(store, { operation: 'import-preview', content, mode: 'outcomes' })
    expect(preview.preview?.adds).toBe(1)
    expect(run(store, { operation: 'commit', token: preview.preview!.token }).status).toBe(
      'success'
    )
    expect(
      run(store, { operation: 'import-preview', content, mode: 'outcomes' }).preview?.skips
    ).toBe(1)
    expect(
      run(store, {
        operation: 'import-preview',
        content: content.replace('enquiry_received', 'job_scheduled'),
        mode: 'outcomes'
      }).status
    ).toBe('failed')
    expect(store.snapshot().records.filter((record) => record.type === 'outcome')).toHaveLength(1)
  })
})
