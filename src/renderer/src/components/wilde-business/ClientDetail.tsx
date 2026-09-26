import { useState } from 'react'
import { ActivityList } from './ActivityList'
import type { BusinessAction } from '../../../../shared/wilde/navigation-commands'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import type {
  Activity,
  Assignment,
  BusinessRecord,
  BusinessTarget,
  Client,
  DeliveryProject,
  Knowledge,
  Task,
  TargetState
} from '../../../../shared/wilde/domain'
import { EmptyState, timestamp } from './business-fields'
import { WorkspaceAssignments } from './WorkspaceAssignments'
import { BusinessReports } from './BusinessReports'
import type { EditableRecord } from './RecordEditor'
import { ScopedContext } from './ScopedContext'
import { ProjectChecklist } from './ProjectChecklist'

export function ClientDetail({
  action,
  client,
  records,
  clients,
  targets,
  activity,
  busy,
  onEdit,
  onArchive,
  onDelete,
  onNewProject,
  onNewNote,
  onNewTask,
  onToggleTask,
  onAssign,
  onPickTarget,
  onOpenTarget,
  initialProjectId,
  onProjectChange
}: {
  action?: BusinessAction
  client: Client
  records: BusinessRecord[]
  clients: Client[]
  targets: TargetState[]
  activity: Activity[]
  busy: boolean
  onEdit: (record: EditableRecord) => void
  onArchive: (record: BusinessRecord) => void
  onDelete: (record: BusinessRecord) => void
  onNewProject: () => void
  onNewNote: (projectId?: string) => void
  onNewTask: (projectId: string | null) => void
  onToggleTask: (task: Task) => void
  onAssign: (target: BusinessTarget, assignment?: Assignment) => void
  onPickTarget: (projectId?: string) => void
  onOpenTarget?: (target: BusinessTarget) => void
  initialProjectId?: string
  onProjectChange?: (id: string | undefined) => void
}): React.JSX.Element {
  const [query, setQuery] = useState(action?.id === 'knowledge.search' ? (action.query ?? '') : '')
  const [tab, setTab] = useState(action?.id === 'knowledge.search' ? 'knowledge' : 'projects')
  const [onlyActive, setOnlyActive] = useState(action?.id === 'project.list')
  const [archived, setArchived] = useState(false)
  const projectId = initialProjectId ?? null
  const setProjectId = (id: string | null) => onProjectChange?.(id ?? undefined)
  const projects = records.filter(
    (record): record is DeliveryProject =>
      record.type === 'project' && record.clientId === client.id
  )
  const notes = records.filter(
    (record): record is Knowledge => record.type === 'knowledge' && record.clientId === client.id
  )
  const assignments = records.filter((record): record is Assignment => record.type === 'assignment')
  const tasks = records.filter(
    (record): record is Task =>
      record.type === 'task' && record.clientId === client.id && !record.archivedAt
  )
  const matching = (record: DeliveryProject | Knowledge) =>
    (!record.archivedAt || archived) &&
    (record.type !== 'project' || !onlyActive || record.status === 'active') &&
    JSON.stringify(record).toLocaleLowerCase().includes(query.toLocaleLowerCase())
  const activeProject = projects.find((project) => project.id === projectId)
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-balance">{client.name}</h2>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{client.status}</Badge>
            <Badge variant="outline">{client.kind}</Badge>
            {client.archivedAt && <Badge variant="outline">Archived</Badge>}
            {client.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
          {client.owner && (
            <p className="text-sm text-muted-foreground">Account manager: {client.owner}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ScopedContext
            client={client}
            projects={projects}
            notes={notes}
            initialProjectId={initialProjectId}
          />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(client)}>
            Edit owner
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onArchive(client)}>
            {client.archivedAt ? 'Restore owner' : 'Archive owner'}
          </Button>
          {client.archivedAt && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(client)}>
              Delete owner permanently
            </Button>
          )}
        </div>
      </header>
      {client.notes && <p className="whitespace-pre-wrap text-sm text-pretty">{client.notes}</p>}
      {client.contacts && (
        <details className="text-sm">
          <summary className="cursor-pointer">Contacts</summary>
          <p className="whitespace-pre-wrap py-2">{client.contacts}</p>
        </details>
      )}
      <ReferenceLinks links={client.links} />
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto scrollbar-sleek">
          <TabsList>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="projects">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !!client.archivedAt} onClick={onNewProject}>
                New delivery project
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOnlyActive(!onlyActive)}>
                {onlyActive ? 'Show all statuses' : 'Active projects only'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setArchived(!archived)}>
                {archived ? 'Hide archived' : 'Show archived'}
              </Button>
            </div>
            <Input
              aria-label="Search owner projects"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects, outcomes and next actions"
            />
            {!projects.filter(matching).length && (
              <EmptyState>
                No matching delivery projects. Create a project to record the intended outcome and
                next action.
              </EmptyState>
            )}
            <div className="divide-y divide-border">
              {projects.filter(matching).map((project) => (
                <article key={project.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold text-balance">{project.title}</h3>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{project.status}</Badge>
                        <Badge variant="outline">{project.priority}</Badge>
                        {project.archivedAt && <Badge variant="outline">Archived</Badge>}
                      </div>
                    </div>
                    <RecordActions
                      record={project}
                      busy={busy}
                      onEdit={onEdit}
                      onArchive={onArchive}
                      onDelete={onDelete}
                    />
                  </div>
                  {project.outcome && (
                    <p className="text-sm text-pretty whitespace-pre-wrap">{project.outcome}</p>
                  )}
                  {project.nextAction && (
                    <p className="text-sm text-pretty">
                      <span className="font-medium">Next action:</span> {project.nextAction}
                    </p>
                  )}
                  {project.dueDate && (
                    <p className="text-xs text-muted-foreground">Due {project.dueDate}</p>
                  )}
                  {project.milestones && (
                    <details className="text-sm">
                      <summary className="cursor-pointer">Milestones</summary>
                      <p className="whitespace-pre-wrap py-2">{project.milestones}</p>
                    </details>
                  )}
                  <ReferenceLinks links={project.links} />
                  <ProjectChecklist
                    project={project}
                    assignments={assignments}
                    tasks={tasks}
                    busy={busy}
                    onEditTask={onEdit}
                    onToggleTask={onToggleTask}
                    onNewTask={onNewTask}
                    onLinkTarget={onPickTarget}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !!project.archivedAt}
                      onClick={() => onNewNote(project.id)}
                    >
                      Add delivery note
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setProjectId(projectId === project.id ? null : project.id)}
                    >
                      {projectId === project.id
                        ? 'Hide project notes'
                        : `View notes (${notes.filter((note) => note.projectId === project.id && !note.archivedAt).length})`}
                    </Button>
                  </div>
                  {activeProject?.id === project.id && (
                    <KnowledgeList
                      notes={notes.filter(
                        (note) => note.projectId === project.id && (!note.archivedAt || archived)
                      )}
                      busy={busy}
                      onEdit={onEdit}
                      onArchive={onArchive}
                      onDelete={onDelete}
                    />
                  )}
                </article>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="knowledge">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !!client.archivedAt} onClick={() => onNewNote()}>
                New knowledge note
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setArchived(!archived)}>
                {archived ? 'Hide archived' : 'Show archived'}
              </Button>
            </div>
            <Input
              aria-label="Search owner knowledge"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes, decisions, delivery and handoff"
            />
            <KnowledgeList
              notes={notes.filter(matching)}
              busy={busy}
              onEdit={onEdit}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          </div>
        </TabsContent>
        <TabsContent value="workspaces">
          <Button size="sm" disabled={busy || !!client.archivedAt} onClick={() => onPickTarget()}>
            Assign existing workspace
          </Button>
          <WorkspaceAssignments
            targets={targets}
            assignments={assignments}
            clients={clients}
            clientId={client.id}
            busy={busy}
            onAssign={onAssign}
            onOpenTarget={onOpenTarget}
            onUnlink={onArchive}
          />
        </TabsContent>
        <TabsContent value="reports">
          <BusinessReports records={records} clientId={client.id} projectId={initialProjectId} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityList
            activity={activity.filter((entry) => entry.clientId === client.id)}
            records={records}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReferenceLinks({ links }: { links: string[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {links.map((link) => (
        <a
          key={link}
          href={link}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline break-all"
        >
          {link}
        </a>
      ))}
    </div>
  )
}

function RecordActions({
  record,
  busy,
  onEdit,
  onArchive,
  onDelete
}: {
  record: EditableRecord
  busy: boolean
  onEdit: (record: EditableRecord) => void
  onArchive: (record: BusinessRecord) => void
  onDelete: (record: BusinessRecord) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(record)}>
        Edit
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onArchive(record)}>
        {record.archivedAt ? 'Restore' : 'Archive'}
      </Button>
      {record.archivedAt && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(record)}>
          Delete permanently
        </Button>
      )}
    </div>
  )
}

function KnowledgeList({
  notes,
  busy,
  onEdit,
  onArchive,
  onDelete
}: {
  notes: Knowledge[]
  busy: boolean
  onEdit: (record: EditableRecord) => void
  onArchive: (record: BusinessRecord) => void
  onDelete: (record: BusinessRecord) => void
}): React.JSX.Element {
  if (!notes.length) {
    return <EmptyState>No matching knowledge notes in this scope.</EmptyState>
  }
  return (
    <div className="divide-y divide-border">
      {notes.map((note) => (
        <article key={note.id} className="space-y-3 py-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-balance">{note.title}</h3>
              <p className="text-xs text-muted-foreground">
                {note.kind} · {note.state}
                {note.archivedAt ? ' · Archived' : ''} · {timestamp(note.updatedAt)}
              </p>
            </div>
            <RecordActions
              record={note}
              busy={busy}
              onEdit={onEdit}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          </div>
          <p className="whitespace-pre-wrap text-sm text-pretty break-words">{note.body}</p>
          {note.provenance && (
            <p className="text-xs text-muted-foreground">Source: {note.provenance}</p>
          )}
          {note.url && <ReferenceLinks links={[note.url]} />}
        </article>
      ))}
    </div>
  )
}
