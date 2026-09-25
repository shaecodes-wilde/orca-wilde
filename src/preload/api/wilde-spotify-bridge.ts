import { ipcRenderer } from 'electron'
import type {
  WildeSpotifyAccountStatus,
  WildeSpotifyBands,
  WildeSpotifyNowPlaying
} from '../../shared/wilde-spotify'
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
  playContext: (contextUri) => ipcRenderer.invoke('wildeSpotify:playContext', contextUri),
  setVolume: (percent) => ipcRenderer.invoke('wildeSpotify:setVolume', percent),
  isVisualizerSupported: () => ipcRenderer.invoke('wildeSpotify:isVisualizerSupported'),
  onBands: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, bands: WildeSpotifyBands): void =>
      callback(bands)
    ipcRenderer.on('wildeSpotify:bands', listener)
    ipcRenderer.send('wildeSpotify:subscribeBands')
    return () => {
      ipcRenderer.removeListener('wildeSpotify:bands', listener)
      // Why: capture stops as soon as no visible player is listening.
      ipcRenderer.send('wildeSpotify:unsubscribeBands')
    }
  }
} satisfies WildeSpotifyApi
