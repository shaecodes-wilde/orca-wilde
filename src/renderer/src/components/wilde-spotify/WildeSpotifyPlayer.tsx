import { useEffect, useRef, useState } from 'react'
import { Heart, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useWildeAppearance } from '@/hooks/use-wilde-appearance'
import type { WildeSpotifyMediaCommand } from '../../../../shared/wilde-spotify'
import { WildeSpotifyRecentMenu } from './WildeSpotifyRecentMenu'
import { WildeSpotifyVisualizer } from './WildeSpotifyVisualizer'
import { WildeSpotifyVolume } from './WildeSpotifyVolume'
import {
  estimatePositionMs,
  getWildeSpotifyApi,
  usePlaybackDetails,
  useTicker,
  useWildeSpotifyAccount,
  useWildeSpotifyConfig,
  useWildeSpotifyNowPlaying
} from './use-wilde-spotify'

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Spotify mini-player docked at the bottom of the right sidebar (Wilde build only).
 * Now playing + transport come from the Windows media session; seek, like and the recent
 * menu use the Spotify Web API once connected in Settings.
 */
export function WildeSpotifyPlayer(): React.JSX.Element | null {
  const { active } = useWildeAppearance()
  const [config] = useWildeSpotifyConfig()
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    void getWildeSpotifyApi()
      ?.isNowPlayingSupported()
      .then(setSupported)
  }, [])
  const visible = active && supported && config?.enabled === true
  return visible ? <PlayerCard visualizer={config.visualizer} /> : null
}

