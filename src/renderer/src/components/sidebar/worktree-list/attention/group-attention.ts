import type { WorktreeStatus } from '@/lib/worktree-status'

// Wilde sidebar attention cards: lavender = a workspace needs you, mint = an agent
// finished and you haven't looked yet. Lavender outranks mint.
export type SidebarAttention = 'lavender' | 'mint'

export type WorktreeAttentionInput = {
  status: WorktreeStatus
  isUnread: boolean
  /** Latest clean `done` stateStartedAt across this workspace's agents, or 0. */
  latestDoneAt: number
  /** Latest interrupted (errored) completion stateStartedAt, or 0. */
  latestInterruptedAt: number
  viewedAt: number
}

export function deriveWorktreeAttention(input: WorktreeAttentionInput): SidebarAttention | null {
  if (input.status === 'permission' || input.isUnread) {
    return 'lavender'
  }
  // Why: an error, like a clean finish, is news only until you've looked at it.
  if (input.status === 'interrupted' && input.latestInterruptedAt > input.viewedAt) {
    return 'lavender'
  }
  if (input.status === 'done' && input.latestDoneAt > input.viewedAt) {
    return 'mint'
  }
  return null
}

export function combineAttention(
  attentions: Iterable<SidebarAttention | null | undefined>
): SidebarAttention | null {
  let result: SidebarAttention | null = null
  for (const attention of attentions) {
    if (attention === 'lavender') {
      return 'lavender'
    }
    if (attention === 'mint') {
      result = 'mint'
    }
  }
  return result
}
