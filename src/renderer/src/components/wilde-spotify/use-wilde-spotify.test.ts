import { describe, expect, it } from 'vitest'
import { estimatePositionMs } from './use-wilde-spotify'

const base = {
  available: true as const,
  title: 't',
  artist: 'a',
  album: 'b',
  trackKey: 'k',
  positionMs: 10_000,
  durationMs: 60_000,
  positionUpdatedAtMs: 1_000,
  canNext: true,
  canPrevious: true
}

describe('estimatePositionMs', () => {
  it('extrapolates while playing and clamps to the duration', () => {
    expect(estimatePositionMs({ ...base, status: 'Playing' }, 4_000)).toBe(13_000)
    expect(estimatePositionMs({ ...base, status: 'Playing' }, 999_999)).toBe(60_000)
  })

  it('holds still while paused and is zero when unavailable', () => {
    expect(estimatePositionMs({ ...base, status: 'Paused' }, 50_000)).toBe(10_000)
    expect(estimatePositionMs({ available: false }, 50_000)).toBe(0)
  })
})
