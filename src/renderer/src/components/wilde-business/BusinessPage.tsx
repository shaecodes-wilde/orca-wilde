import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  Assignment,
  BusinessRecord,
  BusinessTarget,
  Client,
  DeliveryProject
} from '../../../../shared/wilde/domain'
import type { BusinessMutation } from '../../../../shared/wilde/commands'
import { useBusinessData } from './use-business-data'
import { RecordEditor, type EditableRecord } from './RecordEditor'
import { ClientDetail } from './ClientDetail'
import { HomeView } from './HomeView'
import { ClientDirectory } from './ClientDirectory'
import { BusinessDataDialogs } from './BusinessDataDialogs'
import { AssignmentEditor, TargetPicker, WorkspaceAssignments } from './WorkspaceAssignments'
import { AutomationsView } from './AutomationsView'
import { EmptyState } from './business-fields'
import { clientDraft, projectDraft, knowledgeDraft, taskDraft } from './record-drafts'
import { useBusinessAction } from './use-business-action'
import type { BusinessAction } from '../../../../shared/wilde/navigation-commands'

export type { BusinessPageName, BusinessPageProps } from './business-page-types'
import type { BusinessPageName, BusinessPageProps } from './business-page-types'

export default function BusinessPage(props: BusinessPageProps): React.JSX.Element {
  const scopeKey = [
    props.initialPage ?? 'home',
    props.initialClientId,
    props.initialProjectId
  ].join(':')
  return <BusinessPageContent key={scopeKey} {...props} />
}

