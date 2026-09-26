import type SyncDatabase from '../../sqlite/sync-database'
import { recordSchema, targetKey, type BusinessRecord } from '../../../shared/wilde/domain'

export function readRecord(db: SyncDatabase, id: string): BusinessRecord | undefined {
  const row = db.prepare('SELECT body FROM records WHERE id = ?').get(id)
  return row ? recordSchema.parse(JSON.parse(String(row.body))) : undefined
}
export function uniqueRecordKey(record: BusinessRecord): string | null {
  switch (record.type) {
    case 'assignment':
      return record.archivedAt ? null : `target:${targetKey(record.target)}`
    case 'workflow':
      return `workflow:${record.instanceId}:${record.workflowId}`
    case 'execution':
      return `execution:${record.instanceId}:${record.executionId}`
    case 'outcome':
      return `outcome:${JSON.stringify([record.sourceNamespace, record.idempotencyKey])}`
    case 'client':
    case 'knowledge':
    case 'project':
    case 'task':
      return null
  }
}
export function validateRecordRelations(
  db: SyncDatabase,
  record: BusinessRecord,
  importing = false
): void {
  if ('clientId' in record && record.clientId) {
    const client = readRecord(db, record.clientId)
    if (client?.type !== 'client') {
      throw new Error('Select an existing owner.')
    }
    if (client.archivedAt && !importing) {
      throw new Error('Restore the owner before adding or changing work.')
    }
  }
  if ('projectId' in record && record.projectId) {
    const project = readRecord(db, record.projectId)
    const delivery = record.type === 'knowledge' && ['delivery', 'handoff'].includes(record.kind)
    const prior = delivery ? readRecord(db, record.id) : undefined
    const historical =
      (importing && (record.type === 'execution' || record.type === 'outcome' || delivery)) ||
      (delivery &&
        prior?.type === 'knowledge' &&
        prior.clientId === record.clientId &&
        prior.projectId === record.projectId)
    if (project?.type !== 'project' || (!historical && project.clientId !== record.clientId)) {
      throw new Error('The delivery project must belong to the selected owner.')
    }
    if (project.archivedAt && !importing) {
      throw new Error('Restore the delivery project before changing work.')
    }
  }
  if (
    record.type === 'workflow' &&
    (record.ownership === 'exclusive') !== Boolean(record.clientId)
  ) {
    throw new Error(
      'Exclusive workflow ownership requires an owner; shared/unassigned workflows cannot claim one owner.'
    )
  }
  if (record.type === 'outcome') {
    if (record.workflowId) {
      const workflow = readRecord(db, record.workflowId)
      if (
        workflow?.type !== 'workflow' ||
        (!importing && workflow.ownership === 'exclusive' && workflow.clientId !== record.clientId)
      ) {
        throw new Error('Outcome workflow ownership does not match the owner.')
      }
    }
    for (const reference of [record.correctsId, record.voidsId]) {
      if (!reference) {
        continue
      }
      const original = readRecord(db, reference)
      if (
        original?.type !== 'outcome' ||
        original.clientId !== record.clientId ||
        original.id === record.id
      ) {
        throw new Error('Correction must reference an existing outcome for this owner.')
      }
    }
  }
}
export function writeRecord(db: SyncDatabase, record: BusinessRecord): void {
  db.prepare(`INSERT INTO records (id,kind,client_id,project_id,revision,body,unique_key)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,
    client_id=excluded.client_id,project_id=excluded.project_id,revision=excluded.revision,
    body=excluded.body,unique_key=excluded.unique_key`).run(
    record.id,
    record.type,
    'clientId' in record ? record.clientId : null,
    'projectId' in record &&
      record.type !== 'execution' &&
      record.type !== 'outcome' &&
      !(record.type === 'knowledge' && ['delivery', 'handoff'].includes(record.kind))
      ? record.projectId
      : null,
    record.revision,
    JSON.stringify(record),
    uniqueRecordKey(record)
  )
}
