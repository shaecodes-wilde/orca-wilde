import type { BrowserPage, BrowserWorkspace } from '../../../../shared/browser-workspace-types'
import {
  destroyPersistentWebview,
  moveFocusToRendererBeforeFocusedWebviewHidden
} from '../../components/browser-pane/host-guest/webview-registry'
import {
  getExplicitBrowserPageZoomLevel,
  rememberExplicitBrowserPageZoomLevel
} from '../../components/browser-pane/host-guest/browser-page-zoom'

export { moveFocusToRendererBeforeFocusedWebviewHidden }

export function destroyRemovedBrowserWebview(browserPageId: string): void {
  destroyPersistentWebview(browserPageId)
}

export function collectBrowserWebviewIds(
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>,
  browserPagesByWorkspace: Record<string, BrowserPage[]>
): Set<string> {
  const ids = new Set<string>()
  for (const pages of Object.values(browserPagesByWorkspace)) {
    for (const page of pages) {
      ids.add(page.id)
    }
  }

  for (const tabs of Object.values(browserTabsByWorktree)) {
    for (const tab of tabs) {
      if ((browserPagesByWorkspace[tab.id] ?? []).length === 0) {
        ids.add(tab.id)
      }
    }
  }
  return ids
}

// Legacy sessions persisted before pages existed key their webview by the
// workspace tab id (same fallback as collectBrowserWebviewIds).
export function worktreeBrowserGuestIds(
  tabs: readonly BrowserWorkspace[],
  browserPagesByWorkspace: Record<string, BrowserPage[]>
): string[] {
  return tabs.flatMap((tab) => {
    const pages = browserPagesByWorkspace[tab.id] ?? []
    return pages.length === 0 ? [tab.id] : pages.map((page) => page.id)
  })
}

// Why: guest-budget eviction destroys a hidden page's guest while its tab/page
// stays in the store, so a revisit rebuilds from state. Eviction is not a user
// close — the tab stays in the UI, so the user's zoom is re-remembered past the
// destroy-path forget: the revisit reasserts it instead of writing the default
// through Chromium's partition-wide HostZoomMap (which would also reset
// same-host sibling tabs).
export function destroyEvictedBrowserGuest(guestId: string): void {
  const explicitZoomLevel = getExplicitBrowserPageZoomLevel(guestId)
  destroyRemovedBrowserWebview(guestId)
  if (explicitZoomLevel !== null) {
    rememberExplicitBrowserPageZoomLevel(guestId, explicitZoomLevel)
  }
}

export function destroyWorkspaceWebviews(
  browserPagesByWorkspace: Record<string, BrowserPage[]>,
  workspaceId: string
): void {
  const pages = browserPagesByWorkspace[workspaceId] ?? []
  if (pages.length === 0) {
    // Why: legacy sessions persisted before pages existed still key their
    // webview by workspace id. Preserve the legacy destroy as a fallback.
    destroyRemovedBrowserWebview(workspaceId)
    return
  }
  for (const page of pages) {
    destroyRemovedBrowserWebview(page.id)
  }
}
