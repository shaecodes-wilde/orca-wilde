import { randomUUID } from 'node:crypto'
import type { BusinessDatabase } from './database'
import { outcomeFileSchema } from '../../../shared/wilde/outcome-file'
import { digest } from './backup'
import { readRecord, validateRecordRelations, writeRecord } from './record-integrity'

export function applyOutcomeImport(
  store: BusinessDatabase,
  content: string,
  requestId: string
): { adds: number; skips: number } {
  if (Buffer.byteLength(content) > 10 * 1024 * 1024) {
    throw new Error('Outcome file exceeds 10 MiB.')
  }
  const file = outcomeFileSchema.parse(JSON.parse(content))
  let adds = 0
  let skips = 0
  for (const event of file.events) {
    const key = `outcome:${JSON.stringify([event.sourceNamespace, event.idempotencyKey])}`
    const existing = store.db.prepare('SELECT id FROM records WHERE unique_key=?').get(key)
    if (existing) {
      const prior = readRecord(store.db, String(existing.id))
      if (prior?.type !== 'outcome') {
        throw new Error('Outcome key conflicts with another record.')
      }
      const priorEvent = outcomeFileSchema.shape.events.element.parse({
        clientId: prior.clientId,
        projectId: prior.projectId,
        eventType: prior.eventType,
        occurredAt: prior.occurredAt,
        sourceNamespace: prior.sourceNamespace,
        sourceReference: prior.sourceReference,
        idempotencyKey: prior.idempotencyKey,
        workflowId: prior.workflowId,
        executionId: prior.executionId,
        correctsId: prior.correctsId,
        voidsId: prior.voidsId
      })
      if (digest(event) !== digest(priorEvent)) {
        throw new Error(
          'Outcome idempotency key has conflicting content. Import a correction with a new key.'
        )
      }
      skips++
      continue
    }
    const now = new Date().toISOString()
    const record = {
      ...event,
      type: 'outcome' as const,
      id: randomUUID(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      receivedAt: now
    }
    validateRecordRelations(store.db, record)
    writeRecord(store.db, record)
    store.db
      .prepare('INSERT INTO activity VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), requestId, 'outcome-import', record.id, record.clientId, now)
    adds++
  }
  return { adds, skips }
}
