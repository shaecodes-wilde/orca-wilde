/** Wilde Spotify mini-player: types shared by main, preload and renderer. */

/** Spotify matches redirect URIs exactly, so the loopback port is fixed (registered once by the user). */
export const WILDE_SPOTIFY_REDIRECT_PORT = 43117
export const WILDE_SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${WILDE_SPOTIFY_REDIRECT_PORT}/callback`

export type WildeSpotifyMediaCommand = 'toggle' | 'next' | 'previous'

/** Now playing, read from the Spotify desktop app's Windows media session. */
export type WildeSpotifyNowPlaying =
  | { available: false }
  | {
      available: true
      title: string
      artist: string
      album: string
      trackKey: string
      /** Windows playback status, e.g. 'Playing', 'Paused', 'Stopped'. */
      status: string
      positionMs: number
      durationMs: number
      /** When the position was sampled (Spotify only refreshes it on play/pause/seek). */
      positionUpdatedAtMs: number
      canNext: boolean
      canPrevious: boolean
      /** data: URL of the album art, or null when Windows has none. */
      artwork?: string | null
    }

export type WildeSpotifyConfig = {
  /** Show the player in the right sidebar. */
  enabled: boolean
  /** Client ID of the user's own Spotify developer app (PKCE; no secret). */
  clientId: string | null
}

export const DEFAULT_WILDE_SPOTIFY_CONFIG: WildeSpotifyConfig = { enabled: true, clientId: null }

export type WildeSpotifyAccountStatus =
  | { state: 'no-client-id' }
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; displayName: string | null }
  | { state: 'error'; message: string }

/** Web API view of what is playing, for seek and like/save. */
export type WildeSpotifyPlaybackDetails = {
  trackId: string
  trackUri: string
  liked: boolean
  progressMs: number
  durationMs: number
  isPlaying: boolean
}

export type WildeSpotifyRecentContext = {
  uri: string
  kind: 'album' | 'playlist' | 'artist'
  name: string
  subtitle: string
  imageUrl: string | null
  playedAt: string
}

export type WildeSpotifyActionResult = { ok: true } | { ok: false; message: string }

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeWildeSpotifyConfig(value: unknown): WildeSpotifyConfig {
  if (!isPlainRecord(value)) {
    return DEFAULT_WILDE_SPOTIFY_CONFIG
  }
  const record = value
  const clientId =
    typeof record.clientId === 'string' && /^[A-Za-z0-9]{16,64}$/.test(record.clientId.trim())
      ? record.clientId.trim()
      : null
  return { enabled: record.enabled !== false, clientId }
}
