import { ipcRenderer } from 'electron'
import type { WildeObsStatus } from '../../shared/wilde-obs'
import type { WildeObsApi } from './wilde-obs-api'

export const wildeObsApi = {
  getConfig: () => ipcRenderer.invoke('wildeObs:getConfig'),
  setConfig: (update) => ipcRenderer.invoke('wildeObs:setConfig', update),
  getStatus: () => ipcRenderer.invoke('wildeObs:getStatus'),
  onStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: WildeObsStatus): void =>
      callback(status)
    ipcRenderer.on('wildeObs:status', listener)
    // Why send after listening: the main process replies with the current status immediately.
    ipcRenderer.send('wildeObs:subscribeStatus')
    return () => ipcRenderer.removeListener('wildeObs:status', listener)
  },
  setScene: (sceneName) => ipcRenderer.invoke('wildeObs:setScene', sceneName),
  toggleMic: () => ipcRenderer.invoke('wildeObs:toggleMic')
} satisfies WildeObsApi
