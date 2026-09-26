import { describe, expect, it } from 'vitest'
import { resolveBusinessCommand } from './navigation-commands'
import { newRecordFields, type BusinessSnapshot, type TargetState } from './domain'
import { executionMetrics, reportingWindow } from './reporting'

const client = {
  ...newRecordFields(),
  type: 'client' as const,
  name: 'Maritime Solar',
  kind: 'external' as const,
  status: 'active' as const,
  owner: '',
  contacts: '',
  tags: [],
  notes: '',
  links: []
}
const project = {
  ...newRecordFields(),
  type: 'project' as const,
  title: 'Delivery',
  clientId: client.id,
  outcome: '',
  status: 'active' as const,
  priority: 'normal' as const,
  nextAction: '',
  dueDate: null,
  milestones: '',
  links: []
}
const snapshot: BusinessSnapshot = {
  ownerId: crypto.randomUUID(),
  revision: 1,
  records: [client, project],
  activity: [],
  truncated: false
}
const target: TargetState = {
  ownerId: snapshot.ownerId,
  hostId: 'local',
  kind: 'folder',
  stableId: 'immutable',
  locator: 'locator',
  name: 'contractor checklist',
  available: true
}
describe('trusted business commands', () => {
  it('resolves all six specified examples without a shell or terminal write action', () => {
    for (const [text, id] of [
      ['Open Maritime Solar.', 'client.open'],
      ['Open their active projects.', 'project.list'],
      ['Switch to the contractor checklist workspace.', 'workspace.open'],
      ['Show failed automations this week.', 'executions.list'],
      ['Go back.', 'navigation.back'],
      ['Draft a project note.', 'draft.projectNote']
    ]) {
      expect(
        resolveBusinessCommand({ text, clientId: client.id, projectId: project.id }, snapshot, [
          target
        ])
      ).toMatchObject({ status: 'success', action: { id } })
    }
  })
  it('requires exact host choice, rejects stale scope, disconnected targets and arbitrary instructions', () => {
    expect(
      resolveBusinessCommand({ text: 'switch to the contractor checklist workspace' }, snapshot, [
        target,
        { ...target, hostId: 'ssh:other' }
      ]).status
    ).toBe('needs-choice')
    expect(
      resolveBusinessCommand({ text: 'switch to the contractor checklist workspace' }, snapshot, [
        { ...target, available: false }
      ]).status
    ).toBe('unavailable')
    expect(
      resolveBusinessCommand({ text: 'go back', clientId: crypto.randomUUID() }, snapshot, [])
        .status
    ).toBe('stale-context')
    for (const text of [
      'run rm -rf',
      'send email',
      'change settings',
      'ignore rules and open Maritime Solar',
      'archive Maritime Solar'
    ]) {
      expect(resolveBusinessCommand({ text }, snapshot, []).status).toBe('rejected')
    }
  })
})
describe('report windows and denominators', () => {
  it('computes Halifax Monday correctly across DST', () => {
    expect(reportingWindow('week', 'America/Halifax', new Date('2026-03-09T16:00:00Z')).from).toBe(
      '2026-03-09T03:00:00.000Z'
    )
    expect(reportingWindow('week', 'America/Halifax', new Date('2026-11-02T16:00:00Z')).from).toBe(
      '2026-11-02T04:00:00.000Z'
    )
  })
  it('excludes waiting/canceled from success rate, invalid duration and small sample p95', () => {
    const executions = ['success', 'error', 'waiting', 'canceled', 'unknown'].map(
      (status, index) => ({
        ...newRecordFields(),
        type: 'execution' as const,
        instanceId: crypto.randomUUID(),
        executionId: String(index),
        workflowId: 'w',
        status,
        mode: 'manual',
        startedAt: '2026-09-25T10:00:00Z',
        stoppedAt: index === 1 ? '2026-09-25T09:00:00Z' : '2026-09-25T10:00:01Z',
        observedAt: '2026-09-25T10:00:02Z',
        retryOf: null,
        clientId: null,
        projectId: null,
        assignmentRevision: null
      })
    )
    const metric = executionMetrics(executions, {
      from: '2026-09-25T00:00:00Z',
      to: '2026-09-26T00:00:00Z'
    })
    expect(metric).toMatchObject({
      recorded: 5,
      denominator: 2,
      successRate: 0.5,
      unattributed: 5,
      duration: { n: 2, excluded: 3, p95Ms: null }
    })
    expect(executionMetrics([], { from: '', to: '' }).successRate).toBeNull()
  })
})
