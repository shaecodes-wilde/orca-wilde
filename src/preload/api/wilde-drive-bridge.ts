import { ipcRenderer } from 'electron'
import type { WildeDriveApi } from './wilde-drive-api'

export const wildeDriveApi = {
  getConfig: () => ipcRenderer.invoke('wildeDrive:getConfig'),
  setConfig: (update) => ipcRenderer.invoke('wildeDrive:setConfig', update)
} satisfies WildeDriveApi
