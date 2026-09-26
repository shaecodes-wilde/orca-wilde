import type SyncDatabase from '../../sqlite/sync-database'
import type { BusinessMutation, BusinessResult } from '../../../shared/wilde/commands'
import type { BusinessRecord } from '../../../shared/wilde/domain'
import { readRecord } from './record-integrity'

export function mutationImpact(
  db: SyncDatabase,
  mutations: BusinessMutation[]
): NonNullable<BusinessResult['preview']>['affected'] {
  function scope(record: BusinessRecord | undefined): string {
    if (!record) {
      return 'Not present'
    }
    const clientId = 'clientId' in record ? record.clientId : null
    const client = clientId ? readRecord(db, clientId) : undefined
    const projectId = 'projectId' in record ? record.projectId : null
    const project = projectId ? readRecord(db, projectId) : undefined
    const ownership = record.type === 'workflow' ? record.ownership : ''
    return [
      client?.type === 'client' ? `${client.name} (${client.id})` : ownership || 'No client',
      project?.type === 'project' ? `${project.title} (${project.id})` : null,
      record.archivedAt ? 'Archived' : 'Active'
    ]
      .filter(Boolean)
      .join(' · ')
  }
  return mutations.map((mutation) => {
    const id = mutation.operation === 'save' ? mutation.record.id : mutation.id
    const before = readRecord(db, id)
    const after = mutation.operation === 'save' ? mutation.record : before
    const label =
      after?.type === 'assignment'
        ? `${after.target.name} · ${after.target.hostId} · ${after.target.stableId}`
        : after && 'title' in after
          ? after.title
          : after && 'name' in after
            ? after.name
            : id
    return {
      id,
      label,
      operation: mutation.operation,
      before: scope(before),
      after:
        mutation.operation === 'delete'
          ? 'Permanently deleted'
          : mutation.operation === 'archive'
            ? scope(
                after
                  ? { ...after, archivedAt: mutation.archived ? new Date().toISOString() : null }
                  : undefined
              )
            : scope(after)
    }
  })
}
