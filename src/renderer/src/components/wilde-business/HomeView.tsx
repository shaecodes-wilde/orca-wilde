import { Button } from '@/components/ui/button'
import type { BusinessRecord, Client, DeliveryProject } from '../../../../shared/wilde/domain'
import { ActivityList } from './ActivityList'
import { EmptyState } from './business-fields'

export function HomeView({
  clients,
  projects,
  records,
  activity,
  onClient,
  onNewClient,
  onWorkspaces
}: {
  clients: Client[]
  projects: DeliveryProject[]
  records: BusinessRecord[]
  activity: Parameters<typeof ActivityList>[0]['activity']
  onClient: (id: string) => void
  onNewClient: () => void
  onWorkspaces?: () => void
}): React.JSX.Element {
  const active = projects.filter(
    (project) => !project.archivedAt && !['completed', 'cancelled'].includes(project.status)
  )
  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">WILDE SYSTEMS · DELIVERY DESK</p>
        <h1 className="text-2xl font-semibold text-balance">What needs your attention?</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Client delivery and current work, grounded in your local records.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button size="sm" onClick={onNewClient}>
          New owner
        </Button>
        <Button size="sm" variant="outline" onClick={onWorkspaces}>
          Open Workspaces
        </Button>
      </div>
      <dl className="flex flex-wrap gap-8 border-y border-border py-5">
        <div>
          <dt className="text-xs text-muted-foreground">Active owners</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {clients.filter((client) => !client.archivedAt && client.status === 'active').length}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Open delivery projects</dt>
          <dd className="text-2xl font-semibold tabular-nums">{active.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Blocked projects</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {active.filter((project) => project.status === 'blocked').length}
          </dd>
        </div>
      </dl>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-balance">Delivery queue</h2>
        {!active.length && (
          <EmptyState>
            No open delivery projects. Open an owner to record a delivery outcome and next action.
          </EmptyState>
        )}
        <div className="divide-y divide-border">
          {active.map((project) => (
            <div key={project.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">{project.title}</h3>
                <p className="text-sm text-pretty text-muted-foreground">
                  {project.nextAction || 'Next action not recorded'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {project.status}
                  {project.dueDate ? ` · Due ${project.dueDate}` : ''}
                </p>
              </div>
              <Button size="sm" variant="link" onClick={() => onClient(project.clientId)}>
                {clients.find((client) => client.id === project.clientId)?.name ?? 'Open owner'}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-base font-semibold text-balance">Recent activity</h2>
        <ActivityList activity={activity.slice(0, 12)} records={records} />
      </section>
    </section>
  )
}
