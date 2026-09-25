import { useCallback, useEffect, useRef, useState } from 'react'
import {
  normalizeWildeSpotifyConfig,
  type WildeSpotifyAccountStatus,
  type WildeSpotifyConfig,
  type WildeSpotifyNowPlaying,
  type WildeSpotifyPlaybackDetails
} from '../../../../shared/wilde-spotify'

export type WildeSpotifyApiHandle = NonNullable<typeof window.api.wildeSpotify>

export function getWildeSpotifyApi(): WildeSpotifyApiHandle | null {
  return window.api?.wildeSpotify ?? null
}

/** Estimated playback position: Spotify only reports it on play/pause/seek, so extrapolate. */
export function estimatePositionMs(state: WildeSpotifyNowPlaying, nowMs: number): number {
  if (!state.available) {
    return 0
  }
  const elapsed = state.status === 'Playing' ? Math.max(0, nowMs - state.positionUpdatedAtMs) : 0
  const position = state.positionMs + elapsed
  return state.durationMs > 0 ? Math.min(position, state.durationMs) : position
}

export function useWildeSpotifyConfig(): [WildeSpotifyConfig | null, (update: Partial<WildeSpotifyConfig>) => Promise<void>] {
  const [config, setConfig] = useState<WildeSpotifyConfig | null>(null)
  useEffect(() => {
    let cancelled = false
    void getWildeSpotifyApi()
      ?.getConfig()
      .then((next) => {
        if (!cancelled) {
          setConfig(next)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  const update = useCallback(async (patch: Partial<WildeSpotifyConfig>) => {
    const next = await getWildeSpotifyApi()?.setConfig(patch)
    if (next) {
      setConfig(next)
      window.dispatchEvent(new CustomEvent('wilde-spotify-config', { detail: next }))
    }
  }, [])
  // Keep every mounted consumer (settings pane + player) in step after an edit.
  useEffect(() => {
    const onChange = (event: Event): void => {
      if (event instanceof CustomEvent) {
        setConfig(normalizeWildeSpotifyConfig(event.detail))
      }
    }
    window.addEventListener('wilde-spotify-config', onChange)
    return () => window.removeEventListener('wilde-spotify-config', onChange)
  }, [])
  return [config, update]
}

export function useWildeSpotifyAccount(): WildeSpotifyAccountStatus | null {
  const [status, setStatus] = useState<WildeSpotifyAccountStatus | null>(null)
  useEffect(() => getWildeSpotifyApi()?.onAccount(setStatus), [])
  return status
}

export function useWildeSpotifyNowPlaying(active: boolean): WildeSpotifyNowPlaying {
  const [state, setState] = useState<WildeSpotifyNowPlaying>({ available: false })
  useEffect(() => (active ? getWildeSpotifyApi()?.onNowPlaying(setState) : undefined), [active])
  return state
}

/** Re-renders on an interval while playing so the progress line moves smoothly. */
export function useTicker(running: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) {
      setNow(Date.now())
      return
    }
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [running, intervalMs])
  return now
}

/**
 * Web API details (track URI + liked state) for the current track. Refetched when the track
 * changes; the Windows feed stays the source of truth for what is playing.
 */
export function usePlaybackDetails(
  trackKey: string | null,
  connected: boolean
): [WildeSpotifyPlaybackDetails | null, (liked: boolean) => void] {
  const [details, setDetails] = useState<WildeSpotifyPlaybackDetails | null>(null)
  const requestRef = useRef(0)
  useEffect(() => {
    setDetails(null)
    if (!trackKey || !connected) {
      return
    }
    const request = ++requestRef.current
    // Why the delay: the Web API lags the desktop app by a moment after a track change.
    const timer = window.setTimeout(() => {
      void getWildeSpotifyApi()
        ?.getPlaybackDetails()
        .then((next) => {
          if (request === requestRef.current) {
            setDetails(next)
          }
        })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [trackKey, connected])
  const setLiked = useCallback((liked: boolean) => {
    setDetails((current) => (current ? { ...current, liked } : current))
  }, [])
  return [details, setLiked]
}
