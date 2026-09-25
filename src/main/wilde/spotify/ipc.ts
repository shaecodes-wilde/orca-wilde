import { app, ipcMain, type WebContents } from 'electron'
import type {
  WildeSpotifyAccountStatus,
  WildeSpotifyBands,
  WildeSpotifyActionResult,
  WildeSpotifyConfig,
  WildeSpotifyMediaCommand,
  WildeSpotifyNowPlaying,
  WildeSpotifyPlaybackDetails,
  WildeSpotifyRecentContext
} from '../../../shared/wilde-spotify'
import { WildeSpotifyAudioTap } from './audio-tap-host'
import { WildeSpotifyMediaSession } from './media-session-host'
import { WildeSpotifyAuth } from './spotify-auth'
import { readWildeSpotifyConfig, writeWildeSpotifyConfig } from './spotify-store'
import { WildeSpotifyApi } from './spotify-web-api'

const NOW_PLAYING_EVENT = 'wildeSpotify:nowPlaying'
const ACCOUNT_EVENT = 'wildeSpotify:account'
const BANDS_EVENT = 'wildeSpotify:bands'

let config: WildeSpotifyConfig = { enabled: true, clientId: null, visualizer: true }
let accountStatus: WildeSpotifyAccountStatus = { state: 'disconnected' }
const mediaSession = new WildeSpotifyMediaSession()
const auth = new WildeSpotifyAuth(() => config.clientId)
const api = new WildeSpotifyApi(auth)
const nowPlayingSubscribers = new Map<number, { contents: WebContents; unsubscribe: () => void }>()
const accountSubscribers = new Map<number, WebContents>()
const bandSubscribers = new Map<number, WebContents>()
const bandDestroyHooked = new Set<number>()
const audioTap = new WildeSpotifyAudioTap((bands: WildeSpotifyBands) => {
  for (const [id, contents] of bandSubscribers) {
    if (contents.isDestroyed()) {
      bandSubscribers.delete(id)
    } else {
      contents.send(BANDS_EVENT, bands)
    }
  }
})

/**
 * Captures Spotify's audio only while it can be seen: the visualizer is on, a visible player is
 * subscribed, and Spotify is playing. Paused means no capture at all.
 */
