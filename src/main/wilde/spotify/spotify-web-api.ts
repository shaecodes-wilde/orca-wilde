import {
  isPlainRecord,
  type WildeSpotifyPlaybackDetails,
  type WildeSpotifyRecentContext
} from '../../../shared/wilde-spotify'
import type { WildeSpotifyAuth } from './spotify-auth'

const API = 'https://api.spotify.com/v1'
const RECENT_CONTEXT_LIMIT = 12

export class WildeSpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

type Fetch = typeof fetch

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function firstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images)) {
    return null
  }
  // Spotify lists images largest first; the menu shows ~48px art, so prefer a small one.
  const urls = images.filter(isPlainRecord).map((image) => asString(image.url)).filter(Boolean)
  return urls.at(-1) ?? null
}

function joinArtistNames(artists: unknown): string {
  return Array.isArray(artists)
    ? artists.filter(isPlainRecord).map((artist) => asString(artist.name)).filter(Boolean).join(', ')
    : ''
}

/**
 * Collapses recently-played tracks into the distinct albums/playlists/artists they were played
 * from, newest first. Tracks without a context (e.g. played from Liked Songs) fall back to their
 * album. Playlist/artist names and art need extra lookups, returned as `needsLookup`.
 */
export function collectRecentContexts(body: unknown): {
  contexts: WildeSpotifyRecentContext[]
  needsLookup: WildeSpotifyRecentContext[]
} {
  const items = isPlainRecord(body) && Array.isArray(body.items) ? body.items : []
  const seen = new Set<string>()
  const contexts: WildeSpotifyRecentContext[] = []
  const needsLookup: WildeSpotifyRecentContext[] = []
  for (const item of items) {
    if (!isPlainRecord(item) || !isPlainRecord(item.track)) {
      continue
    }
    const track = item.track
    const album = isPlainRecord(track.album) ? track.album : null
    const context = isPlainRecord(item.context) ? item.context : null
    const contextType = asString(context?.type)
    const contextUri = asString(context?.uri)
    let entry: WildeSpotifyRecentContext | null = null
    if ((contextType === 'playlist' || contextType === 'artist') && contextUri) {
      entry = { uri: contextUri, kind: contextType, name: '', subtitle: '', imageUrl: null, playedAt: asString(item.played_at) }
    } else if (album && asString(album.uri)) {
      entry = {
        uri: asString(album.uri),
        kind: 'album',
        name: asString(album.name),
        subtitle: joinArtistNames(album.artists),
        imageUrl: firstImageUrl(album.images),
        playedAt: asString(item.played_at)
      }
    }
    if (!entry || seen.has(entry.uri)) {
      continue
    }
    seen.add(entry.uri)
    contexts.push(entry)
    if (entry.kind !== 'album') {
      needsLookup.push(entry)
    }
    if (contexts.length >= RECENT_CONTEXT_LIMIT) {
      break
    }
  }
  return { contexts, needsLookup }
}

/** Thin Spotify Web API client: auth refresh on 401, readable errors for 404/429/403. */
export class WildeSpotifyApi {
  private readonly contextLookupCache = new Map<string, Pick<WildeSpotifyRecentContext, 'name' | 'subtitle' | 'imageUrl'>>()

  private volumeDevice: { id: string | null; at: number } | null = null

