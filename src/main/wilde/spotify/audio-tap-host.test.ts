import { describe, expect, it } from 'vitest'
import { parseBandsLine } from './audio-tap-host'

describe('parseBandsLine', () => {
  it('parses band levels and clamps them to 0..1', () => {
    expect(parseBandsLine('{"b":[0.12,1.4,-0.2,0.5]}')).toEqual([0.12, 1, 0, 0.5])
  })

  it('ignores status lines and malformed output', () => {
    expect(parseBandsLine('{"status":"capturing"}')).toBeNull()
    expect(parseBandsLine('{"b":"nope"}')).toBeNull()
    expect(parseBandsLine('{"b":[0.1,')).toBeNull()
    expect(parseBandsLine('Unhandled Exception: boom')).toBeNull()
  })

  it('replaces non-numeric entries with zero', () => {
    expect(parseBandsLine('{"b":[0.3,null,"x"]}')).toEqual([0.3, 0, 0])
  })
})