function BusinessPageContent({
  action,
  initialPage = 'home',
  initialClientId,
  initialProjectId,
  commandSlot,
  onContextChange,
  onOpenTarget,
  onWorkspaces
}: BusinessPageProps): React.JSX.Element {
  const api = window.api?.wildeBusiness
  const data = useBusinessData(api)
  const [page, setPage] = useState(initialPage)
  const [clientId, setClientId] = useState<string | null>(initialClientId ?? null)
  const [projectId, setProjectId] = useState<string | undefined>(initialProjectId)
  useEffect(() => {
    onContextChange?.({ page, clientId: clientId ?? undefined, projectId })
  }, [page, clientId, projectId, onContextChange])
  const [editor, setEditor] = useState<EditableRecord | null>(null)
  const [assignment, setAssignment] = useState<{
    target: BusinessTarget
    existing?: Assignment
    projectId?: string
  } | null>(null)
  const [pickTarget, setPickTarget] = useState<{ projectId?: string } | null>(null)
  const [backup, setBackup] = useState(false)
  const records = data.snapshot?.records ?? []
  const clients = records.filter((record): record is Client => record.type === 'client')
  const projects = records.filter((record): record is DeliveryProject => record.type === 'project')
  const assignments = records.filter((record): record is Assignment => record.type === 'assignment')
  const client = clients.find((item) => item.id === clientId)
  const [clientAction, setClientAction] = useState<BusinessAction>()
  const [commandGeneration, setCommandGeneration] = useState(0)
  const [executionAction, setExecutionAction] =
    useState<Extract<BusinessAction, { id: 'executions.list' }>>()
  useBusinessAction(action, data.snapshot, {
    onClient: (next) => {
      setCommandGeneration((current) => current + 1)
      openClient(next.clientId)
      setClientAction(next)
    },
    onExecutions: (next) => {
      setCommandGeneration((current) => current + 1)
      navigate('automations')
      setExecutionAction(next)
    },
    onDraft: (draft) => {
      openClient(draft.clientId)
      setProjectId(draft.projectId ?? undefined)
      setEditor(draft)
    }
  })
  function navigate(next: BusinessPageName): void {
    setClientAction(undefined)
    setExecutionAction(undefined)
    setPage(next)
    setClientId(null)
    setProjectId(undefined)
    setEditor(null)
    setAssignment(null)
    data.clearContext()
  }
  function openClient(id: string): void {
    setClientAction(undefined)
    setExecutionAction(undefined)
    setClientId(id)
    setProjectId(undefined)
    setPage('clients')
    setEditor(null)
    setAssignment(null)
    data.clearContext()
  }
  const review = (mutations: BusinessMutation[]) =>
    data.execute({ operation: 'preview', mutations })
  const archive = (record: BusinessRecord) => {
    void review([
      {
        operation: 'archive',
        id: record.id,
        revision: record.revision,
        archived: !record.archivedAt
      }
    ])
  }
  const remove = (record: BusinessRecord) => {
    void review([{ operation: 'delete', id: record.id, revision: record.revision }])
  }
  async function save(record: EditableRecord): Promise<boolean> {
    const previous = records.find((item) => item.id === record.id)
    if (
      record.type === 'workflow' ||
      (record.type === 'project' &&
        previous?.type === 'project' &&
        previous.clientId !== record.clientId)
    ) {
      return review([{ operation: 'save', record }])
    }
    return data.execute({ operation: 'save', record })
  }
  function newClient(): void {
    setEditor(clientDraft())
  }
  function newProject(): void {
    if (client) {
      setEditor(projectDraft(client.id))
    }
  }
  function newNote(projectId?: string): void {
    if (client) {
      setEditor(knowledgeDraft(client.id, projectId))
    }
  }
  function newTask(projectId: string | null): void {
    if (client) {
      setEditor(taskDraft(client.id, projectId))
    }
  }
  function assign(target: BusinessTarget, existing?: Assignment, projectId?: string): void {
    setAssignment({ target, existing, projectId })
  }
  if (!api) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold text-balance">Wilde business services</h1>
        <EmptyState>
          Business services are unavailable in this runtime. Enable the local business feature and
          restart the desktop app.
        </EmptyState>
        <Button variant="outline" onClick={onWorkspaces}>
          Open Workspaces
        </Button>
      </main>
    )
  }
  return (
    <main
      className="h-full overflow-y-auto scrollbar-sleek bg-background text-foreground"
      aria-label="Wilde business"
    >
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        {commandSlot}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <nav aria-label="Business destinations" className="flex flex-wrap gap-1">
            {(['home', 'clients', 'workspaces', 'automations'] as const).map((destination) => (
              <Button
                key={destination}
                size="sm"
                variant={page === destination ? 'secondary' : 'ghost'}
                aria-current={page === destination ? 'page' : undefined}
                onClick={() => navigate(destination)}
              >
                {destination === 'clients'
                  ? 'Owners'
                  : destination[0].toUpperCase() + destination.slice(1)}
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={data.busy}
              onClick={() => {
                void data.refresh()
              }}
            >
              <RefreshCw />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={data.busy}
              onClick={() => setBackup(true)}
            >
              Backup / import
            </Button>
          </div>
        </div>
        {data.loading && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading local business records…
          </p>
        )}
        {data.error && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-destructive break-words">{data.error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void data.refresh()
              }}
            >
              Reload records
            </Button>
          </div>
        )}
        {data.message && (
          <p role="status" className="text-sm text-muted-foreground">
            {data.message}
          </p>
        )}
        {data.snapshot?.truncated && (
          <p role="status" className="text-sm text-muted-foreground">
            Showing a bounded evidence window; older records are excluded from these reports. Export
            may require a smaller archive.
          </p>
        )}
        {!data.loading && page === 'home' && (
          <HomeView
            clients={clients}
            projects={projects}
            records={records}
            activity={data.snapshot?.activity ?? []}
            onClient={openClient}
            onNewClient={newClient}
            onWorkspaces={onWorkspaces}
          />
        )}
        {!data.loading &&
          page === 'clients' &&
          (client ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setClientId(null)
                  setProjectId(undefined)
                  data.clearContext()
                }}
              >
                <ArrowLeft />
                All owners
              </Button>
              <ClientDetail
                key={`${client.id}:${commandGeneration}`}
                action={clientAction}
                initialProjectId={projectId}
                onProjectChange={setProjectId}
                client={client}
                clients={clients}
                records={records}
                targets={data.targets}
                activity={data.snapshot?.activity ?? []}
                busy={data.busy}
                onEdit={setEditor}
                onArchive={archive}
                onDelete={remove}
                onNewProject={newProject}
                onNewNote={newNote}
                onNewTask={newTask}
                onToggleTask={(task) => {
                  void save({ ...task, done: !task.done })
                }}
                onAssign={assign}
                onPickTarget={(projectId) => setPickTarget({ projectId })}
                onOpenTarget={onOpenTarget}
              />
            </>
          ) : (
            <ClientDirectory
              clients={clients}
              projects={projects}
              busy={data.busy}
              onNewClient={newClient}
              onClient={openClient}
            />
          ))}
        {!data.loading && page === 'workspaces' && (
          <section className="space-y-5">
            <header className="flex flex-wrap justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-balance">Workspace assignments</h1>
                <p className="text-sm text-pretty text-muted-foreground">
                  Existing workspaces and Orca projects, identified by owning runtime and host.
                </p>
              </div>
              <Button size="sm" onClick={onWorkspaces}>
                Open terminal workbench
              </Button>
            </header>
            <WorkspaceAssignments
              targets={data.targets}
              assignments={assignments}
              clients={clients}
              busy={data.busy}
              onAssign={assign}
              onOpenTarget={onOpenTarget}
              onUnlink={archive}
            />
          </section>
        )}
        {!data.loading && page === 'automations' && (
          <AutomationsView
            key={commandGeneration}
            action={executionAction}
            api={api}
            records={records}
            clients={clients}
            onEdit={setEditor}
            onRefresh={data.refresh}
            onImportOutcomes={() => {
              void data.perform(() => api.chooseImport('outcomes'))
            }}
          />
        )}
      </div>
      {editor && (
        <RecordEditor
          key={editor.id}
          record={editor}
          clients={clients}
          projects={projects}
          busy={data.busy}
          serviceError={data.error}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {assignment && (
        <AssignmentEditor
          key={JSON.stringify(assignment.target)}
          target={assignment.target}
          existing={assignment.existing}
          clients={clients}
          projects={projects}
          initialClientId={client?.id}
          initialProjectId={assignment.projectId}
          busy={data.busy}
          onSave={(record) => review([{ operation: 'save', record }])}
          onClose={() => setAssignment(null)}
        />
      )}
      {pickTarget && (
        <TargetPicker
          targets={data.targets}
          assignments={assignments}
          projectId={pickTarget.projectId}
          onClose={() => setPickTarget(null)}
          onChoose={(target, existing) => {
            setPickTarget(null)
            assign(target, existing, pickTarget.projectId)
          }}
        />
      )}
      <BusinessDataDialogs
        error={data.error}
        preview={data.preview}
        busy={data.busy}
        onCancel={() => data.clearContext()}
        onCommit={async (token) => {
          if (await data.execute({ operation: 'commit', token })) {
            data.clearContext()
          }
        }}
        backup={backup}
        onBackupChange={setBackup}
        api={api}
        perform={data.perform}
      />
    </main>
  )
}
