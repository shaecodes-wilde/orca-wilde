/** Wilde build: the Google Drive sidebar tab (components/wilde-drive). */
export type WildeDriveConfig = {
  /** Folder the Drive tab browses, e.g. the Google Drive for desktop mount `H:\`. Empty = unset. */
  rootPath: string
}

export function normalizeWildeDriveConfig(value: unknown): WildeDriveConfig {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const rootPath = typeof raw.rootPath === 'string' ? raw.rootPath.trim() : ''
  return { rootPath: rootPath.length > 4096 ? '' : rootPath }
}

/** Google Workspace shortcut files: tiny JSON stubs that only make sense opened in the browser. */
const GOOGLE_SHORTCUT_EXTENSIONS = [
  '.gdoc',
  '.gsheet',
  '.gslides',
  '.gform',
  '.gdraw',
  '.gmap',
  '.gsite',
  '.gjam',
  '.gscript',
  '.gtable'
]

export function isGoogleShortcutFile(name: string): boolean {
  const lower = name.toLowerCase()
  return GOOGLE_SHORTCUT_EXTENSIONS.some((extension) => lower.endsWith(extension))
}
