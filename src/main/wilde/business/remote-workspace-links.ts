import { z } from 'zod'
import { listEnvironments } from '../../../shared/runtime-environment-store'
import { getRuntimeEnvironmentStatusSnapshots } from '../../ipc/runtime-environment-request-connections'
import { callRuntimeEnvironment } from '../../ipc/runtime-environment-transport-routing'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { TargetState } from '../../../shared/wilde/domain'

const worktreePage = z.object({
  worktrees: z
    .array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        instanceId: z.string().optional(),
        hostId: z.string().optional(),
        identity: z.object({ key: z.string(), executionHostId: z.string() }).optional()
      })
    )
    .max(10000)
})
const folderPage = z.object({
  folderWorkspaces: z
    .array(z.object({ id: z.string(), name: z.string(), connectionId: z.string().nullish() }))
    .max(10000)
})
const projectPage = z.object({
  projects: z.array(z.object({ id: z.string(), displayName: z.string() })).max(10000)
})

export async function listRemoteBusinessTargets(
  userDataPath: string,
  installationId: string
): Promise<TargetState[]> {
  const statuses = getRuntimeEnvironmentStatusSnapshots()
  const environments = listEnvironments(userDataPath)
    .filter(
      (environment) =>
        environment.runtimeId &&
        statuses.some(
          (status) =>
            status.environmentId === environment.id &&
            status.verification === 'verified' &&
            status.transport === 'ready'
        )
    )
    .slice(0, 20)
  const result: TargetState[] = []
  for (const environment of environments) {
    const hostId = toRuntimeExecutionHostId(environment.id)
    const ownerId = `${installationId}:${environment.runtimeId}`
    const pages = await Promise.allSettled(
      ['worktree.list', 'folderWorkspace.list', 'project.list'].map((method) =>
        callRuntimeEnvironment(
          userDataPath,
          environment.id,
          method,
          method === 'worktree.list' ? { limit: 10000 } : undefined,
          5000,
          environment.pairingRevision,
          undefined,
          { expectedEnvironmentRuntimeId: environment.runtimeId ?? undefined }
        )
      )
    )
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]
      if (page.status !== 'fulfilled' || !page.value.ok) {
        continue
      }
      if (index === 0) {
        const parsed = worktreePage.safeParse(page.value.result)
        if (!parsed.success) {
          continue
        }
        for (const row of parsed.data.worktrees) {
          const stableId = row.instanceId ?? row.identity?.key
          const upstreamHost = row.identity?.executionHostId ?? row.hostId ?? 'local'
          if (!stableId || upstreamHost !== 'local') {
            continue
          }
          result.push({
            ownerId,
            hostId,
            stableId,
            kind: 'worktree',
            locator: row.id,
            name: row.displayName,
            available: true
          })
        }
      } else if (index === 1) {
        const parsed = folderPage.safeParse(page.value.result)
        if (!parsed.success) {
          continue
        }
        for (const row of parsed.data.folderWorkspaces) {
          if (!row.connectionId) {
            result.push({
              ownerId,
              hostId,
              stableId: row.id,
              kind: 'folder',
              locator: row.id,
              name: row.name,
              available: true
            })
          }
        }
      } else {
        const parsed = projectPage.safeParse(page.value.result)
        if (!parsed.success) {
          continue
        }
        for (const row of parsed.data.projects) {
          result.push({
            ownerId,
            hostId,
            stableId: row.id,
            kind: 'orca-project',
            locator: row.id,
            name: row.displayName,
            available: true
          })
        }
      }
    }
  }
  return result
}
