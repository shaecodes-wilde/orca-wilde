import { isPlainRecord, type WildeSpotifyNowPlaying } from '../../../shared/wilde-spotify'

export type MediaSessionMessage =
  | { type: 'result'; id: number; ok: boolean }
  | { type: 'error'; message: string }
  /** `artwork` is present only when the track changed (undefined = keep the cached art). */
  | { type: 'state'; state: WildeSpotifyNowPlaying; artwork: string | null | undefined }

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Parses one NDJSON line from native/wilde-spotify-windows/media-session.ps1; null if malformed. */
export function parseMediaSessionLine(line: string): MediaSessionMessage | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!isPlainRecord(parsed)) {
    return null
  }
  const raw = parsed
  if (raw.type === 'result' && typeof raw.id === 'number') {
    return { type: 'result', id: raw.id, ok: raw.ok === true }
  }
  if (raw.type === 'error') {
    return { type: 'error', message: asString(raw.message) }
  }
  if (raw.type !== 'state') {
    return null
  }
  if (raw.available !== true) {
    return { type: 'state', state: { available: false }, artwork: undefined }
  }
  const artwork =
    'artwork' in raw
      ? typeof raw.artwork === 'string' && raw.artwork.startsWith('data:image/')
        ? raw.artwork
        : null
      : undefined
  return {
    type: 'state',
    artwork,
    state: {
      available: true,
      title: asString(raw.title),
      artist: asString(raw.artist),
      album: asString(raw.album),
      trackKey: asString(raw.trackKey),
      status: asString(raw.status),
      positionMs: asNumber(raw.positionMs),
      durationMs: asNumber(raw.durationMs),
      positionUpdatedAtMs: asNumber(raw.positionUpdatedAtMs),
      canNext: raw.canNext === true,
      canPrevious: raw.canPrevious === true
    }
  }
}
