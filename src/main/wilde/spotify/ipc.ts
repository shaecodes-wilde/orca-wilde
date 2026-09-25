import { app, ipcMain, type WebContents } from 'electron'
import type {
  WildeSpotifyAccountStatus,
  WildeSpotifyActionResult,
  WildeSpotifyConfig,
  WildeSpotifyMediaCommand,
  WildeSpotifyNowPlaying,
  WildeSpotifyPlaybackDetails,
  WildeSpotifyRecentContext
} from '../../../shared/wilde-spotify'
import { WildeSpotifyMediaSession } from './media-session-host'
import { WildeSpotifyAuth } from './spotify-auth'
import { readWildeSpotifyConfig, writeWildeSpotifyConfig } from './spotify-store'
import { WildeSpotifyApi } from './spotify-web-api'

const NOW_PLAYING_EVENT = 'wildeSpotify:nowPlaying'
const ACCOUNT_EVENT = 'wildeSpotify:account'

let config: WildeSpotifyConfig = { enabled: true, clientId: null }
let accountStatus: WildeSpotifyAccountStatus = { state: 'disconnected' }
const mediaSession = new WildeSpotifyMediaSession()
const auth = new WildeSpotifyAuth(() => config.clientId)
const api = new WildeSpotifyApi(auth)
const nowPlayingSubscribers = new Map<number, { contents: WebContents; unsubscribe: () => void }>()
const accountSubscribers = new Map<number, WebContents>()

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
  'wildeSpotify:playContext'
] as const

/** IPC for the Wilde Spotify mini-player (right sidebar). Windows-only now-playing; Web API anywhere. */
export function registerWildeSpotifyHandlers(): void {
  config = readWildeSpotifyConfig()
  void refreshAccountStatus()
  app.once('will-quit', () => mediaSession.dispose())
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
}
