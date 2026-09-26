import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  clientSchema,
  projectSchema,
  knowledgeSchema,
  workflowSchema,
  type Client,
  type DeliveryProject,
  type Knowledge,
  type Workflow
} from '../../../../shared/wilde/domain'
import { Choice, TextField, choices } from './business-fields'

export type EditableRecord = Client | DeliveryProject | Knowledge | Workflow
const read = (data: FormData, name: string): string => String(data.get(name) ?? '')
const lines = (data: FormData, name: string): string[] =>
  read(data, name)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

function buildRecord(record: EditableRecord, data: FormData): EditableRecord {
  switch (record.type) {
    case 'client':
      return clientSchema.parse({
        ...record,
        name: read(data, 'name'),
        status: read(data, 'status'),
        kind: read(data, 'kind'),
        owner: read(data, 'owner'),
        contacts: read(data, 'contacts'),
        tags: read(data, 'tags')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: read(data, 'notes'),
        links: lines(data, 'links')
      })
    case 'project':
      return projectSchema.parse({
        ...record,
        clientId: read(data, 'clientId'),
        title: read(data, 'title'),
        outcome: read(data, 'outcome'),
        status: read(data, 'status'),
        priority: read(data, 'priority'),
        nextAction: read(data, 'nextAction'),
        dueDate: read(data, 'dueDate') || null,
        milestones: read(data, 'milestones'),
        links: lines(data, 'links')
      })
    case 'knowledge':
      return knowledgeSchema.parse({
        ...record,
        title: read(data, 'title'),
        body: read(data, 'body'),
        projectId: read(data, 'projectId') === 'none' ? null : read(data, 'projectId'),
        kind: read(data, 'kind'),
        state: read(data, 'state'),
        provenance: read(data, 'provenance'),
        url: read(data, 'url') || null
      })
    case 'workflow': {
      const ownership = read(data, 'ownership')
      const clientId = read(data, 'clientId')
      const projectId = read(data, 'projectId')
      return workflowSchema.parse({
        ...record,
        purpose: read(data, 'purpose'),
        environment: read(data, 'environment'),
        maintainer: read(data, 'maintainer'),
        ownership,
        clientId: ownership === 'exclusive' && clientId !== 'none' ? clientId : null,
        projectId: ownership === 'exclusive' && projectId !== 'none' ? projectId : null
      })
    }
  }
}

function ClientFields({ record }: { record: Client }): React.JSX.Element {
  return (
    <>
      <TextField label="Client name" name="name" value={record.name} required />
      <div className="flex flex-wrap gap-4">
        <Choice
          label="Status"
          name="status"
          value={record.status}
          options={choices(['prospect', 'active', 'paused', 'former'])}
        />
        <Choice
          label="Client type"
          name="kind"
          value={record.kind}
          options={choices(['external', 'internal'])}
        />
      </div>
      <TextField label="Owner" name="owner" value={record.owner} />
      <TextField label="Contacts" name="contacts" value={record.contacts} multiline />
      <TextField label="Tags, separated by commas" name="tags" value={record.tags.join(', ')} />
      <TextField label="Client notes" name="notes" value={record.notes} multiline />
      <TextField
        label="Links, one per line"
        name="links"
        value={record.links.join('\n')}
        multiline
      />
    </>
  )
}

function ProjectFields({
  record,
  clients
}: {
  record: DeliveryProject
  clients: Client[]
}): React.JSX.Element {
  return (
    <>
      <TextField label="Project title" name="title" value={record.title} required />
      <Choice
        label="Client"
        name="clientId"
        value={record.clientId}
        options={clients.map((client) => ({ value: client.id, label: client.name }))}
      />
      <TextField label="Intended outcome" name="outcome" value={record.outcome} multiline />
      <div className="flex flex-wrap gap-4">
        <Choice
          label="Status"
          name="status"
          value={record.status}
          options={choices(['planned', 'active', 'blocked', 'completed', 'cancelled'])}
        />
        <Choice
          label="Priority"
          name="priority"
          value={record.priority}
          options={choices(['low', 'normal', 'high'])}
        />
      </div>
      <TextField label="Next action" name="nextAction" value={record.nextAction} multiline />
      <TextField label="Due date" name="dueDate" value={record.dueDate ?? ''} type="date" />
      <TextField label="Milestones" name="milestones" value={record.milestones} multiline />
      <TextField
        label="Repository and delivery links, one per line"
        name="links"
        value={record.links.join('\n')}
        multiline
      />
    </>
  )
}

