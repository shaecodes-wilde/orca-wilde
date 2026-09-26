import { createHash } from 'node:crypto'
import { z } from 'zod'
import { recordSchema, instant, uuid, type BusinessRecord } from '../../../shared/wilde/domain'
import { SCHEMA_VERSION } from './migrations'
import { uniqueRecordKey } from './record-integrity'

export const backupSchema = z
  .object({
    format: z.literal('wilde-business'),
    version: z.literal(SCHEMA_VERSION),
    sourceOwnerId: uuid,
    exportedAt: instant,
    records: z.array(recordSchema).max(10000),
    activity: z
      .array(
        z
          .object({
            id: uuid,
            requestId: uuid,
            operation: z.string().max(80),
            entityId: uuid,
            clientId: uuid.nullable(),
            at: instant
          })
          .strict()
      )
      .max(10000),
    checkpoints: z
      .array(
        z
          .object({
            instanceId: uuid,
            checkpoint: z
              .object({
                generation: uuid,
                resource: z.enum(['workflows', 'executions']),
                cursor: z.string().max(4096).nullable(),
                startedAt: instant,
                lastSuccess: instant.nullable(),
                oldestObserved: instant.nullable(),
                incomplete: z.boolean(),
                message: z.string().max(2000)
              })
              .strict()
          })
          .strict()
      )
      .max(100),
    history: z
      .array(
        z
          .object({ entityId: uuid, clientId: uuid.nullable(), at: instant, record: recordSchema })
          .strict()
      )
      .max(10000),
    digest: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()
export type BusinessBackup = z.infer<typeof backupSchema>
export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
export function historicalScope(record: BusinessRecord): string | null {
  return 'clientId' in record ? record.clientId : record.type === 'client' ? record.id : null
}
function rejectDuplicate(keys: string[], label: string): void {
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Duplicate ${label} identities in backup.`)
  }
}
export function parseBackup(content: string): BusinessBackup {
  if (Buffer.byteLength(content) > 10 * 1024 * 1024) {
    throw new Error('Import exceeds the 10 MiB limit.')
  }
  const backup = backupSchema.parse(JSON.parse(content))
  const { digest: expected, ...body } = backup
  if (digest(body) !== expected) {
    throw new Error('Backup digest does not match. No records were changed.')
  }
  rejectDuplicate(
    backup.records.map((record) => record.id),
    'record'
  )
  rejectDuplicate(
    backup.records.flatMap((record) => {
      const key = uniqueRecordKey(record)
      return key ? [key] : []
    }),
    'record source'
  )
  rejectDuplicate(
    backup.activity.map((entry) => entry.id),
    'activity'
  )
  rejectDuplicate(
    backup.checkpoints.map((entry) => entry.instanceId),
    'checkpoint'
  )
  rejectDuplicate(
    backup.history.map((entry) => JSON.stringify([entry.entityId, entry.record.revision])),
    'history revision'
  )
  const current = new Map(backup.records.map((record) => [record.id, record]))
  for (const entry of backup.history) {
    const entity = current.get(entry.entityId)
    if (entry.entityId !== entry.record.id || entry.clientId !== historicalScope(entry.record)) {
      throw new Error('History identity or client scope does not match its record.')
    }
    if (!entity || entity.type !== entry.record.type || entry.record.revision >= entity.revision) {
      throw new Error('History must describe an earlier revision of the same existing record type.')
    }
  }
  return backup
}
