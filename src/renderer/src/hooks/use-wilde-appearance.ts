import { useAppStore } from '@/store'
import { useDocumentDarkTheme } from '@/components/editor/use-document-dark-theme'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import {
  DISABLED_WILDE_APPEARANCE,
  normalizeWildeAppearance,
  type WildeAppearanceV1
} from '../../../shared/wilde-appearance'

export type WildeAppearanceState = {
  /** Stored v1 intent — on/off regardless of the resolved app theme. */
  enabled: boolean
  /** Wilde chrome is actually painting: `enabled` AND resolved dark. */
  active: boolean
  resolvedDark: boolean
  sidebarTreatment: WildeAppearanceV1['sidebarTreatment']
  intensity: WildeAppearanceV1['intensity']
  motion: WildeAppearanceV1['motion']
  terminalBranding: WildeAppearanceV1['terminalBranding']
  /** 'off' whenever the OS requests reduced motion, regardless of the stored value. */
  effectiveMotion: WildeAppearanceV1['motion']
}

/** Reads the device-local Wilde fork settings. Defaults/off for absent or future-version payloads. */
export function useWildeAppearance(): WildeAppearanceState {
  const stored = useAppStore((state) => state.settings?.wildeAppearance)
  const resolvedDark = useDocumentDarkTheme()
  const prefersReducedMotion = usePrefersReducedMotion()
  const normalized = normalizeWildeAppearance(stored)
  // Non-v1 payloads are verbatim future shapes — render as stock-off, never trust their fields.
  const appearance = normalized?.version === 1 ? normalized : DISABLED_WILDE_APPEARANCE
  return {
    enabled: appearance.enabled,
    active: appearance.enabled && resolvedDark,
    resolvedDark,
    sidebarTreatment: appearance.sidebarTreatment,
    intensity: appearance.intensity,
    motion: appearance.motion,
    terminalBranding: appearance.terminalBranding,
    effectiveMotion: prefersReducedMotion ? 'off' : appearance.motion
  }
}