function KnowledgeFields({
  record,
  projects
}: {
  record: Knowledge
  projects: DeliveryProject[]
}): React.JSX.Element {
  return (
    <>
      <TextField label="Note title" name="title" value={record.title} required />
      <Choice
        label="Project scope"
        name="projectId"
        value={record.projectId ?? 'none'}
        options={[
          { value: 'none', label: 'Client-wide' },
          ...projects
            .filter((project) => project.clientId === record.clientId && !project.archivedAt)
            .map((project) => ({ value: project.id, label: project.title }))
        ]}
      />
      <div className="flex flex-wrap gap-4">
        <Choice
          label="Kind"
          name="kind"
          value={record.kind}
          options={choices([
            'note',
            'decision',
            'procedure',
            'document-reference',
            'delivery',
            'handoff'
          ])}
        />
        <Choice
          label="State"
          name="state"
          value={record.state}
          options={choices(['curated', 'draft'])}
        />
      </div>
      <TextField label="Note content" name="body" value={record.body} multiline />
      <TextField label="Source / provenance" name="provenance" value={record.provenance} />
      <TextField label="Source link" name="url" value={record.url ?? ''} type="url" />
    </>
  )
}

function WorkflowFields({
  record,
  clients,
  projects
}: {
  record: Workflow
  clients: Client[]
  projects: DeliveryProject[]
}): React.JSX.Element {
  const [clientId, setClientId] = useState(record.clientId ?? 'none')
  const [projectId, setProjectId] = useState(record.projectId ?? 'none')
  return (
    <>
      <p className="text-sm text-pretty text-muted-foreground">
        Assignment changes apply to future collected evidence. Existing executions keep their
        recorded client.
      </p>
      <TextField label="Purpose" name="purpose" value={record.purpose} multiline />
      <TextField label="Maintainer" name="maintainer" value={record.maintainer} />
      <Choice
        label="Environment"
        name="environment"
        value={record.environment}
        options={choices(['production', 'test', 'unknown'])}
      />
      <Choice
        label="Ownership"
        name="ownership"
        value={record.ownership}
        options={choices(['exclusive', 'shared', 'unassigned'])}
      />
      <Choice
        label="Client (exclusive ownership only)"
        name="clientId"
        value={clientId}
        onChange={(value) => {
          setClientId(value)
          setProjectId('none')
        }}
        options={[
          { value: 'none', label: 'No client' },
          ...clients
            .filter((client) => !client.archivedAt)
            .map((client) => ({ value: client.id, label: client.name }))
        ]}
      />
      <Choice
        label="Project"
        name="projectId"
        value={projectId}
        onChange={setProjectId}
        options={[
          { value: 'none', label: 'Client-wide' },
          ...projects
            .filter((project) => project.clientId === clientId && !project.archivedAt)
            .map((project) => ({ value: project.id, label: project.title }))
        ]}
      />
    </>
  )
}

export function RecordEditor({
  record,
  clients,
  projects,
  busy,
  serviceError,
  onSave,
  onClose
}: {
  record: EditableRecord
  clients: Client[]
  projects: DeliveryProject[]
  busy: boolean
  serviceError?: string
  onSave: (record: EditableRecord) => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    try {
      const next = buildRecord(record, new FormData(event.currentTarget))
      if (await onSave(next)) {
        onClose()
      } else {
        setError(
          'The change was not saved. Close this form to review the service error, reload current records, and try again.'
        )
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Please check the fields.')
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <div className="max-h-[85dvh] overflow-y-auto scrollbar-sleek">
          <DialogHeader>
            <DialogTitle>
              {record.revision ? 'Edit' : 'Save'}{' '}
              {record.type === 'knowledge' ? 'knowledge' : record.type}
            </DialogTitle>
            <DialogDescription>
              Saved locally in this Orca profile. Client and assignment changes require an impact
              review.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              void submit(event)
            }}
            className="space-y-4"
          >
            <fieldset disabled={busy} className="space-y-4">
              {record.type === 'client' && <ClientFields record={record} />}
              {record.type === 'project' && <ProjectFields record={record} clients={clients} />}
              {record.type === 'knowledge' && (
                <KnowledgeFields record={record} projects={projects} />
              )}
              {record.type === 'workflow' && (
                <WorkflowFields record={record} clients={clients} projects={projects} />
              )}
            </fieldset>
            {(error || serviceError) && (
              <p role="alert" className="text-sm text-destructive break-words">
                {serviceError || error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save {record.type === 'knowledge' ? 'note' : record.type}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
