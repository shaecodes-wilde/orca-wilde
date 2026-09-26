import type { Store } from '../../persistence'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import type { TargetState } from '../../../shared/wilde/domain'
import { toSshExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { getSshFilesystemProvider } from '../../providers/ssh-filesystem-dispatch'

export async function listBusinessTargets(
  store: Store,
  runtime: OrcaRuntimeService,
  ownerId: string
): Promise<TargetState[]> {
  const catalog = await runtime.listManagedWorktrees(undefined, 10000)
  const targets: TargetState[] = []
  for (const worktree of catalog.worktrees) {
    const stableId = worktree.instanceId ?? worktree.identity?.key
    if (!stableId) {
      continue
    }
    const hostId = worktree.identity?.executionHostId ?? worktree.hostId ?? 'local'
    const available = catalog.hostScope?.hostIds.includes(hostId) === true && hostAvailable(hostId)
    targets.push({
      ownerId,
      hostId,
      stableId,
      kind: 'worktree',
      locator: worktree.id,
      name: worktree.displayName,
      available,
      reason: available ? undefined : 'Reconnect/update the owning host to verify this workspace.'
    })
  }
  for (const folder of store.getFolderWorkspaces()) {
    const hostId =
      folder.executionHostId ??
      (folder.connectionId ? toSshExecutionHostId(folder.connectionId) : 'local')
    targets.push({
      ownerId,
      hostId,
      stableId: folder.id,
      kind: 'folder',
      locator: folder.id,
      name: folder.name,
      available: hostAvailable(hostId),
      reason: hostAvailable(hostId) ? undefined : 'Owning host is disconnected/unverifiable.'
    })
  }
  for (const project of store.getProjects()) {
    targets.push({
      ownerId,
      hostId: 'local',
      stableId: project.id,
      kind: 'orca-project',
      locator: project.id,
      name: project.displayName,
      available: true
    })
  }
  for (const group of store.getProjectGroups()) {
    const hostId =
      group.executionHostId ??
      (group.connectionId ? toSshExecutionHostId(group.connectionId) : 'local')
    targets.push({
      ownerId,
      hostId,
      stableId: group.id,
      kind: 'folder-project',
      locator: group.id,
      name: group.name,
      available: hostAvailable(hostId)
    })
  }
  return targets
}
function hostAvailable(id: string): boolean {
  const host = parseExecutionHostId(id)
  return (
    host?.kind === 'local' ||
    (host?.kind === 'ssh' && Boolean(getSshFilesystemProvider(host.targetId)))
  )
}