  constructor(
    private readonly auth: WildeSpotifyAuth,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async request(method: string, path: string, body?: unknown, retried = false): Promise<unknown> {
    const token = await this.auth.getAccessToken()
    const response = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (response.status === 401 && !retried) {
      this.auth.invalidate()
      return this.request(method, path, body, true)
    }
    if (response.status === 204 || response.status === 202) {
      return null
    }
    const text = await response.text()
    const parsed: unknown = text ? safeJson(text) : null
    if (!response.ok) {
      throw new WildeSpotifyApiError(describeFailure(response.status, parsed, response.headers.get('retry-after')), response.status)
    }
    return parsed
  }

  async getDisplayName(): Promise<string | null> {
    const me = await this.request('GET', '/me')
    return isPlainRecord(me) && typeof me.display_name === 'string' ? me.display_name : null
  }

  async getPlaybackDetails(): Promise<WildeSpotifyPlaybackDetails | null> {
    const playback = await this.request('GET', '/me/player')
    if (!isPlainRecord(playback) || !isPlainRecord(playback.item) || playback.item.type !== 'track') {
      return null
    }
    const item = playback.item
    const trackId = asString(item.id)
    const trackUri = asString(item.uri)
    return {
      trackId,
      trackUri,
      liked: trackUri ? await this.isSaved(trackUri, trackId) : false,
      progressMs: typeof playback.progress_ms === 'number' ? playback.progress_ms : 0,
      durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : 0,
      isPlaying: playback.is_playing === true,
      volumePercent:
        isPlainRecord(playback.device) && typeof playback.device.volume_percent === 'number'
          ? playback.device.volume_percent
          : null
    }
  }

  async seek(positionMs: number): Promise<void> {
    await this.request('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.round(positionMs))}`)
  }

  /** Spotify's own (in-app) volume on this PC's Spotify app — not the Windows volume. */
  async setVolume(percent: number): Promise<void> {
    const volume = Math.min(100, Math.max(0, Math.round(percent)))
    // Why cached: dragging the slider sends several updates a second; one device lookup per
    // drag keeps us well under Spotify's rate limit.
    if (!this.volumeDevice || Date.now() - this.volumeDevice.at > 30_000) {
      this.volumeDevice = { id: await this.findDesktopDeviceId(), at: Date.now() }
    }
    const deviceId = this.volumeDevice.id
    const device = deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''
    await this.request('PUT', `/me/player/volume?volume_percent=${volume}${device}`)
  }

  async setSaved(trackUri: string, trackId: string, saved: boolean): Promise<void> {
    const method = saved ? 'PUT' : 'DELETE'
    // Why two shapes: Spotify is moving library writes to the generic /me/library endpoint;
    // fall back to the track-specific one for accounts/apps still on the older API.
    try {
      await this.request(method, `/me/library?uris=${encodeURIComponent(trackUri)}`)
    } catch (error) {
      if (!(error instanceof WildeSpotifyApiError) || (error.status !== 404 && error.status !== 400)) {
        throw error
      }
      await this.request(method, `/me/tracks?ids=${encodeURIComponent(trackId)}`)
    }
  }

  async getRecentContexts(): Promise<WildeSpotifyRecentContext[]> {
    const body = await this.request('GET', '/me/player/recently-played?limit=50')
    const { contexts, needsLookup } = collectRecentContexts(body)
    await Promise.all(needsLookup.map((entry) => this.fillContextDetails(entry)))
    return contexts.filter((entry) => entry.name)
  }

  async playContext(contextUri: string): Promise<void> {
    const deviceId = await this.findDesktopDeviceId()
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''
    await this.request('PUT', `/me/player/play${query}`, { context_uri: contextUri })
  }

  private async isSaved(trackUri: string, trackId: string): Promise<boolean> {
    try {
      const body = await this.request('GET', `/me/library/contains?uris=${encodeURIComponent(trackUri)}`)
      return Array.isArray(body) && body[0] === true
    } catch (error) {
      if (!(error instanceof WildeSpotifyApiError) || (error.status !== 404 && error.status !== 400)) {
        throw error
      }
      const body = await this.request('GET', `/me/tracks/contains?ids=${encodeURIComponent(trackId)}`)
      return Array.isArray(body) && body[0] === true
    }
  }

  /** Prefers this PC's Spotify app (type "Computer"), active first; falls back to the active device. */
  private async findDesktopDeviceId(): Promise<string | null> {
    const body = await this.request('GET', '/me/player/devices')
    const devices = isPlainRecord(body) && Array.isArray(body.devices) ? body.devices.filter(isPlainRecord) : []
    const computers = devices.filter((device) => device.type === 'Computer')
    const pick =
      computers.find((device) => device.is_active === true) ??
      computers[0] ??
      devices.find((device) => device.is_active === true)
    if (!pick) {
      throw new WildeSpotifyApiError('Spotify isn’t open on this PC. Open the Spotify app and try again.', 404)
    }
    return asString(pick.id) || null
  }

  private async fillContextDetails(entry: WildeSpotifyRecentContext): Promise<void> {
    const cached = this.contextLookupCache.get(entry.uri)
    if (cached) {
      Object.assign(entry, cached)
      return
    }
    const [, kind, id] = entry.uri.split(':')
    if (!id) {
      return
    }
    try {
      const body =
        kind === 'playlist'
          ? await this.request('GET', `/playlists/${id}?fields=name,images,owner(display_name)`)
          : await this.request('GET', `/artists/${id}`)
      if (!isPlainRecord(body)) {
        return
      }
      const details = {
        name: asString(body.name),
        subtitle: kind === 'playlist' ? `Playlist${isPlainRecord(body.owner) && asString(body.owner.display_name) ? ` · ${asString(body.owner.display_name)}` : ''}` : 'Artist',
        imageUrl: firstImageUrl(body.images)
      }
      this.contextLookupCache.set(entry.uri, details)
      Object.assign(entry, details)
    } catch {
      // A private or deleted playlist just drops out of the menu.
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function describeFailure(status: number, body: unknown, retryAfter: string | null): string {
  const apiMessage =
    isPlainRecord(body) && isPlainRecord(body.error) && typeof body.error.message === 'string' ? body.error.message : ''
  if (status === 429) {
    return `Spotify is rate limiting requests; try again in ${retryAfter ?? 'a few'} seconds.`
  }
  if (status === 404 && /device/i.test(apiMessage)) {
    return 'Spotify isn’t open on this PC. Open the Spotify app and try again.'
  }
  if (status === 403 && /premium/i.test(apiMessage)) {
    return 'This needs Spotify Premium.'
  }
  return apiMessage ? `Spotify: ${apiMessage}` : `Spotify request failed (${status}).`
}
