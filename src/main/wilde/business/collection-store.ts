import { randomUUID } from 'node:crypto'
import type { BusinessDatabase } from './database'
import type { CaptureCheckpoint, CollectorPage } from '../n8n/connector-types'
import { recordSchema, type Workflow } from '../../../shared/wilde/domain'
import { writeRecord } from './record-integrity'

export function commitCollectedPage(store: BusinessDatabase, page: CollectorPage): void {
  store.transaction(() => {
    const base = () => ({
      id: randomUUID(),
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null
    })
    for (const observed of page.workflows ?? []) {
      const row = store.db
        .prepare('SELECT body FROM records WHERE unique_key=?')
        .get(`workflow:${page.instanceId}:${observed.workflowId}`)
      const previous = row ? recordSchema.parse(JSON.parse(String(row.body))) : undefined
      const record = recordSchema.parse({
        ...base(),
        type: 'workflow',
        purpose: '',
        environment: 'unknown',
        maintainer: '',
        ownership: 'unassigned',
        clientId: null,
        projectId: null,
        ...previous,
        ...observed,
        instanceId: page.instanceId,
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: previous?.updatedAt ?? observed.observedAt
      })
      writeRecord(store.db, record)
    }
    for (const observed of page.executions ?? []) {
      const row = store.db
        .prepare('SELECT body FROM records WHERE unique_key=?')
        .get(`execution:${page.instanceId}:${observed.executionId}`)
      const previous = row ? recordSchema.parse(JSON.parse(String(row.body))) : undefined
      const workflowRow = store.db
        .prepare('SELECT body FROM records WHERE unique_key=?')
        .get(`workflow:${page.instanceId}:${observed.workflowId}`)
      const workflow = workflowRow
        ? recordSchema.parse(JSON.parse(String(workflowRow.body)))
        : undefined
      const attribution =
        workflow?.type === 'workflow'
          ? workflowAtStart(store, workflow, observed.startedAt)
          : undefined
      const record = recordSchema.parse({
        ...base(),
        type: 'execution',
        ...observed,
        instanceId: page.instanceId,
        id: previous?.id ?? randomUUID(),
        createdAt: previous?.createdAt ?? observed.observedAt,
        updatedAt: observed.observedAt,
        revision: (previous?.revision ?? 0) + 1,
        clientId:
          previous && 'clientId' in previous ? previous.clientId : (attribution?.clientId ?? null),
        projectId:
          previous && 'projectId' in previous
            ? previous.projectId
            : (attribution?.projectId ?? null),
        assignmentRevision:
          previous?.type === 'execution'
            ? previous.assignmentRevision
            : (attribution?.revision ?? null)
      })
      writeRecord(store.db, record)
    }
    store.db
      .prepare(
        'INSERT INTO checkpoints VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body'
      )
      .run(page.instanceId, JSON.stringify(page.checkpoint))
    store.db
      .prepare(
        "DELETE FROM records WHERE kind='execution' AND json_extract(body,'$.observedAt') < ?"
      )
      .run(new Date(Date.now() - 365 * 86400000).toISOString())
    store.bumpRevision()
  })
}
function workflowAtStart(
  store: BusinessDatabase,
  current: Workflow,
  startedAt: string | null
): Workflow | undefined {
  if (!startedAt) {
    return undefined
  }
  const versions = store.db
    .prepare('SELECT body FROM history WHERE entity_id=? ORDER BY sequence')
    .all(current.id)
    .map((row) => recordSchema.parse(JSON.parse(String(row.body))))
  // Inventory refreshes do not establish ownership; only explicit assignment revisions do.
  const candidates = [...versions, current]
    .filter(
      (row): row is Workflow =>
        row.type === 'workflow' && Date.parse(row.updatedAt) <= Date.parse(startedAt)
    )
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt) || a.revision - b.revision)
  const owner = candidates.at(-1)
  return owner?.ownership === 'exclusive' ? owner : undefined
}
export function readCaptureCheckpoint(
  store: BusinessDatabase,
  instanceId: string
): CaptureCheckpoint | null {
  const row = store.db.prepare('SELECT body FROM checkpoints WHERE id=?').get(instanceId)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the collector writes this internal table.
  return row ? (JSON.parse(String(row.body)) as CaptureCheckpoint) : null
}
export function pendingExecutionIds(
  store: BusinessDatabase,
  instanceId: string,
  limit: number
): string[] {
  return store.db
    .prepare(`SELECT json_extract(body,'$.executionId') AS id FROM records WHERE kind='execution'
    AND json_extract(body,'$.instanceId')=? AND json_extract(body,'$.status') NOT IN ('success','error','crashed','canceled') LIMIT ?`)
    .all(instanceId, Math.max(1, Math.min(limit, 100)))
    .map((row) => String(row.id))
}
