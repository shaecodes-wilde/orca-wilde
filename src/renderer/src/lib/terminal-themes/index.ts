import { CLASSIC_TERMINAL_THEMES } from './classic'
import { DEFAULT_TERMINAL_THEMES } from './defaults'
import { POPULAR_DARK_TERMINAL_THEMES } from './popular-dark'
import { POPULAR_LIGHT_TERMINAL_THEMES } from './popular-light'
import { WILDE_TERMINAL_THEMES } from './wilde'
import { mergeTerminalThemeCatalogs } from './shared'
import type { TerminalThemeMap } from './types'

const THEME_CATEGORIES: readonly TerminalThemeMap[] = [
  DEFAULT_TERMINAL_THEMES,
  POPULAR_DARK_TERMINAL_THEMES,
  POPULAR_LIGHT_TERMINAL_THEMES,
  CLASSIC_TERMINAL_THEMES,
  WILDE_TERMINAL_THEMES
]

export const TERMINAL_THEME_CATALOG: TerminalThemeMap = mergeTerminalThemeCatalogs(
  ...THEME_CATEGORIES
)
