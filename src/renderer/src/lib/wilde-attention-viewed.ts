import { createStore } from 'zustand/vanilla'

// Wilde: when the user last looked at each workspace. The sidebar attention cards
// (components/sidebar/worktree-list/attention) show mint only for agent completions
// newer than this. Kept out of the app store: activation and every terminal
// keystroke/click write here, and nothing but the attention cards cares.

type WildeAttentionViewedState = {
  /** Why: completions from before this launch count as seen, so restored done rows don't glow. */
  sessionStartedAt: number
  viewedAtByWorktreeId: Readonly<Record<string, number>>
}

// Why: clearWorktreeUnread runs per keystroke; a done that lands mid-typing is at most this stale.
const VIEWED_WRITE_THROTTLE_MS = 1000

export const wildeAttentionViewedStore = createStore<WildeAttentionViewedState>(() => ({
  sessionStartedAt: Date.now(),
  viewedAtByWorktreeId: {}
}))

export function markWorktreeViewed(worktreeId: string, now = Date.now()): void {
  const state = wildeAttentionViewedStore.getState()
  const previous = state.viewedAtByWorktreeId[worktreeId]
  if (previous !== undefined && now - previous < VIEWED_WRITE_THROTTLE_MS) {
    return
  }
  wildeAttentionViewedStore.setState({
    viewedAtByWorktreeId: { ...state.viewedAtByWorktreeId, [worktreeId]: now }
  })
}

export function getWorktreeViewedAt(state: WildeAttentionViewedState, worktreeId: string): number {
  return state.viewedAtByWorktreeId[worktreeId] ?? state.sessionStartedAt
}
