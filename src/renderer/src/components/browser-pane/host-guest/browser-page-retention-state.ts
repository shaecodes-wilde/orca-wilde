// Contract between the browser guest budget (writer) and the resource dashboard (reader).
export type BrowserPageRetentionReason =
  | 'visible'
  | 'automation'
  | 'mobile'
  | 'remote-viewer'
  | 'download'
  | 'audible'
  | 'warm'

export type BrowserPageRetentionEntry = {
  pageId: string
  worktreeId: string
  live: boolean
  reason: BrowserPageRetentionReason | null
}

// ponytail: snapshot refreshes only per retention pass (worktree switch, surface change, signal
// flip), so pages opened/closed in the active worktree show up on the next pass.
let entries: BrowserPageRetentionEntry[] = []
const listeners = new Set<() => void>()

export function getBrowserPageRetentionEntries(): BrowserPageRetentionEntry[] {
  return entries
}

export function onBrowserPageRetentionChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Written by the retention pass (use-terminal-browser-retention). */
export function publishBrowserPageRetentionEntries(next: BrowserPageRetentionEntry[]): void {
  entries = next
  for (const listener of listeners) {
    listener()
  }
}
