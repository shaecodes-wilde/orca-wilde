import { hasActiveBrowserPageDownload } from '../navigate/browser-page-download-activity'
import { isBrowserPageAudible } from '../navigate/browser-page-audible-activity'
import { browserPagePaintRetentionReason } from './browser-guest-paint-retention'
import type {
  BrowserPageRetentionEntry,
  BrowserPageRetentionReason
} from './browser-page-retention-state'

// Why a global page budget: every live guest in a hidden worktree is one Electron guest process
// kept purely for instant revisits, so memory grew with pages visited (#12137). Pages beyond the
// budget are destroyed and reload from persisted tab state on the next visit. Mirrors the
// browserGuestLivePageBudget setting default.
export const DEFAULT_BROWSER_GUEST_LIVE_PAGE_BUDGET = 8

export type BrowserGuestRetentionCandidate = { pageId: string; worktreeId: string; live: boolean }

/**
 * Per-page eviction over hidden mounted worktrees, LRU-first.
 *
 * recency is most-recently-touched page first; pages missing from it rank last. Active-worktree
 * pages are 'visible': never evicted, never counted. A protected page (automation / mobile /
 * remote viewer / download / audible) stays live without taking a warm slot and without shielding
 * its siblings. Live pages beyond `limit` warm slots are evicted individually.
 */
export function selectBrowserGuestEvictionPages(args: {
  candidates: readonly BrowserGuestRetentionCandidate[]
  recency: readonly string[]
  activeWorktreeId: string | null
  isRetained: (worktreeId: string) => boolean
  protectionReason: (pageId: string) => BrowserPageRetentionReason | null
  limit: number
}): { entries: BrowserPageRetentionEntry[]; evictedPageIds: string[] } {
  const rank = (pageId: string): number => {
    const index = args.recency.indexOf(pageId)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  const ordered = [...args.candidates].sort((a, b) => rank(a.pageId) - rank(b.pageId))
  const entries: BrowserPageRetentionEntry[] = []
  const evictedPageIds: string[] = []
  let warm = 0
  for (const candidate of ordered) {
    const entry: BrowserPageRetentionEntry = { ...candidate, reason: null }
    entries.push(entry)
    if (!candidate.live) {
      continue
    }
    if (candidate.worktreeId === args.activeWorktreeId) {
      entry.reason = 'visible'
    } else if (args.isRetained(candidate.worktreeId)) {
      entry.reason = args.protectionReason(candidate.pageId)
      if (entry.reason === null && warm < args.limit) {
        warm += 1
        entry.reason = 'warm'
      } else if (entry.reason === null) {
        evictedPageIds.push(candidate.pageId)
        entry.live = false
      }
    }
  }
  return { entries, evictedPageIds }
}

// Why more than the paint terms: eviction DESTROYS the guest rather than parking it, main cancels
// a page's active downloads when its guest unregisters (tab-close semantics), and a destroyed
// guest silences whatever it was playing.
export function browserPageProtectionReason(pageId: string): BrowserPageRetentionReason | null {
  const paintReason = browserPagePaintRetentionReason(pageId)
  if (paintReason) {
    return paintReason
  }
  if (hasActiveBrowserPageDownload(pageId)) {
    return 'download'
  }
  return isBrowserPageAudible(pageId) ? 'audible' : null
}

// LRU order = page touch order; touching moves the id to the front.
export function touchBrowserGuestRecency(recency: string[], pageId: string): void {
  const index = recency.indexOf(pageId)
  if (index !== -1) {
    recency.splice(index, 1)
  }
  recency.unshift(pageId)
}
