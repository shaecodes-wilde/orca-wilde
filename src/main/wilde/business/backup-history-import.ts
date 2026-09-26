import type { BusinessDatabase } from './database'
import { backupSchema, digest, historicalScope, type BusinessBackup } from './backup'
import { readRecord } from './record-integrity'
import { recordSchema, type BusinessRecord } from '../../../shared/wilde/domain'
import { commandAuditSchema } from '../../../shared/wilde/commands'

const checkpointSchema = backupSchema.shape.checkpoints.element.shape.checkpoint
const activitySchema = backupSchema.shape.activity.element
function normalizedCheckpoint(value: unknown) {
  return {
    ...checkpointSchema.parse(value),
    cursor: null,
    incomplete: true,
    message: 'Restored capture history; reconnect explicitly. Source history may have changed.'
  }
}

function validateHistoricalRecord(store: BusinessDatabase, record: BusinessRecord): void {
  const current = readRecord(store.db, record.id)
  if (!current || current.type !== record.type || current.revision <= record.revision) {
    throw new Error('History has an invalid entity, type or revision.')
  }
  const clientId = historicalScope(record)
  if (clientId && readRecord(store.db, clientId)?.type !== 'client') {
    throw new Error('Historical evidence references an invalid client.')
  }
  if (
    'projectId' in record &&
    record.projectId &&
    readRecord(store.db, record.projectId)?.type !== 'project'
  ) {
    throw new Error('Historical evidence references an invalid delivery project.')
  }
  if (
    record.type === 'workflow' &&
    current.type === 'workflow' &&
    (record.instanceId !== current.instanceId || record.workflowId !== current.workflowId)
  ) {
    throw new Error('Workflow history cannot change source identity.')
  }
  if (
    record.type === 'workflow' &&
    (record.ownership === 'exclusive') !== Boolean(record.clientId)
  ) {
    throw new Error('Workflow history has invalid client attribution.')
  }
}

function importHistory(store: BusinessDatabase, backup: BusinessBackup): void {
  for (const entry of backup.history) {
    if (entry.entityId !== entry.record.id || entry.clientId !== historicalScope(entry.record)) {
      throw new Error('History identity or client scope does not match its record.')
    }
    validateHistoricalRecord(store, entry.record)
    const prior = store.db
      .prepare(
        "SELECT client_id,at,body FROM history WHERE entity_id=? AND json_extract(body,'$.revision')=?"
      )
      .all(entry.entityId, entry.record.revision)
    if (
      prior.length > 1 ||
      prior.some((row) => {
        const value = {
          entityId: entry.entityId,
          clientId: row.client_id === null ? null : String(row.client_id),
          at: String(row.at),
          record: recordSchema.parse(JSON.parse(String(row.body)))
        }
        return digest(value) !== digest(entry)
      })
    ) {
      throw new Error('History revision conflicts with existing evidence.')
    }
    if (!prior.length) {
      store.db
        .prepare('INSERT INTO history(entity_id,client_id,at,body) VALUES (?,?,?,?)')
        .run(entry.entityId, entry.clientId, entry.at, JSON.stringify(entry.record))
    }
  }
}

function validateActivityScope(
  store: BusinessDatabase,
  backup: BusinessBackup,
  entry: BusinessBackup['activity'][number]
): void {
  if (entry.operation.startsWith('command:')) {
    const [, action, status, ...extra] = entry.operation.split(':')
    const audit = commandAuditSchema.safeParse({
      requestId: entry.requestId,
      action,
      status,
      clientId: entry.clientId
    })
    if (!audit.success || extra.length) {
      throw new Error('Unsupported command audit evidence.')
    }
    if (entry.clientId !== null) {
      const client = readRecord(store.db, entry.clientId)
      const deletedClient =
        !client &&
        (backup.activity.some(
          (value) =>
            value.operation === 'delete' &&
            value.entityId === entry.clientId &&
            value.clientId === entry.clientId
        ) ||
          !!store.db
            .prepare(
              "SELECT 1 FROM activity WHERE operation='delete' AND entity_id=? AND client_id=? LIMIT 1"
            )
            .get(entry.clientId, entry.clientId))
      if (entry.entityId !== entry.clientId || (client?.type !== 'client' && !deletedClient)) {
        throw new Error('Command audit client scope conflicts with its entity.')
      }
    }
    if (
      store.db
        .prepare('SELECT 1 FROM activity WHERE request_id=? AND id<>? LIMIT 1')
        .get(entry.requestId, entry.id)
    ) {
      throw new Error('Command audit request ID conflicts with existing evidence.')
    }
    return
  }
  if (entry.operation === 'import') {
    if (entry.clientId !== null) {
      throw new Error('Import activity cannot claim a client scope.')
    }
    return
  }
  const current = readRecord(store.db, entry.entityId)
  const history = store.db
    .prepare('SELECT body FROM history WHERE entity_id=?')
    .all(entry.entityId)
    .map((row) => recordSchema.parse(JSON.parse(String(row.body))))
  if (current || history.length) {
    const versions = [...history, ...(current ? [current] : [])]
    if (!versions.some((record) => historicalScope(record) === entry.clientId)) {
      throw new Error('Activity client scope conflicts with record history.')
    }
    return
  }
  const deleted =
    backup.activity.some(
      (value) =>
        value.operation === 'delete' &&
        value.entityId === entry.entityId &&
        value.clientId === entry.clientId
    ) ||
    !!store.db
      .prepare(
        "SELECT 1 FROM activity WHERE operation='delete' AND entity_id=? AND client_id IS ? LIMIT 1"
      )
      .get(entry.entityId, entry.clientId)
  if (!deleted) {
    throw new Error('Activity refers to a missing entity without deletion evidence.')
  }
}

export function applyBackupEvidence(store: BusinessDatabase, backup: BusinessBackup): void {
  importHistory(store, backup)
  for (const entry of backup.activity) {
    if (
      store.db
        .prepare(
          "SELECT 1 FROM activity WHERE request_id=? AND id<>? AND operation LIKE 'command:%' LIMIT 1"
        )
        .get(entry.requestId, entry.id)
    ) {
      throw new Error('Command audit request ID conflicts with existing evidence.')
    }
    validateActivityScope(store, backup, entry)
    const prior = store.db.prepare('SELECT * FROM activity WHERE id=?').get(entry.id)
    if (prior) {
      const existing = activitySchema.parse({
        id: prior.id,
        requestId: prior.request_id,
        operation: prior.operation,
        entityId: prior.entity_id,
        clientId: prior.client_id,
        at: prior.at
      })
      if (digest(existing) !== digest(entry)) {
        throw new Error('Activity identity conflicts with existing evidence.')
      }
    } else {
      store.db
        .prepare('INSERT INTO activity VALUES (?,?,?,?,?,?)')
        .run(entry.id, entry.requestId, entry.operation, entry.entityId, entry.clientId, entry.at)
    }
  }
  for (const entry of backup.checkpoints) {
    const normalized = normalizedCheckpoint(entry.checkpoint)
    const prior = store.db.prepare('SELECT body FROM checkpoints WHERE id=?').get(entry.instanceId)
    if (prior) {
      if (digest(normalizedCheckpoint(JSON.parse(String(prior.body)))) !== digest(normalized)) {
        throw new Error('Capture checkpoint conflicts with existing evidence.')
      }
      store.db
        .prepare('UPDATE checkpoints SET body=? WHERE id=?')
        .run(JSON.stringify(normalized), entry.instanceId)
    } else {
      store.db
        .prepare('INSERT INTO checkpoints VALUES (?,?)')
        .run(entry.instanceId, JSON.stringify(normalized))
    }
  }
}
