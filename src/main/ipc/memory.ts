import { ipcMain, webContents } from 'electron'
import type { MemorySnapshot } from '../../shared/process-stats-types'
import type { Store } from '../persistence'
import { collectMemorySnapshot, type BrowserGuestPidMap } from '../memory/collector'
import { browserManager } from '../browser/browser-manager'

function browserGuestPids(): BrowserGuestPidMap {
  const byPid: BrowserGuestPidMap = new Map()
  for (const [pageId, id] of browserManager.getWebContentsIdByTabId()) {
    const guest = webContents.fromId(id)
    const pid = guest && !guest.isDestroyed() ? guest.getOSProcessId() : 0
    // Why first-wins: a renderer process shared by several pages counts once.
    if (pid > 0 && !byPid.has(pid)) {
      byPid.set(pid, { pageId, worktreeId: browserManager.getWorktreeIdForTab(pageId) ?? null })
    }
  }
  return byPid
}

export function registerMemoryHandlers(store: Store): void {
  ipcMain.handle('memory:getSnapshot', (): Promise<MemorySnapshot> =>
    collectMemorySnapshot(store, browserGuestPids)
  )
}