function PlayerCard({ visualizer }: { visualizer: boolean }): React.JSX.Element {
  const nowPlaying = useWildeSpotifyNowPlaying(true)
  const account = useWildeSpotifyAccount()
  const connected = account?.state === 'connected'
  const playing = nowPlaying.available && nowPlaying.status === 'Playing'
  const now = useTicker(playing)
  const [details, setLikedLocally] = usePlaybackDetails(
    nowPlaying.available ? nowPlaying.trackKey : null,
    connected
  )
  const [error, setError] = useState<string | null>(null)
  const errorTimer = useRef<number | null>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const showError = (message: string): void => {
    setError(message)
    if (errorTimer.current !== null) {
      window.clearTimeout(errorTimer.current)
    }
    errorTimer.current = window.setTimeout(() => setError(null), 4500)
  }
  useEffect(
    () => () => {
      if (errorTimer.current !== null) {
        window.clearTimeout(errorTimer.current)
      }
    },
    []
  )

  const media = (command: WildeSpotifyMediaCommand): void => {
    void getWildeSpotifyApi()?.media(command)
  }

  if (!nowPlaying.available) {
    return (
      <div data-wilde-spotify-player="" className="wilde-spotify">
        <div ref={cardRef} className="wilde-spotify-card wilde-spotify-card-idle">
          <Music2 size={15} className="wilde-spotify-idle-icon" />
          <span className="wilde-spotify-idle-text">
            {translate('wildeSpotify.idle', 'Spotify isn’t playing')}
          </span>
          <WildeSpotifyRecentMenu connected={connected} onError={showError} anchorRef={cardRef} />
        </div>
        {error ? <div className="wilde-spotify-error">{error}</div> : null}
      </div>
    )
  }

  const durationMs = nowPlaying.durationMs
  const positionMs = dragRatio !== null ? dragRatio * durationMs : estimatePositionMs(nowPlaying, now)
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0
  const canSeek = connected && durationMs > 0
  const seekLabel = translate('wildeSpotify.seek', 'Seek')

  const ratioAt = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) {
      return 0
    }
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }
  const commitSeek = async (ratio: number): Promise<void> => {
    const result = await getWildeSpotifyApi()?.seek(ratio * durationMs)
    setDragRatio(null)
    if (result && !result.ok) {
      showError(result.message)
    }
  }

  const toggleLike = async (): Promise<void> => {
    if (!details) {
      return
    }
    const next = !details.liked
    setLikedLocally(next)
    const result = await getWildeSpotifyApi()?.setLiked(details.trackUri, details.trackId, next)
    if (result && !result.ok) {
      setLikedLocally(!next)
      showError(result.message)
    }
  }

  const likeLabel = details?.liked
    ? translate('wildeSpotify.unlike', 'Remove from Liked Songs')
    : translate('wildeSpotify.like', 'Save to Liked Songs')
  const connectHint = translate(
    'wildeSpotify.connectHint',
    'Connect Spotify in Settings → Appearance → Wilde Systems'
  )

  return (
    <div data-wilde-spotify-player="" className="wilde-spotify">
      <div ref={cardRef} className="wilde-spotify-card">
        <div className="wilde-spotify-top">
          {nowPlaying.artwork ? (
            <img src={nowPlaying.artwork} alt="" className="wilde-spotify-art" />
          ) : (
            <span className="wilde-spotify-art wilde-spotify-art-empty">
              <Music2 size={16} />
            </span>
          )}
          <div className="wilde-spotify-meta">
            <div className="wilde-spotify-title" title={nowPlaying.title}>
              {nowPlaying.title}
            </div>
            <div className="wilde-spotify-artist" title={nowPlaying.artist}>
              {nowPlaying.artist}
            </div>
          </div>
          <button
            type="button"
            className={cn('wilde-spotify-icon-button', details?.liked && 'is-liked')}
            aria-label={connected ? likeLabel : connectHint}
            title={connected ? likeLabel : connectHint}
            aria-pressed={details?.liked ?? false}
            disabled={!details}
            onClick={() => void toggleLike()}
          >
            <Heart size={15} fill={details?.liked ? 'currentColor' : 'none'} />
          </button>
          <WildeSpotifyRecentMenu connected={connected} onError={showError} anchorRef={cardRef} />
        </div>

        <div
          ref={barRef}
          className={cn('wilde-spotify-bar', canSeek && 'is-seekable')}
          role="slider"
          tabIndex={canSeek ? 0 : -1}
          aria-label={seekLabel}
          aria-disabled={!canSeek}
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(positionMs / 1000)}
          aria-valuetext={`${formatTime(positionMs)} / ${formatTime(durationMs)}`}
          title={canSeek ? seekLabel : connectHint}
          onPointerDown={(event) => {
            if (!canSeek) {
              return
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            setDragRatio(ratioAt(event.clientX))
          }}
          onPointerMove={(event) => {
            if (dragRatio !== null) {
              setDragRatio(ratioAt(event.clientX))
            }
          }}
          onPointerUp={(event) => {
            if (dragRatio !== null) {
              void commitSeek(ratioAt(event.clientX))
            }
          }}
          onKeyDown={(event) => {
            if (!canSeek || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
              return
            }
            event.preventDefault()
            const delta = (event.key === 'ArrowRight' ? 5000 : -5000) / durationMs
            void commitSeek(Math.min(1, Math.max(0, progress + delta)))
          }}
        >
          <div className="wilde-spotify-bar-fill" style={{ width: `${progress * 100}%` }} />
          <div className="wilde-spotify-bar-thumb" style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="wilde-spotify-times">
          <span>{formatTime(positionMs)}</span>
          <span>-{formatTime(Math.max(0, durationMs - positionMs))}</span>
        </div>

        <div className="wilde-spotify-controls">
          <button
            type="button"
            className="wilde-spotify-icon-button"
            aria-label={translate('wildeSpotify.previous', 'Previous')}
            disabled={!nowPlaying.canPrevious}
            onClick={() => media('previous')}
          >
            <SkipBack size={16} fill="currentColor" />
          </button>
          <div className="wilde-spotify-play-wrap">
            {visualizer ? <WildeSpotifyVisualizer playing={playing} /> : null}
          <button
            type="button"
            className="wilde-spotify-play"
            aria-label={playing ? translate('wildeSpotify.pause', 'Pause') : translate('wildeSpotify.play', 'Play')}
            onClick={() => media('toggle')}
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          </div>
          <button
            type="button"
            className="wilde-spotify-icon-button"
            aria-label={translate('wildeSpotify.next', 'Next')}
            disabled={!nowPlaying.canNext}
            onClick={() => media('next')}
          >
            <SkipForward size={16} fill="currentColor" />
          </button>
          {connected ? (
            <div className="wilde-spotify-volume-slot">
              <WildeSpotifyVolume initialVolume={details?.volumePercent ?? null} onError={showError} />
            </div>
          ) : null}
        </div>
      </div>
      {error ? <div className="wilde-spotify-error">{error}</div> : null}
    </div>
  )
}
