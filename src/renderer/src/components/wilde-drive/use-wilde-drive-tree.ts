import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { drivePathSeparator, joinDrivePath } from './wilde-drive-paths'

export type DriveEntry = { name: string; path: string; isDirectory: boolean }

type DirState =
  | { status: 'loading'; entries?: DriveEntry[] }
  | { status: 'ready'; entries: DriveEntry[] }
  | { status: 'error'; message: string }

export type DriveCreateMode = 'new-file' | 'new-folder'

export type DriveRow =
  | { kind: 'entry'; key: string; entry: DriveEntry; depth: number; expanded: boolean; loading: boolean }
  | { kind: 'create'; key: string; mode: DriveCreateMode; parentDir: string; depth: number }
  | { kind: 'note'; key: string; text: string; depth: number; error: boolean }

/** Windows housekeeping folders that show up at a drive root; never useful here. */
const HIDDEN_NAMES = new Set(['$recycle.bin', 'system volume information', 'desktop.ini'])

// Why module-level: the panel unmounts when another tab is picked; keep the open folders for the
// session so coming back to Drive lands where you left it (listings still reload on open).
const expandedByRoot = new Map<string, Set<string>>()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Lazily loaded folder tree for the Drive root. No file watching: Drive for desktop streams
 * files on demand, so listings reload whenever the tab opens and on Refresh.
 */
export function useWildeDriveTree(root: string) {
  const sep = drivePathSeparator(root)
  const [dirs, setDirs] = useState<Record<string, DirState>>({})
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(expandedByRoot.get(root) ?? [])
  )
  const generation = useRef(0)

  useEffect(() => {
    expandedByRoot.set(root, expanded)
  }, [root, expanded])

  const loadDir = useCallback(
    async (dirPath: string): Promise<void> => {
      const loadGeneration = generation.current
      setDirs((prev) => ({
        ...prev,
        [dirPath]: {
          status: 'loading',
          entries: prev[dirPath]?.status === 'ready' ? prev[dirPath].entries : undefined
        }
      }))
      try {
        const raw = await window.api.fs.readDir({ dirPath })
        const entries = raw
          .filter((item) => !HIDDEN_NAMES.has(item.name.toLowerCase()))
          .map((item) => ({
            name: item.name,
            path: joinDrivePath(dirPath, item.name, sep),
            isDirectory: item.isDirectory
          }))
        if (loadGeneration === generation.current) {
          setDirs((prev) => ({ ...prev, [dirPath]: { status: 'ready', entries } }))
        }
      } catch (error) {
        if (loadGeneration === generation.current) {
          setDirs((prev) => ({ ...prev, [dirPath]: { status: 'error', message: errorMessage(error) } }))
        }
      }
    },
    [sep]
  )

  const refresh = useCallback(() => {
    generation.current += 1
    const paths = [root, ...expandedByRoot.get(root) ?? []]
    for (const path of paths) {
      void loadDir(path)
    }
  }, [root, loadDir])

  // Load (or reload) whenever the panel opens or the root changes.
  useEffect(() => {
    setDirs({})
    setExpanded(new Set(expandedByRoot.get(root) ?? []))
    generation.current += 1
    void loadDir(root)
    for (const path of expandedByRoot.get(root) ?? []) {
      void loadDir(path)
    }
  }, [root, loadDir])

  const setDirExpanded = useCallback(
    (dirPath: string, open: boolean) => {
      setExpanded((prev) => {
        if (prev.has(dirPath) === open) {
          return prev
        }
        const next = new Set(prev)
        if (open) {
          next.add(dirPath)
        } else {
          next.delete(dirPath)
        }
        return next
      })
      if (open && dirs[dirPath]?.status !== 'ready') {
        void loadDir(dirPath)
      }
    },
    [dirs, loadDir]
  )

  const toggleDir = useCallback(
    (dirPath: string) => setDirExpanded(dirPath, !expanded.has(dirPath)),
    [expanded, setDirExpanded]
  )

  const collapseAll = useCallback(() => setExpanded(new Set()), [])

  const rootState = dirs[root]

  const buildRows = useCallback(
    (create: { mode: DriveCreateMode; parentDir: string } | null): DriveRow[] => {
      const rows: DriveRow[] = []
      const walk = (dirPath: string, depth: number): void => {
        if (create && create.parentDir === dirPath) {
          rows.push({
            kind: 'create',
            key: `create:${dirPath}`,
            mode: create.mode,
            parentDir: dirPath,
            depth
          })
        }
        const state = dirs[dirPath]
        if (!state || (state.status === 'loading' && !state.entries)) {
          if (dirPath !== root) {
            rows.push({ kind: 'note', key: `note:${dirPath}`, text: 'Loading…', depth, error: false })
          }
          return
        }
        if (state.status === 'error') {
          if (dirPath !== root) {
            rows.push({ kind: 'note', key: `note:${dirPath}`, text: state.message, depth, error: true })
          }
          return
        }
        for (const entry of state.entries ?? []) {
          const isOpen = entry.isDirectory && expanded.has(entry.path)
          rows.push({
            kind: 'entry',
            key: entry.path,
            entry,
            depth,
            expanded: isOpen,
            loading: isOpen && dirs[entry.path]?.status === 'loading'
          })
          if (isOpen) {
            walk(entry.path, depth + 1)
          }
        }
      }
      walk(root, 0)
      return rows
    },
    [dirs, expanded, root]
  )

  return useMemo(
    () => ({
      rootState,
      expanded,
      loadDir,
      refresh,
      toggleDir,
      setDirExpanded,
      collapseAll,
      buildRows,
      sep
    }),
    [rootState, expanded, loadDir, refresh, toggleDir, setDirExpanded, collapseAll, buildRows, sep]
  )
}
