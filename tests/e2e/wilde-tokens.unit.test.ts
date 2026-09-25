/**
 * V01 — Wilde Systems canonical palette lock (pure unit test).
 *
 * Worker A6 contract: tests written against the frozen spec before/with the
 * implementation. This file covers the one seam that already exists on this
 * checkout — `src/renderer/src/branding/wilde/tokens.ts` — and locks the
 * canonical brand palette values so a drifted token can't silently ship.
 *
 * Wilde CSS/attribute integration is asserted by the e2e specs; this file is
 * deliberately pure (no Electron) so it runs under `pnpm test`.
 */

import { describe, expect, it } from 'vitest'
import {
  WILDE_BORDER,
  WILDE_CANVAS,
  WILDE_HARBOUR,
  WILDE_LAVENDER,
  WILDE_MINT,
  WILDE_MUTED,
  WILDE_PANEL,
  WILDE_RAISED
} from '../../src/renderer/src/branding/wilde/tokens'

const HEX6 = /^#[0-9a-f]{6}$/i

function channelLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel(Number.parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(Number.parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(Number.parseInt(hex.slice(5, 7), 16))
  )
}

describe('V01: wilde canonical palette', () => {
  it('locks the four canonical brand colours', () => {
    expect(WILDE_HARBOUR).toBe('#0B0C10')
    expect(WILDE_CANVAS).toBe('#F8F8FA')
    expect(WILDE_MINT).toBe('#8BD8B0')
    expect(WILDE_LAVENDER).toBe('#AB9CD9')
  })

  it('keeps every token a valid #rrggbb hex colour', () => {
    for (const token of [
      WILDE_HARBOUR,
      WILDE_CANVAS,
      WILDE_MINT,
      WILDE_LAVENDER,
      WILDE_PANEL,
      WILDE_RAISED,
      WILDE_BORDER,
      WILDE_MUTED
    ]) {
      expect(token, `malformed token ${token}`).toMatch(HEX6)
    }
  })

  it('keeps the dark theme family genuinely dark and the muted text legible', () => {
    // Harbour/panel/raised are the dark Wilde surfaces — all must sit far below
    // mid-luminance so mint/lavender accents and muted text keep contrast headroom.
    for (const dark of [WILDE_HARBOUR, WILDE_PANEL, WILDE_RAISED]) {
      expect(channelLuminance(dark), `${dark} is not a dark surface`).toBeLessThan(0.05)
    }
    expect(channelLuminance(WILDE_MUTED)).toBeGreaterThan(0.35)
    expect(channelLuminance(WILDE_CANVAS)).toBeGreaterThan(0.9)
  })
})
