import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { getWildeSpotifyApi } from './use-wilde-spotify'

const STEP = 5
const SEND_INTERVAL_MS = 150

export function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * Sends at most one volume update per interval while dragging, always delivering the last value
 * (Spotify rate-limits the Web API; the slider can emit dozens of changes a second).
 */
export function createVolumeThrottle(
  send: (value: number) => void,
  intervalMs = SEND_INTERVAL_MS,
  schedule: (callback: () => void, ms: number) => unknown = setTimeout
): (value: number) => void {
  let pending: number | null = null
  let lastSent: number | null = null
  let waiting = false
  const flush = (): void => {
    waiting = false
    if (pending !== null && pending !== lastSent) {
      lastSent = pending
      send(pending)
      waiting = true
      schedule(flush, intervalMs)
    }
    pending = null
  }
  return (value: number) => {
    pending = value
    if (!waiting) {
      flush()
    }
  }
}

/**
 * Speaker button (bottom-right of the card) opening a vertical slider for Spotify's own in-app
 * volume — the Windows volume is never touched. Scroll over the icon or slider to step ±5.
 */
export function WildeSpotifyVolume({
  initialVolume,
  onError
}: {
  initialVolume: number | null
  onError: (message: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [volume, setVolume] = useState(initialVolume ?? 50)
  const beforeMute = useRef<number>(initialVolume && initialVolume > 0 ? initialVolume : 50)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const confirmed = useRef(initialVolume ?? 50)

  useEffect(() => {
    if (initialVolume !== null && !dragging.current) {
      setVolume(initialVolume)
      confirmed.current = initialVolume
    }
  }, [initialVolume])

  const sendRef = useRef<((value: number) => void) | null>(null)
  sendRef.current ??= createVolumeThrottle((value) => {
    void getWildeSpotifyApi()
      ?.setVolume(value)
      .then((result) => {
        if (result.ok) {
          confirmed.current = value
        } else {
          setVolume(confirmed.current)
          onError(result.message)
        }
      })
  })

  const change = (value: number): void => {
    const next = clampVolume(value)
    if (next > 0) {
      beforeMute.current = next
    }
    setVolume(next)
    sendRef.current?.(next)
  }

  const valueAt = (clientY: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) {
      return volume
    }
    return ((rect.bottom - clientY) / rect.height) * 100
  }

  const onWheel = (event: React.WheelEvent): void => {
    event.preventDefault()
    change(volume + (event.deltaY < 0 ? STEP : -STEP))
  }

  const muted = volume === 0
  const label = translate('wildeSpotify.volume.title', 'Spotify volume')
  const Icon = muted ? VolumeX : Volume2

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="wilde-spotify-icon-button wilde-spotify-volume-button"
          aria-label={label}
          title={label}
          onWheel={onWheel}
        >
          <Icon size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="wilde-spotify-menu wilde-spotify-volume w-12 p-0"
        onWheel={onWheel}
      >
        <div className="wilde-spotify-volume-value">{volume}%</div>
        <div
          ref={trackRef}
          className="wilde-spotify-volume-track"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volume}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            dragging.current = true
            change(valueAt(event.clientY))
          }}
          onPointerMove={(event) => {
            if (dragging.current) {
              change(valueAt(event.clientY))
            }
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
              event.preventDefault()
              change(volume + STEP)
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
              event.preventDefault()
              change(volume - STEP)
            }
          }}
        >
          <div className="wilde-spotify-volume-fill" style={{ height: `${volume}%` }} />
          <div className="wilde-spotify-volume-thumb" style={{ bottom: `${volume}%` }} />
        </div>
        <button
          type="button"
          className="wilde-spotify-icon-button wilde-spotify-volume-mute"
          aria-label={
            muted ? translate('wildeSpotify.volume.unmute', 'Unmute') : translate('wildeSpotify.volume.mute', 'Mute')
          }
          aria-pressed={muted}
          onClick={() => change(muted ? beforeMute.current : 0)}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </PopoverContent>
    </Popover>
  )
}
