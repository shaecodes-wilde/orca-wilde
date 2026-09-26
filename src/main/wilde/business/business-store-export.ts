import type { BusinessDatabase } from './database'
import { SCHEMA_VERSION } from './migrations'
import { recordSchema } from '../../../shared/wilde/domain'
import { digest } from './backup'

export function exportBusinessBackup(store: BusinessDatabase): string {
  return store.transaction(() => {
    const snapshot = store.snapshot()
    const rows = store.db
      .prepare('SELECT entity_id,client_id,at,body FROM history ORDER BY sequence LIMIT 10001')
      .all()
    if (snapshot.truncated || rows.length > 10000) {
      throw new Error('Backup exceeds the 10,000-record limit. Contact support before exporting.')
    }
    const body = {
      format: 'wilde-business' as const,
      version: SCHEMA_VERSION,
      sourceOwnerId: snapshot.ownerId,
      exportedAt: new Date().toISOString(),
      records: snapshot.records,
      activity: store.db
        .prepare('SELECT * FROM activity ORDER BY at LIMIT 10001')
        .all()
        .map((row) => ({
          id: String(row.id),
          requestId: String(row.request_id),
          operation: String(row.operation),
          entityId: String(row.entity_id),
          clientId: row.client_id === null ? null : String(row.client_id),
          at: String(row.at)
        })),
      checkpoints: store.db
        .prepare('SELECT id,body FROM checkpoints LIMIT 101')
        .all()
        .map((row) => ({ instanceId: String(row.id), checkpoint: JSON.parse(String(row.body)) })),
      history: rows.map((row) => ({
        entityId: String(row.entity_id),
        clientId: row.client_id === null ? null : String(row.client_id),
        at: String(row.at),
        record: recordSchema.parse(JSON.parse(String(row.body)))
      }))
    }
    if (body.activity.length > 10000 || body.checkpoints.length > 100) {
      throw new Error('Backup exceeds supported evidence limits. No partial backup was written.')
    }
    const content = JSON.stringify({ ...body, digest: digest(body) }, null, 2)
    if (Buffer.byteLength(content) > 10 * 1024 * 1024) {
      throw new Error('Backup exceeds the 10 MiB limit.')
    }
    return content
  })
}
