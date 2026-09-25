export type WildeAppearanceV1 = Readonly<{
  version: 1
  enabled: boolean
  sidebarTreatment: 'solid' | 'oil-slick'
  intensity: 'subtle' | 'balanced' | 'expressive'
  motion: 'off' | 'slow'
  terminalBranding: 'off' | 'badge'
}>

/** Seeded only for brand-new profiles; existing/imported files stay untouched. */
export const NEW_WILDE_PROFILE_APPEARANCE: WildeAppearanceV1 = {
  version: 1,
  enabled: true,
  sidebarTreatment: 'oil-slick',
  intensity: 'balanced',
  motion: 'off',
  terminalBranding: 'off'
}

/** Terminal palette seeded alongside NEW_WILDE_PROFILE_APPEARANCE (renderer/lib/terminal-themes/wilde.ts). */
export const NEW_WILDE_PROFILE_TERMINAL_THEME_DARK = 'Wilde Systems Dark'

export const DISABLED_WILDE_APPEARANCE: WildeAppearanceV1 = {
  version: 1,
  enabled: false,
  sidebarTreatment: 'oil-slick',
  intensity: 'balanced',
  motion: 'off',
  terminalBranding: 'off'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  for (const option of allowed) {
    if (option === value) {
      return option
    }
  }
  return fallback
}

/**
 * Settings updates shallow-merge, so a v1 payload is always re-emitted as a complete
 * six-field object. Unknown versions pass through verbatim so a newer build's shape
 * round-trips; readers must gate on `version === 1 && enabled` before trusting fields.
 */
export function normalizeWildeAppearance(value: unknown): WildeAppearanceV1 | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  if (value.version !== 1) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a non-v1 record is a future build's payload kept verbatim for round-trip; its fields are opaque and every consumer re-gates on `version === 1`.
    return value as WildeAppearanceV1
  }
  return {
    version: 1,
    enabled: value.enabled === true,
    sidebarTreatment: enumOr(value.sidebarTreatment, ['solid', 'oil-slick'] as const, 'oil-slick'),
    intensity: enumOr(value.intensity, ['subtle', 'balanced', 'expressive'] as const, 'balanced'),
    motion: enumOr(value.motion, ['off', 'slow'] as const, 'off'),
    terminalBranding: enumOr(value.terminalBranding, ['off', 'badge'] as const, 'off')
  }
}
