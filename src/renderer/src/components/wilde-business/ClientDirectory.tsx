import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Client, DeliveryProject } from '../../../../shared/wilde/domain'
import { EmptyState } from './business-fields'

export function ClientDirectory({
  clients,
  projects,
  busy,
  onNewClient,
  onClient
}: {
  clients: Client[]
  projects: DeliveryProject[]
  busy: boolean
  onNewClient: () => void
  onClient: (id: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-balance">Owners</h1>
          <p className="text-sm text-muted-foreground">
            Delivery, knowledge and workspaces in one owner context.
          </p>
        </div>
        <Button size="sm" disabled={busy} onClick={onNewClient}>
          New owner
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <Input
            aria-label="Search owners"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search owners, contacts and tags"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
      </div>
      <div className="divide-y divide-border">
        {clients
          .filter(
            (item) =>
              (!item.archivedAt || showArchived) &&
              `${item.name} ${item.contacts} ${item.tags.join(' ')} ${item.notes}`
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase())
          )
          .map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <Button variant="link" onClick={() => onClient(item.id)}>
                  {item.name}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {item.owner || 'No owner'} ·{' '}
                  {
                    projects.filter(
                      (project) => project.clientId === item.id && !project.archivedAt
                    ).length
                  }{' '}
                  projects
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">{item.status}</Badge>
                {item.archivedAt && <Badge variant="outline">Archived</Badge>}
              </div>
            </div>
          ))}
      </div>
      {!clients.length && (
        <EmptyState>
          Create your first owner to organize delivery projects and connect existing workspaces.
        </EmptyState>
      )}
    </section>
  )
}
