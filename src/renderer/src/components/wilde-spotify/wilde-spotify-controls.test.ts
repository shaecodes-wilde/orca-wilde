import { describe, expect, it, vi } from 'vitest'
import { bandIndexForBar } from './WildeSpotifyVisualizer'
import { clampVolume, createVolumeThrottle } from './WildeSpotifyVolume'

describe('bandIndexForBar', () => {
  it('puts bass at the bottom and treble at the top, mirrored left/right', () => {
    expect(bandIndexForBar(0, 48, 32)).toBe(0)
    expect(bandIndexForBar(24, 48, 32)).toBe(31)
    expect(bandIndexForBar(12, 48, 32)).toBe(bandIndexForBar(36, 48, 32))
    expect(bandIndexForBar(5, 48, 32)).toBe(bandIndexForBar(43, 48, 32))
  })
})

describe('volume helpers', () => {
  it('clamps and rounds', () => {
    expect(clampVolume(-4)).toBe(0)
    expect(clampVolume(104.6)).toBe(100)
    expect(clampVolume(33.4)).toBe(33)
  })

  it('sends the first value immediately and only the last value per interval', () => {
    const sent: number[] = []
    const scheduled: (() => void)[] = []
    const queue = createVolumeThrottle(
      (value) => sent.push(value),
      150,
      (callback) => scheduled.push(callback)
    )

    queue(10)
    queue(20)
    queue(30)
    expect(sent).toEqual([10])

    scheduled.shift()?.()
    expect(sent).toEqual([10, 30])

    // Nothing new queued: the next tick sends nothing and the throttle goes idle.
    scheduled.shift()?.()
    expect(sent).toEqual([10, 30])
    queue(40)
    expect(sent).toEqual([10, 30, 40])
  })

  it('never re-sends an unchanged value', () => {
    const send = vi.fn()
    const scheduled: (() => void)[] = []
    const queue = createVolumeThrottle(send, 150, (callback) => scheduled.push(callback))
    queue(50)
    queue(50)
    scheduled.shift()?.()
    expect(send).toHaveBeenCalledTimes(1)
  })
})
