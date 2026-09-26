import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  newRecordFields,
  targetKey,
  type Assignment,
  type BusinessTarget,
  type Client,
  type DeliveryProject,
  type TargetState
} from '../../../../shared/wilde/domain'
import { Choice, EmptyState } from './business-fields'

export function AssignmentEditor({
  target,
  existing,
  clients,
  projects,
  initialClientId,
  busy,
  onSave,
  onClose
}: {
  target: BusinessTarget
  existing?: Assignment
  clients: Client[]
  projects: DeliveryProject[]
  initialClientId?: string
  busy: boolean
  onSave: (assignment: Assignment) => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const [clientId, setClientId] = useState(
    existing?.clientId ?? initialClientId ?? clients.find((client) => !client.archivedAt)?.id ?? ''
  )
  const [projectId, setProjectId] = useState(existing?.projectId ?? 'none')
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
        <DialogHeader>
          <DialogTitle>Assign {target.name}</DialogTitle>
          <DialogDescription>
            Choose an existing client. Host: {target.hostId}. Ownership changes are reviewed before
            saving.
          </DialogDescription>
        </DialogHeader>
        {clients.some((client) => !client.archivedAt) ? (
          <div className="space-y-4">
            <Choice
              label="Client"
              value={clientId}
              onChange={(value) => {
                setClientId(value)
                setProjectId('none')
              }}
              options={clients
                .filter((client) => !client.archivedAt)
                .map((client) => ({ value: client.id, label: client.name }))}
              disabled={busy}
            />
            <Choice
              label="Delivery project"
              value={projectId}
              onChange={setProjectId}
              options={[
                { value: 'none', label: 'Client-wide' },
                ...projects
                  .filter((project) => project.clientId === clientId && !project.archivedAt)
                  .map((project) => ({ value: project.id, label: project.title }))
              ]}
              disabled={busy}
            />
            <p className="text-sm text-pretty text-muted-foreground">
              The workspace stays in Orca. Historical activity and execution evidence keep their
              original client attribution.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                disabled={busy || !clientId}
                onClick={() => {
                  void onSave({
                    ...(existing ?? newRecordFields()),
                    type: 'assignment',
                    archivedAt: null,
                    target,
                    clientId,
                    projectId: projectId === 'none' ? null : projectId,
                    reason: 'Assigned from business workspace view'
                  }).then((saved) => {
                    if (saved) {
                      onClose()
                    }
                  })
                }}
              >
                Review assignment
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState>Create a client first, then return here to assign this workspace.</EmptyState>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function WorkspaceAssignments({
  targets,
  assignments,
  clients,
  clientId,
  onAssign,
  onOpenTarget,
  onUnlink,
  busy
}: {
  targets: TargetState[]
  assignments: Assignment[]
  clients: Client[]
  clientId?: string
  onAssign: (target: BusinessTarget, assignment?: Assignment) => void
  onOpenTarget?: (target: BusinessTarget) => void
  onUnlink: (assignment: Assignment) => void
  busy: boolean
}): React.JSX.Element {
  const liveAssignments = assignments.filter((assignment) => !assignment.archivedAt)
  const byIdentity = new Map(targets.map((target) => [targetKey(target), target]))
  const rows = clientId
    ? liveAssignments
        .filter((assignment) => assignment.clientId === clientId)
        .map((assignment) => ({
          target: byIdentity.get(targetKey(assignment.target)) ?? {
            ...assignment.target,
            available: false,
            reason:
              'Target is missing or its owning host is disconnected. Reconnect the host or reassign this link.'
          },
          assignment
        }))
    : targets.map((target) => ({
        target,
        assignment: liveAssignments.find(
          (assignment) => targetKey(assignment.target) === targetKey(target)
        )
      }))
  if (!rows.length) {
    return (
      <EmptyState>
        {clientId
          ? 'No workspace links yet. Use Assign existing workspace to connect an existing workspace or Orca project.'
          : 'No existing workspaces or Orca projects are available. Open Workspaces to create or connect one, then refresh.'}
      </EmptyState>
    )
  }
  return (
    <div className="divide-y divide-border">
      {rows.map(({ target, assignment }) => (
        <div
          key={targetKey(target)}
          className="flex flex-wrap items-start justify-between gap-3 py-4"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium break-words">{target.name}</p>
            <p className="text-xs text-muted-foreground break-all">
              {target.kind} · {target.hostId} · {target.locator || target.stableId}
            </p>
            <p className="text-xs text-muted-foreground">
              {clients.find((client) => client.id === assignment?.clientId)?.name ?? 'Unassigned'}
            </p>
            {!target.available && (
              <p role="status" className="text-xs text-muted-foreground">
                {target.reason ?? 'Unavailable. Reconnect the owning runtime and refresh.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!target.available && <Badge variant="outline">Unavailable</Badge>}
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !target.available || !onOpenTarget}
              onClick={() => onOpenTarget?.(target)}
            >
              Open
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onAssign(target, assignment)}
            >
              {assignment ? 'Reassign' : 'Assign client'}
            </Button>
            {assignment && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onUnlink(assignment)}
              >
                Unlink
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TargetPicker({
  targets,
  onChoose,
  onClose
}: {
  targets: TargetState[]
  onChoose: (target: BusinessTarget) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <div className="max-h-[85dvh] overflow-y-auto scrollbar-sleek">
          <DialogHeader>
            <DialogTitle>Assign existing workspace or Orca project</DialogTitle>
            <DialogDescription>
              Workspace identity includes the owning runtime and host. Names and paths may change.
            </DialogDescription>
          </DialogHeader>
          {!targets.length && (
            <EmptyState>
              No targets are available. Open Workspaces to create or connect a workspace, then
              refresh.
            </EmptyState>
          )}
          <div className="divide-y divide-border">
            {targets.map((target) => (
              <div key={targetKey(target)} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm break-words">{target.name}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {target.kind} · {target.hostId}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onChoose(target)}>
                  Choose
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
