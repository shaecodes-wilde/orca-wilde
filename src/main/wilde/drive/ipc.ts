import { ipcMain } from 'electron'
import { isAbsolute } from 'node:path'
import { authorizeExternalPath } from '../../ipc/filesystem-auth'
import type { WildeDriveConfig } from '../../../shared/wilde-drive'
import { readWildeDriveConfig, writeWildeDriveConfig } from './drive-store'

const HANDLE_CHANNELS = ['wildeDrive:getConfig', 'wildeDrive:setConfig'] as const

let config: WildeDriveConfig = { rootPath: '' }

/**
 * Why: the Drive folder lives outside every workspace, so the fs:* IPC would refuse it. The
 * external-path grant covers the folder and everything under it, but it is in-memory only —
 * re-grant it at startup and whenever the folder changes.
 */
function authorizeRoot(): void {
  if (config.rootPath && isAbsolute(config.rootPath)) {
    authorizeExternalPath(config.rootPath)
  }
}

/** IPC for the Wilde Google Drive sidebar tab. */
export function registerWildeDriveHandlers(): void {
  config = readWildeDriveConfig()
  authorizeRoot()
  // Why: registration can run again after a renderer recovery; ipcMain.handle throws on duplicates.
  for (const channel of HANDLE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('wildeDrive:getConfig', (): WildeDriveConfig => {
    authorizeRoot()
    return config
  })
  ipcMain.handle(
    'wildeDrive:setConfig',
    (_event, update: Partial<WildeDriveConfig>): WildeDriveConfig => {
      config = writeWildeDriveConfig({ ...config, ...update })
      authorizeRoot()
      return config
    }
  )
}
