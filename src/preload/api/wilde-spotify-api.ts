import type {
  WildeSpotifyAccountStatus,
  WildeSpotifyActionResult,
  WildeSpotifyConfig,
  WildeSpotifyMediaCommand,
  WildeSpotifyNowPlaying,
  WildeSpotifyPlaybackDetails,
  WildeSpotifyRecentContext
} from '../../shared/wilde-spotify'

/** Wilde Spotify mini-player. Desktop-only, so absent from the web client's API. */
export type WildeSpotifyApi = {
  getConfig: () => Promise<WildeSpotifyConfig>
  setConfig: (update: Partial<WildeSpotifyConfig>) => Promise<WildeSpotifyConfig>
  isNowPlayingSupported: () => Promise<boolean>
  onNowPlaying: (callback: (state: WildeSpotifyNowPlaying) => void) => () => void
  media: (command: WildeSpotifyMediaCommand) => Promise<boolean>
  onAccount: (callback: (status: WildeSpotifyAccountStatus) => void) => () => void
  connect: () => Promise<WildeSpotifyActionResult>
  disconnect: () => Promise<void>
  getPlaybackDetails: () => Promise<WildeSpotifyPlaybackDetails | null>
  seek: (positionMs: number) => Promise<WildeSpotifyActionResult>
  setLiked: (trackUri: string, trackId: string, liked: boolean) => Promise<WildeSpotifyActionResult>
  getRecent: () => Promise<
    { ok: true; contexts: WildeSpotifyRecentContext[] } | { ok: false; message: string }
  >
  playContext: (contextUri: string) => Promise<WildeSpotifyActionResult>
}
