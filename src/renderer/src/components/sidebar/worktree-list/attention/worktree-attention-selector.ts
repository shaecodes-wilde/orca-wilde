import type { AppState } from '@/store/types'
import { isExplicitAgentStatusFresh } from '@/lib/agent-status'
import {
  mergeAgentStatusOrchestration,
  resolveAgentStatusWorktreeId
} from '@/lib/agent-status-worktree-attribution'
import { resolveWorktreeStatus, type WorktreeStatus } from '@/lib/worktree-status'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../../../../../shared/agent-status-types'
import {
  selectLivePtyIdsForWorktree,
  selectRuntimePaneTitlesForWorktree,
  selectTerminalLayoutRootsForWorktree
} from '../../worktree-card-status-inputs'
import { selectWorktreeAgentActivitySummary } from '../../worktree-agent-activity-summary'
import { deriveWorktreeAttention, type SidebarAttention } from './group-attention'

type CompletionTimes = { latestDoneAt: number; latestInterruptedAt: number }

const EMPTY_TABS: readonly never[] = []
const NO_COMPLETIONS: CompletionTimes = { latestDoneAt: 0, latestInterruptedAt: 0 }

let completionCache: {
  sources: readonly unknown[]
  byWorktreeId: Map<string, CompletionTimes>
} | null = null

function sameSources(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** Latest done / interrupted times per workspace, rebuilt once per agent-status generation. */
function getCompletionTimes(state: AppState): Map<string, CompletionTimes> {
  const sources = [
    state.tabsByWorktree,
    state.agentStatusEpoch,
    state.retainedAgentsByPaneKey,
    state.runtimeAgentOrchestrationByPaneKey
  ]
  if (completionCache && sameSources(completionCache.sources, sources)) {
    return completionCache.byWorktreeId
  }
  const tabIdToWorktreeId = new Map<string, string>()
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    for (const tab of tabs) {
      tabIdToWorktreeId.set(tab.id, worktreeId)
    }
  }
  const byWorktreeId = new Map<string, CompletionTimes>()
  const record = (worktreeId: string, at: number, interrupted: boolean): void => {
    const current = byWorktreeId.get(worktreeId) ?? { latestDoneAt: 0, latestInterruptedAt: 0 }
    if (interrupted) {
      current.latestInterruptedAt = Math.max(current.latestInterruptedAt, at)
    } else {
      current.latestDoneAt = Math.max(current.latestDoneAt, at)
    }
    byWorktreeId.set(worktreeId, current)
  }
  const now = Date.now()
  for (const [paneKey, entry] of Object.entries(state.agentStatusByPaneKey)) {
    if (entry.state !== 'done' || entry.restoredUnconfirmed) {
      continue
    }
    if (!isExplicitAgentStatusFresh(entry, now, AGENT_STATUS_STALE_AFTER_MS)) {
      continue
    }
    const orchestration = mergeAgentStatusOrchestration(
      entry,
      state.runtimeAgentOrchestrationByPaneKey?.[paneKey]
    )
    const worktreeId = resolveAgentStatusWorktreeId(entry, tabIdToWorktreeId, orchestration)
    if (worktreeId) {
      record(worktreeId, entry.stateStartedAt, entry.interrupted === true)
    }
  }
  for (const retained of Object.values(state.retainedAgentsByPaneKey ?? {})) {
    record(retained.worktreeId, retained.entry.stateStartedAt, retained.entry.interrupted === true)
  }
  completionCache = { sources, byWorktreeId }
  return byWorktreeId
}

const statusCache = new Map<string, { inputs: readonly unknown[]; status: WorktreeStatus }>()

/** Same resolution as useWorktreeActivityStatus, usable for many workspaces in one selector. */
function selectResolvedWorktreeStatus(state: AppState, worktreeId: string): WorktreeStatus {
  const tabs = state.tabsByWorktree[worktreeId] ?? EMPTY_TABS
  const browserTabs = state.browserTabsByWorktree[worktreeId] ?? EMPTY_TABS
  const runtimePaneTitlesByTabId = selectRuntimePaneTitlesForWorktree(state, worktreeId)
  const ptyIdsByTabId = selectLivePtyIdsForWorktree(state, worktreeId)
  const terminalLayoutRootsByTabId = selectTerminalLayoutRootsForWorktree(state, worktreeId)
  const summary = selectWorktreeAgentActivitySummary(state, worktreeId)
  // Why: title heuristics depend on wall-clock staleness only through the summary, so
  // input identity is enough to reuse the result across unrelated store writes.
  const inputs = [
    tabs,
    browserTabs,
    runtimePaneTitlesByTabId,
    ptyIdsByTabId,
    terminalLayoutRootsByTabId,
    summary
  ]
  const cached = statusCache.get(worktreeId)
  if (cached && sameSources(cached.inputs, inputs)) {
    return cached.status
  }
  const status = resolveWorktreeStatus({
    tabs,
    browserTabs,
    ptyIdsByTabId,
    runtimePaneTitlesByTabId,
    agentStatusPaneIdsByTabId: summary.agentStatusPaneIdsByTabId,
    stalePaneIdsByTabId: summary.stalePaneIdsByTabId,
    terminalLayoutRootsByTabId,
    hasPermission: summary.hasPermission,
    hasLiveWorking: summary.hasLiveWorking,
    hasLiveMonitoring: summary.hasLiveMonitoring,
    hasInterrupted: summary.hasInterrupted,
    hasLiveDone: summary.hasLiveDone,
    hasRetainedDone: summary.hasRetainedDone
  })
  statusCache.set(worktreeId, { inputs, status })
  return status
}

export function selectWorktreeAttention(
  state: AppState,
  worktreeId: string,
  isUnread: boolean,
  viewedAt: number
): SidebarAttention | null {
  const completions = getCompletionTimes(state).get(worktreeId) ?? NO_COMPLETIONS
  return deriveWorktreeAttention({
    status: selectResolvedWorktreeStatus(state, worktreeId),
    isUnread,
    latestDoneAt: completions.latestDoneAt,
    latestInterruptedAt: completions.latestInterruptedAt,
    viewedAt
  })
}
