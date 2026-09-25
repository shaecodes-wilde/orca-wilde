import type { TerminalThemeMap } from './types'

// Opt-in Wilde Systems palette: stock ANSI hues so terminal-contrast floors stay legal
// (#0b0c10 background clears DARK_BG_MIN_CONTRAST for every chromatic channel).
export const WILDE_TERMINAL_THEMES: TerminalThemeMap = {
  'Wilde Systems Dark': {
    background: '#0b0c10',
    foreground: '#f8f8fa',
    cursor: '#8bd8b0',
    cursorAccent: '#0b0c10',
    // Muted panel tone, not lavender: ANSI text must stay readable over the selection.
    selectionBackground: '#292f3a',
    selectionForeground: '#f8f8fa',
    black: '#1d1f21',
    red: '#cc6666',
    green: '#b5bd68',
    yellow: '#f0c674',
    blue: '#81a2be',
    magenta: '#b294bb',
    cyan: '#8abeb7',
    white: '#c5c8c6',
    brightBlack: '#666666',
    brightRed: '#d54e53',
    brightGreen: '#b9ca4a',
    brightYellow: '#e7c547',
    brightBlue: '#7aa6da',
    brightMagenta: '#c397d8',
    brightCyan: '#70c0b1',
    brightWhite: '#eaeaea'
  }
}
