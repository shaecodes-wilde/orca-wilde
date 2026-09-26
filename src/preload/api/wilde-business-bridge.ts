import { ipcRenderer } from 'electron'
import type { WildeBusinessApi } from '../../shared/wilde/commands'

export const wildeBusinessApi = {
  auditCommand: (input) => ipcRenderer.invoke('wildeBusiness:auditCommand', input),
  resolveCommand: (input) => ipcRenderer.invoke('wildeBusiness:resolveCommand', input),
  execute: (request) => ipcRenderer.invoke('wildeBusiness:execute', request),
  targets: () => ipcRenderer.invoke('wildeBusiness:targets'),
  connection: () => ipcRenderer.invoke('wildeBusiness:connection'),
  configureConnection: (input) => ipcRenderer.invoke('wildeBusiness:configureConnection', input),
  sync: () => ipcRenderer.invoke('wildeBusiness:sync'),
  setConnectionEnabled: (enabled) =>
    ipcRenderer.invoke('wildeBusiness:setConnectionEnabled', enabled),
  chooseImport: (mode) => ipcRenderer.invoke('wildeBusiness:chooseImport', mode),
  saveExport: () => ipcRenderer.invoke('wildeBusiness:saveExport')
} satisfies WildeBusinessApi