function updateAudioTap(): void {
  const state = mediaSession.getState()
  const playing = state.available && state.status === 'Playing'
  audioTap.setActive(config.enabled && config.visualizer && bandSubscribers.size > 0 && playing)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function run(action: () => Promise<void>): Promise<WildeSpotifyActionResult> {
  try {
    await action()
    return { ok: true }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}

function setAccountStatus(status: WildeSpotifyAccountStatus): void {
  accountStatus = status
  for (const [id, contents] of accountSubscribers) {
    if (contents.isDestroyed()) {
      accountSubscribers.delete(id)
    } else {
      contents.send(ACCOUNT_EVENT, status)
    }
  }
}

async function refreshAccountStatus(): Promise<void> {
  if (!config.clientId) {
    setAccountStatus({ state: 'no-client-id' })
    return
  }
  if (!auth.hasSession()) {
    setAccountStatus({ state: 'disconnected' })
    return
  }
  try {
    setAccountStatus({ state: 'connected', displayName: await api.getDisplayName() })
  } catch (error) {
    setAccountStatus({ state: 'error', message: messageOf(error) })
  }
}

const HANDLE_CHANNELS = [
  'wildeSpotify:getConfig',
  'wildeSpotify:setConfig',
  'wildeSpotify:isNowPlayingSupported',
  'wildeSpotify:media',
  'wildeSpotify:connect',
  'wildeSpotify:disconnect',
  'wildeSpotify:getPlaybackDetails',
  'wildeSpotify:seek',
  'wildeSpotify:setLiked',
  'wildeSpotify:getRecent',
  'wildeSpotify:playContext',
  'wildeSpotify:setVolume',
  'wildeSpotify:isVisualizerSupported'
] as const

/** IPC for the Wilde Spotify mini-player (right sidebar). Windows-only now-playing; Web API anywhere. */
export function registerWildeSpotifyHandlers(): void {
  config = readWildeSpotifyConfig()
  void refreshAccountStatus()
  app.once('will-quit', () => {
    audioTap.dispose()
    mediaSession.dispose()
  })
  mediaSession.observe(() => updateAudioTap())
  // Why: registration can run again after a renderer recovery; ipcMain.handle throws on duplicates.
  for (const channel of HANDLE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('wildeSpotify:getConfig', (): WildeSpotifyConfig => config)
  ipcMain.handle('wildeSpotify:setConfig', async (_event, update: Partial<WildeSpotifyConfig>): Promise<WildeSpotifyConfig> => {
    const clientIdChanged = 'clientId' in update && update.clientId !== config.clientId
    config = writeWildeSpotifyConfig({ ...config, ...update })
    if (clientIdChanged) {
      // A different Spotify app cannot use the old app's refresh token.
      auth.logout()
    }
    updateAudioTap()
    await refreshAccountStatus()
    return config
  })

  ipcMain.handle('wildeSpotify:isNowPlayingSupported', (): boolean => mediaSession.isSupported)
  ipcMain.removeAllListeners('wildeSpotify:subscribeNowPlaying')
  ipcMain.on('wildeSpotify:subscribeNowPlaying', (event) => {
    const contents = event.sender
    nowPlayingSubscribers.get(contents.id)?.unsubscribe()
    const unsubscribe = mediaSession.subscribe((state: WildeSpotifyNowPlaying) => {
      if (contents.isDestroyed()) {
        nowPlayingSubscribers.get(contents.id)?.unsubscribe()
        nowPlayingSubscribers.delete(contents.id)
        return
      }
      contents.send(NOW_PLAYING_EVENT, state)
    })
    nowPlayingSubscribers.set(contents.id, { contents, unsubscribe })
    contents.once('destroyed', () => {
      nowPlayingSubscribers.get(contents.id)?.unsubscribe()
      nowPlayingSubscribers.delete(contents.id)
    })
    contents.send(NOW_PLAYING_EVENT, mediaSession.getState())
  })
  ipcMain.handle('wildeSpotify:media', (_event, command: WildeSpotifyMediaCommand): Promise<boolean> =>
    mediaSession.command(command)
  )

  ipcMain.removeAllListeners('wildeSpotify:subscribeAccount')
  ipcMain.on('wildeSpotify:subscribeAccount', (event) => {
    accountSubscribers.set(event.sender.id, event.sender)
    event.sender.send(ACCOUNT_EVENT, accountStatus)
  })
  ipcMain.handle('wildeSpotify:connect', async (): Promise<WildeSpotifyActionResult> => {
    setAccountStatus({ state: 'connecting' })
    const result = await run(() => auth.login())
    if (result.ok) {
      await refreshAccountStatus()
    } else {
      setAccountStatus({ state: 'error', message: result.message })
    }
    return result
  })
  ipcMain.handle('wildeSpotify:disconnect', async (): Promise<void> => {
    auth.logout()
    await refreshAccountStatus()
  })

  ipcMain.handle('wildeSpotify:getPlaybackDetails', async (): Promise<WildeSpotifyPlaybackDetails | null> => {
    if (!auth.hasSession()) {
      return null
    }
    try {
      return await api.getPlaybackDetails()
    } catch {
      return null
    }
  })
  ipcMain.handle('wildeSpotify:seek', (_event, positionMs: number) => run(() => api.seek(positionMs)))
  ipcMain.handle('wildeSpotify:setLiked', (_event, trackUri: string, trackId: string, liked: boolean) =>
    run(() => api.setSaved(trackUri, trackId, liked))
  )
  ipcMain.handle(
    'wildeSpotify:getRecent',
    async (): Promise<{ ok: true; contexts: WildeSpotifyRecentContext[] } | { ok: false; message: string }> => {
      try {
        return { ok: true, contexts: await api.getRecentContexts() }
      } catch (error) {
        return { ok: false, message: messageOf(error) }
      }
    }
  )
  ipcMain.handle('wildeSpotify:playContext', (_event, contextUri: string) => run(() => api.playContext(contextUri)))

  ipcMain.handle('wildeSpotify:setVolume', (_event, percent: number) => run(() => api.setVolume(percent)))

  ipcMain.handle('wildeSpotify:isVisualizerSupported', (): boolean => audioTap.isSupported)
  ipcMain.removeAllListeners('wildeSpotify:subscribeBands')
  ipcMain.removeAllListeners('wildeSpotify:unsubscribeBands')
  ipcMain.on('wildeSpotify:subscribeBands', (event) => {
    const contents = event.sender
    if (!bandDestroyHooked.has(contents.id)) {
      bandDestroyHooked.add(contents.id)
      contents.once('destroyed', () => {
        bandDestroyHooked.delete(contents.id)
        bandSubscribers.delete(contents.id)
        updateAudioTap()
      })
    }
    bandSubscribers.set(contents.id, contents)
    updateAudioTap()
  })
  ipcMain.on('wildeSpotify:unsubscribeBands', (event) => {
    bandSubscribers.delete(event.sender.id)
    updateAudioTap()
  })
}
