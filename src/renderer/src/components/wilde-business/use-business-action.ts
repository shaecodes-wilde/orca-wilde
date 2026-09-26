import { useEffect, useRef } from 'react'
import type { BusinessSnapshot, Knowledge } from '../../../../shared/wilde/domain'
import type { BusinessAction } from '../../../../shared/wilde/navigation-commands'
import { projectNoteDraft } from './record-drafts'

export function useBusinessAction(
  action: BusinessAction | undefined,
  snapshot: BusinessSnapshot | null,
  handlers: {
    onClient: (action: Extract<BusinessAction, { clientId: string; query?: string }>) => void
    onExecutions: (action: Extract<BusinessAction, { id: 'executions.list' }>) => void
    onDraft: (draft: Knowledge) => void
  }
): void {
  const handled = useRef<BusinessAction | undefined>(undefined)
  useEffect(() => {
    if (!action || !snapshot || handled.current === action) {
      return
    }
    handled.current = action
    if (action.id === 'executions.list') {
      handlers.onExecutions(action)
    } else if (action.id === 'draft.projectNote') {
      const project = snapshot.records.find(
        (record) =>
          record.type === 'project' &&
          record.id === action.projectId &&
          record.clientId === action.clientId &&
          !record.archivedAt
      )
      if (project?.type === 'project') {
        handlers.onDraft(projectNoteDraft(project))
      }
    } else if (
      action.id === 'client.open' ||
      action.id === 'project.list' ||
      action.id === 'knowledge.search'
    ) {
      if (
        snapshot.records.some(
          (record) =>
            record.type === 'client' && record.id === action.clientId && !record.archivedAt
        )
      ) {
        handlers.onClient(action)
      }
    }
  }, [action, snapshot, handlers])
}
