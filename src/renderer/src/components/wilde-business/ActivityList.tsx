import type { Activity, BusinessRecord } from '../../../../shared/wilde/domain'
import { EmptyState, timestamp } from './business-fields'

const commandLabels: Record<string, string> = {
  'client.open': 'open client',
  'project.list': 'show projects',
  'knowledge.search': 'search client knowledge',
  'workspace.open': 'open workspace',
  'executions.list': 'show failed automations',
  'navigation.back': 'go back',
  'draft.projectNote': 'prepare project note',
  unresolved: 'unresolved request'
}
const commandStatuses: Record<string, string> = {
  success: 'completed',
  'needs-choice': 'choice needed',
  rejected: 'rejected',
  'not-found': 'not found',
  'stale-context': 'context changed',
  unavailable: 'unavailable',
  failed: 'failed',
  cancelled: 'cancelled'
}

export function ActivityList({
  activity,
  records
}: {
  activity: Activity[]
  records: BusinessRecord[]
}): React.JSX.Element {
  if (!activity.length) {
    return <EmptyState>No recorded activity in this scope.</EmptyState>
  }
  return (
    <ol className="divide-y divide-border">
      {activity.slice(0, 100).map((entry) => {
        const [kind, action, status] = entry.operation.split(':')
        const record = records.find((item) => item.id === entry.entityId)
        const name = record
          ? 'name' in record
            ? record.name
            : 'title' in record
              ? record.title
              : record.type
          : 'Removed record'
        return (
          <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
            <span>
              {kind === 'command'
                ? `Command: ${commandLabels[action] ?? 'request'} — ${commandStatuses[status] ?? 'status unavailable'}`
                : `${entry.operation} · ${name}`}
            </span>
            <time className="text-xs text-muted-foreground tabular-nums" dateTime={entry.at}>
              {timestamp(entry.at)}
            </time>
          </li>
        )
      })}
    </ol>
  )
}
