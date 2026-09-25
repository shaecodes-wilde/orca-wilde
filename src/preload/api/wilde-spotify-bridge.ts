import { ipcRenderer } from 'electron'
import type { WildeSpotifyAccountStatus, WildeSpotifyNowPlaying } from '../../shared/wilde-spotify'
import type { WildeSpotifyApi } from './wilde-spotify-api'

export const wildeSpotifyApi = {
  getConfig: () => ipcRenderer.invoke('wildeSpotify:getConfig'),
  setConfig: (update) => ipcRenderer.invoke('wildeSpotify:setConfig', update),
  isNowPlayingSupported: () => ipcRenderer.invoke('wildeSpotify:isNowPlayingSupported'),
  onNowPlaying: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WildeSpotifyNowPlaying): void =>
      callback(state)
    ipcRenderer.on('wildeSpotify:nowPlaying', listener)
    // Why send after listening: the main process replies with the current state immediately.
    ipcRenderer.send('wildeSpotify:subscribeNowPlaying')
    return () => ipcRenderer.removeListener('wildeSpotify:nowPlaying', listener)
  },
  media: (command) => ipcRenderer.invoke('wildeSpotify:media', command),
  onAccount: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: WildeSpotifyAccountStatus): void =>
      callback(status)
    ipcRenderer.on('wildeSpotify:account', listener)
    ipcRenderer.send('wildeSpotify:subscribeAccount')
    return () => ipcRenderer.removeListener('wildeSpotify:account', listener)
  },
  connect: () => ipcRenderer.invoke('wildeSpotify:connect'),
  disconnect: () => ipcRenderer.invoke('wildeSpotify:disconnect'),
  getPlaybackDetails: () => ipcRenderer.invoke('wildeSpotify:getPlaybackDetails'),
  seek: (positionMs) => ipcRenderer.invoke('wildeSpotify:seek', positionMs),
  setLiked: (trackUri, trackId, liked) =>
    ipcRenderer.invoke('wildeSpotify:setLiked', trackUri, trackId, liked),
  getRecent: () => ipcRenderer.invoke('wildeSpotify:getRecent'),
  playContext: (contextUri) => ipcRenderer.invoke('wildeSpotify:playContext', contextUri)
} satisfies WildeSpotifyApi
