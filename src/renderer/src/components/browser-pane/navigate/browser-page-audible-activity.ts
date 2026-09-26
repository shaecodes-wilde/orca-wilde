// Why module-level: same reason as browser-page-download-activity — the pane unmounts while its
// worktree is hidden, but guest-budget eviction must spare hidden pages still playing audio.
const audiblePageIds = new Set<string>()

export function isBrowserPageAudible(browserPageId: string): boolean {
  return audiblePageIds.has(browserPageId)
}

/** App-lifetime tracking; install once from the surface host (Terminal). */
export function installBrowserPageAudibleTracking(onChange: () => void = () => {}): () => void {
  const remove = window.api.browser.onAudibleChanged(({ browserPageId, audible }) => {
    if (audible === audiblePageIds.has(browserPageId)) {
      return
    }
    if (audible) {
      audiblePageIds.add(browserPageId)
    } else {
      audiblePageIds.delete(browserPageId)
    }
    onChange()
  })
  return () => {
    remove()
    audiblePageIds.clear()
  }
}
