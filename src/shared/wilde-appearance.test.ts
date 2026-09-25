import { describe, expect, it } from 'vitest'
import {
  DISABLED_WILDE_APPEARANCE,
  NEW_WILDE_PROFILE_APPEARANCE,
  normalizeWildeAppearance,
  type WildeAppearanceV1
} from './wilde-appearance'

describe('normalizeWildeAppearance', () => {
  it('returns undefined for absent and non-object values', () => {
    for (const value of [undefined, null, 0, 1, '', 'on', true, false]) {
      expect(normalizeWildeAppearance(value)).toBeUndefined()
    }
  })

  it('returns undefined for arrays, including v1-looking tuples', () => {
    expect(normalizeWildeAppearance([])).toBeUndefined()
    expect(normalizeWildeAppearance([1, true])).toBeUndefined()
  })

  it('emits a complete v1 object for a bare {version:1} payload', () => {
    expect(normalizeWildeAppearance({ version: 1 })).toEqual({
      version: 1,
      enabled: false,
      sidebarTreatment: 'oil-slick',
      intensity: 'balanced',
      motion: 'off',
      terminalBranding: 'badge'
    })
  })

  it('keeps valid fields and defaults invalid ones', () => {
    expect(
      normalizeWildeAppearance({
        version: 1,
        enabled: true,
        sidebarTreatment: 'neon',
        intensity: 'expressive',
        motion: 'fast',
        terminalBranding: 'badge'
      })
    ).toEqual({
      version: 1,
      enabled: true,
      sidebarTreatment: 'oil-slick',
      intensity: 'expressive',
      motion: 'off',
      terminalBranding: 'badge'
    })
  })

  it('treats non-boolean enabled as false', () => {
    for (const enabled of ['true', 1, [], {}]) {
      expect(normalizeWildeAppearance({ version: 1, enabled })?.enabled).toBe(false)
    }
  })

  it('drops unknown keys on a v1 payload', () => {
    const normalized = normalizeWildeAppearance({
      version: 1,
      enabled: true,
      sidebarTreatment: 'solid',
      intensity: 'subtle',
      motion: 'slow',
      terminalBranding: 'off',
      futureField: { nested: true }
    })
    expect(normalized).toEqual({
      version: 1,
      enabled: true,
      sidebarTreatment: 'solid',
      intensity: 'subtle',
      motion: 'slow',
      terminalBranding: 'off'
    })
    expect('futureField' in (normalized ?? {})).toBe(false)
  })

  it('passes non-v1 objects through verbatim so future payloads round-trip', () => {
    const future = { version: 2, enabled: true, extra: ['a', 'b'] }
    expect(normalizeWildeAppearance(future)).toBe(future)
    expect(normalizeWildeAppearance({ version: '1' })).toEqual({ version: '1' })
    expect(normalizeWildeAppearance({})).toEqual({})
  })

  it('round-trips the frozen constants unchanged', () => {
    expect(normalizeWildeAppearance(NEW_WILDE_PROFILE_APPEARANCE)).toEqual(
      NEW_WILDE_PROFILE_APPEARANCE
    )
    expect(normalizeWildeAppearance(DISABLED_WILDE_APPEARANCE)).toEqual(DISABLED_WILDE_APPEARANCE)
  })

  it('emits fresh objects so callers cannot mutate the frozen constants', () => {
    const normalized: WildeAppearanceV1 | undefined = normalizeWildeAppearance(
      NEW_WILDE_PROFILE_APPEARANCE
    )
    expect(normalized).not.toBe(NEW_WILDE_PROFILE_APPEARANCE)
  })
})
