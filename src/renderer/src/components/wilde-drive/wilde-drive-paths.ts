/** Path helpers for the Drive tab. The root is a local Windows path (e.g. `H:\`) but stay neutral. */

export type DrivePathSeparator = '\\' | '/'

export function drivePathSeparator(root: string): DrivePathSeparator {
  return root.includes('\\') ? '\\' : '/'
}

export function joinDrivePath(dir: string, name: string, sep: DrivePathSeparator): string {
  return dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${name}` : `${dir}${sep}${name}`
}

export function driveParentPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  if (index < 0) {
    return path
  }
  const parent = trimmed.slice(0, index)
  // `H:` → `H:\` so a drive root stays a real directory path.
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent || '/'
}

export function driveBaseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return index < 0 ? trimmed : trimmed.slice(index + 1)
}

/** `fs:listFiles` returns root-relative `/` paths; turn one back into an absolute Drive path. */
export function driveAbsoluteFromRelative(root: string, relativePath: string): string {
  const sep = drivePathSeparator(root)
  return joinDrivePath(root, relativePath.split('/').join(sep), sep)
}

/** Windows shells and Drive itself reject these characters in names. */
export function isValidDriveEntryName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed !== '.' && trimmed !== '..' && !/[\\/:*?"<>|]/.test(trimmed)
}
