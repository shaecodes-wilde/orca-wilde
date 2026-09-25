import { useEffect, useRef } from 'react'
import { getWildeSpotifyApi } from './use-wilde-spotify'

const SIZE = 72
const BAR_COUNT = 48
const INNER_RADIUS = 21
const MAX_BAR = 13
const MIN_BAR = 1

/**
 * Maps a bar around the ring to a frequency band so the ring is mirror-symmetric: bass at the
 * bottom, treble at the top, both sides matching.
 */
export function bandIndexForBar(bar: number, barCount: number, bandCount: number): number {
  const turn = bar / barCount // 0 = bottom, clockwise
  const distanceFromBottom = turn <= 0.5 ? turn * 2 : (1 - turn) * 2 // 0 bottom .. 1 top
  return Math.min(bandCount - 1, Math.floor(distanceFromBottom * bandCount))
}

/**
 * Radial bars around the play/pause button, driven by the Spotify-only audio tap. Subscribes
 * (and so lets the main process capture) only while playing and visible; eases to nothing and
 * stops drawing when paused.
 */
export function WildeSpotifyVisualizer({ playing }: { playing: boolean }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targets = useRef<number[]>([])
  const levels = useRef<number[]>(Array.from({ length: BAR_COUNT }, () => 0))
  const frame = useRef<number | null>(null)
  const playingRef = useRef(playing)
  const colorRef = useRef<string | null>(null)
  playingRef.current = playing

  // Subscribe to bands only while playing and the window is visible.
  useEffect(() => {
    const api = getWildeSpotifyApi()
    if (!api || !playing) {
      targets.current = []
      return
    }
    let unsubscribe: (() => void) | null = null
    const sync = (): void => {
      if (document.visibilityState === 'visible' && !unsubscribe) {
        unsubscribe = api.onBands((bands) => {
          targets.current = bands
          startLoop()
        })
      } else if (document.visibilityState !== 'visible' && unsubscribe) {
        unsubscribe()
        unsubscribe = null
        targets.current = []
      }
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      unsubscribe?.()
      targets.current = []
      startLoop() // ease the bars down
    }
    // startLoop is stable (refs only).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current)
      }
    },
    []
  )

  function startLoop(): void {
    if (frame.current === null) {
      frame.current = requestAnimationFrame(draw)
    }
  }

  function draw(): void {
    frame.current = null
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }
    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== SIZE * ratio) {
      canvas.width = SIZE * ratio
      canvas.height = SIZE * ratio
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, SIZE, SIZE)

    // Read the token once; getComputedStyle every frame would force a style recalc each time.
    colorRef.current ??=
      getComputedStyle(canvas).getPropertyValue('--wilde-lavender').trim() || '#ab9cd9'
    const lavender = colorRef.current
    const bands = targets.current
    let energy = 0
    const center = SIZE / 2
    context.lineCap = 'round'
    context.lineWidth = 2.2
    context.strokeStyle = lavender
    context.shadowColor = lavender
    for (let bar = 0; bar < BAR_COUNT; bar++) {
      const target = bands.length > 0 ? (bands[bandIndexForBar(bar, BAR_COUNT, bands.length)] ?? 0) : 0
      const current = levels.current[bar] ?? 0
      // Snappy attack, smooth release, like the tap itself.
      const next = current + (target - current) * (target > current ? 0.55 : 0.2)
      levels.current[bar] = next
      energy += next
      const angle = Math.PI / 2 + (bar / BAR_COUNT) * Math.PI * 2
      const length = MIN_BAR + next * MAX_BAR
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      context.globalAlpha = 0.35 + next * 0.65
      context.shadowBlur = 4 + next * 8
      context.beginPath()
      context.moveTo(center + cos * INNER_RADIUS, center + sin * INNER_RADIUS)
      context.lineTo(center + cos * (INNER_RADIUS + length), center + sin * (INNER_RADIUS + length))
      context.stroke()
    }
    context.globalAlpha = 1
    // Keep animating while there is signal or the bars are still settling.
    if (playingRef.current && bands.length > 0) {
      startLoop()
    } else if (energy > 0.02) {
      startLoop()
    } else {
      context.clearRect(0, 0, SIZE, SIZE)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="wilde-spotify-visualizer"
      style={{ width: SIZE, height: SIZE }}
    />
  )
}
