import { randomUUID } from 'node:crypto'
import { commandAuditSchema } from '../../../shared/wilde/commands'
import type { BusinessDatabase } from './database'
import { readRecord } from './record-integrity'

export function recordCommandAudit(store: BusinessDatabase, input: unknown): void {
  const command = commandAuditSchema.parse(input)
  const operation = `command:${command.action}:${command.status}`
  store.transaction(() => {
    const prior = store.db
      .prepare('SELECT operation,entity_id,client_id FROM activity WHERE request_id=?')
      .all(command.requestId)
    if (prior.length) {
      if (
        prior.length !== 1 ||
        prior[0].operation !== operation ||
        prior[0].client_id !== command.clientId ||
        (command.clientId !== null && prior[0].entity_id !== command.clientId)
      ) {
        throw new Error('Command audit request ID conflicts with an existing action.')
      }
      return
    }
    if (store.db.prepare('SELECT 1 FROM requests WHERE id=?').get(command.requestId)) {
      throw new Error('Command audit request ID was already used for a business mutation.')
    }
    if (command.clientId && readRecord(store.db, command.clientId)?.type !== 'client') {
      throw new Error('Command audit requires an existing client or no client scope.')
    }
    store.db
      .prepare('INSERT INTO activity VALUES (?,?,?,?,?,?)')
      .run(
        randomUUID(),
        command.requestId,
        operation,
        command.clientId ?? store.metadata('ownerId'),
        command.clientId,
        new Date().toISOString()
      )
    store.bumpRevision()
  })
}
