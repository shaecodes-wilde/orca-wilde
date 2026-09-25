import type { GlobalSettings } from '../../../shared/global-settings-types'
import { normalizeWildeAppearance } from '../../../shared/wilde-appearance'

export type DocumentThemePreference = GlobalSettings['theme']

export const THEME_TRANSITION_DISABLED_CLASS = 'theme-transition-disabled'

export const WILDE_APPEARANCE_ATTRIBUTE = 'data-wilde-appearance'
export const WILDE_MATERIAL_ATTRIBUTE = 'data-wilde-material'
export const WILDE_INTENSITY_ATTRIBUTE = 'data-wilde-intensity'
export const WILDE_MOTION_ATTRIBUTE = 'data-wilde-motion'

const WILDE_ATTRIBUTES = [
  WILDE_APPEARANCE_ATTRIBUTE,
  WILDE_MATERIAL_ATTRIBUTE,
  WILDE_INTENSITY_ATTRIBUTE,
  WILDE_MOTION_ATTRIBUTE
] as const

type WildeAttributeRoot = Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>

// Why intent, not resolved theme: the attributes describe the stored setting and CSS gates on
// `[data-wilde-appearance='on'].dark`, so OS dark↔light flips need zero DOM churn here.
export function applyWildeDocumentAttributes(
  wilde: unknown,
  root: WildeAttributeRoot = document.documentElement
): void {
  const appearance = normalizeWildeAppearance(wilde)
  if (appearance?.version === 1 && appearance.enabled) {
    root.setAttribute(WILDE_APPEARANCE_ATTRIBUTE, 'on')
    root.setAttribute(WILDE_MATERIAL_ATTRIBUTE, appearance.sidebarTreatment)
    root.setAttribute(WILDE_INTENSITY_ATTRIBUTE, appearance.intensity)
    root.setAttribute(WILDE_MOTION_ATTRIBUTE, appearance.motion)
    return
  }
  for (const attribute of WILDE_ATTRIBUTES) {
    root.removeAttribute(attribute)
  }
}

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

type ThemeClassList = {
  add: (...tokens: string[]) => void
  remove: (...tokens: string[]) => void
  toggle: (token: string, force?: boolean) => boolean
}

type ThemeRoot = {
  classList: ThemeClassList
}

type ThemeMediaMatcher = (query: string) => Pick<MediaQueryList, 'matches'>
type ThemeAnimationFrame = (callback: FrameRequestCallback) => number
type ThemeCancelAnimationFrame = (handle: number) => void

type ApplyDocumentThemeOptions = {
  root?: ThemeRoot
  matchMedia?: ThemeMediaMatcher
  requestAnimationFrame?: ThemeAnimationFrame
  cancelAnimationFrame?: ThemeCancelAnimationFrame
  disableTransitions?: boolean
}

let pendingTransitionDisableFrames: number[] = []

function cancelPendingTransitionDisableFrames(cancelFrame: ThemeCancelAnimationFrame): void {
  for (const frameId of pendingTransitionDisableFrames) {
    cancelFrame(frameId)
  }
  pendingTransitionDisableFrames = []
}

function systemPrefersDark(
  matchMedia: ThemeMediaMatcher = window.matchMedia.bind(window)
): boolean {
  return matchMedia(DARK_MODE_QUERY).matches
}

export function resolveDocumentTheme(
  theme: DocumentThemePreference,
  matchMedia?: ThemeMediaMatcher
): boolean {
  if (theme === 'dark') {
    return true
  }
  if (theme === 'light') {
    return false
  }
  return systemPrefersDark(matchMedia)
}

export function applyDocumentTheme(
  theme: DocumentThemePreference,
  options: ApplyDocumentThemeOptions = {}
): void {
  const root = options.root ?? document.documentElement
  const disableTransitions = options.disableTransitions ?? true
  const shouldUseDarkTheme = resolveDocumentTheme(theme, options.matchMedia)

  if (disableTransitions) {
    root.classList.add(THEME_TRANSITION_DISABLED_CLASS)
  }

  root.classList.toggle('dark', shouldUseDarkTheme)
  // Mirror with `light` so consumers can observe the resolved theme
  // symmetrically (Tailwind keys only on `dark`, so this is style-neutral).
  root.classList.toggle('light', !shouldUseDarkTheme)

  if (!disableTransitions) {
    return
  }

  const requestFrame = options.requestAnimationFrame ?? window.requestAnimationFrame.bind(window)
  const cancelFrame = options.cancelAnimationFrame ?? window.cancelAnimationFrame.bind(window)
  cancelPendingTransitionDisableFrames(cancelFrame)

  // Why: two frames lets the root theme class recalculate before restoring
  // normal hover/collapse transitions, preventing staggered color fades.
  const firstFrame = requestFrame(() => {
    pendingTransitionDisableFrames = pendingTransitionDisableFrames.filter(
      (id) => id !== firstFrame
    )
    const secondFrame = requestFrame(() => {
      pendingTransitionDisableFrames = pendingTransitionDisableFrames.filter(
        (id) => id !== secondFrame
      )
      root.classList.remove(THEME_TRANSITION_DISABLED_CLASS)
    })
    pendingTransitionDisableFrames.push(secondFrame)
  })
  pendingTransitionDisableFrames.push(firstFrame)
}
