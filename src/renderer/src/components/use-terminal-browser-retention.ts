import { useEffect } from 'react'
import { useAppStore } from '../store'
import { onBrowserGuestPaintRetentionChange } from './browser-pane/host-guest/browser-guest-paint-retention'
import {
  browserPageProtectionReason,
  selectBrowserGuestEvictionPages,
  touchBrowserGuestRecency
} from './browser-pane/host-guest/browser-guest-worktree-retention'
import { publishBrowserPageRetentionEntries } from './browser-pane/host-guest/browser-page-retention-state'
import { installBrowserPageDownloadActivityTracking } from './browser-pane/navigate/browser-page-download-activity'
import { installBrowserPageAudibleTracking } from './browser-pane/navigate/browser-page-audible-activity'
import { hasLiveBrowserGuest } from './browser-pane/host-guest/webview-registry'
import {
  destroyEvictedBrowserGuest,
  worktreeBrowserGuestIds
} from '../store/slices/browser-webview-cleanup'
import type { TerminalParkingFoundation } from './use-terminal-parking-foundation'

export function useTerminalBrowserRetention(controller: TerminalParkingFoundation): void {
  const {
    browserGuestRetentionBudgetEnabled,
    browserGuestLivePageBudget,
    browserGuestRetentionRevision,
    browserGuestPageRecencyRef,
    mountedWorktreeIdsRef,
    renderedActiveWorktreeId,
    setBrowserGuestRetentionRevision,
    workspaceSurfaceIds
  } = controller

  useEffect(() => {
    const invalidateRetention = (): void => {
      setBrowserGuestRetentionRevision((revision) => revision + 1)
    }
    const removeDownloadTracking = installBrowserPageDownloadActivityTracking(invalidateRetention)
    const removeAudibleTracking = installBrowserPageAudibleTracking(invalidateRetention)
    const removePaintRetentionTracking = onBrowserGuestPaintRetentionChange(invalidateRetention)
    return () => {
      removeDownloadTracking()
      removeAudibleTracking()
      removePaintRetentionTracking()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the controller setter preserves its original stable identity.
  }, [])

  useEffect(() => {
    if (!renderedActiveWorktreeId) {
      return
    }
    const recency = browserGuestPageRecencyRef.current
    const state = useAppStore.getState()
    const candidates = Object.entries(state.browserTabsByWorktree).flatMap(([worktreeId, tabs]) =>
      worktreeBrowserGuestIds(tabs, state.browserPagesByWorkspace).map((pageId) => ({
        pageId,
        worktreeId,
        live: hasLiveBrowserGuest(pageId)
      }))
    )
    const knownPageIds = new Set(candidates.map((candidate) => candidate.pageId))
    for (let index = recency.length - 1; index >= 0; index--) {
      if (!knownPageIds.has(recency[index])) {
        recency.splice(index, 1)
      }
    }
    // ponytail: no hysteresis — a page past the budget is evicted on the pass that hides it; add a
    // grace delay if revisit reload thrash appears.
    const { entries, evictedPageIds } = selectBrowserGuestEvictionPages({
      candidates,
      recency,
      activeWorktreeId: renderedActiveWorktreeId,
      isRetained: (worktreeId) => mountedWorktreeIdsRef.current.has(worktreeId),
      protectionReason: browserPageProtectionReason,
      limit: browserGuestRetentionBudgetEnabled ? browserGuestLivePageBudget : Infinity
    })
    for (const pageId of evictedPageIds) {
      destroyEvictedBrowserGuest(pageId)
    }
    publishBrowserPageRetentionEntries(entries)
    return () => {
      // Why touch on the way out: the worktree being left holds the most recently used pages,
      // including any opened after it was activated. ponytail: tab order within a worktree, not
      // per-tab activation order.
      const now = useAppStore.getState()
      const leavingPageIds = worktreeBrowserGuestIds(
        now.browserTabsByWorktree[renderedActiveWorktreeId] ?? [],
        now.browserPagesByWorkspace
      )
      for (const pageId of leavingPageIds.toReversed()) {
        touchBrowserGuestRecency(recency, pageId)
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- controller refs preserve their original stable identities.
  }, [
    renderedActiveWorktreeId,
    workspaceSurfaceIds,
    browserGuestRetentionBudgetEnabled,
    browserGuestLivePageBudget,
    browserGuestRetentionRevision
  ])
}
