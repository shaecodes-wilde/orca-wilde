import { describe, expect, it } from 'vitest'
import { parseMediaSessionLine } from './media-session-protocol'

describe('parseMediaSessionLine', () => {
  it('parses a playing state and keeps artwork only when the bridge sent it', () => {
    const withArt = parseMediaSessionLine(
      JSON.stringify({
        type: 'state',
        available: true,
        title: 'The Bell',
        artist: 'Yeat',
        album: 'The Bell',
        trackKey: 'k',
        status: 'Playing',
        positionMs: 21,
        durationMs: 164897,
        positionUpdatedAtMs: 5,
        canNext: true,
        canPrevious: true,
        artwork: 'data:image/png;base64,AAA'
      })
    )
    expect(withArt).toMatchObject({
      type: 'state',
      artwork: 'data:image/png;base64,AAA',
      state: { available: true, title: 'The Bell', durationMs: 164897 }
    })

    const withoutArt = parseMediaSessionLine(JSON.stringify({ type: 'state', available: true, title: 'x' }))
    expect(withoutArt).toMatchObject({ type: 'state', artwork: undefined })
  })

  it('rejects non-image artwork and treats unavailable sessions as idle', () => {
    expect(
      parseMediaSessionLine(JSON.stringify({ type: 'state', available: true, artwork: 'javascript:alert(1)' }))
    ).toMatchObject({ artwork: null })
    expect(parseMediaSessionLine('{"type":"state","available":false}')).toEqual({
      type: 'state',
      state: { available: false },
      artwork: undefined
    })
  })

  it('parses command results and ignores noise', () => {
    expect(parseMediaSessionLine('{"ok":true,"id":3,"type":"result"}')).toEqual({
      type: 'result',
      id: 3,
      ok: true
    })
    expect(parseMediaSessionLine('WARNING: something')).toBeNull()
    expect(parseMediaSessionLine('{not json')).toBeNull()
    expect(parseMediaSessionLine('[1,2]')).toBeNull()
  })
})
