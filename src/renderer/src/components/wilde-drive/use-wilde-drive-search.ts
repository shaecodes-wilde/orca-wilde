import { useEffect, useState } from 'react'
import { driveAbsoluteFromRelative } from './wilde-drive-paths'

export const DRIVE_SEARCH_MAX_RESULTS = 500
const DEBOUNCE_MS = 300

export type DriveSearchState = {
  loading: boolean
  results: { path: string; relativePath: string }[]
  error: string | null
  truncated: boolean
}

const IDLE: DriveSearchState = { loading: false, results: [], error: null, truncated: false }

/**
 * Recursive name search across the whole Drive root (same matching as the Explorer filter: every
 * whitespace-separated word must appear in the path). A new query cancels the previous crawl.
 */
export function useWildeDriveSearch(root: string, query: string, revision: number): DriveSearchState {
  const [state, setState] = useState<DriveSearchState>(IDLE)
  const trimmed = query.trim()

  useEffect(() => {
    if (!root || !trimmed) {
      setState(IDLE)
      return
    }
    let cancelled = false
    const requestToken = `wilde-drive-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const timer = window.setTimeout(() => {
      window.api.fs
        .listFiles({
          rootPath: root,
          nameFilter: trimmed,
          maxResults: DRIVE_SEARCH_MAX_RESULTS,
          requestToken
        })
        .then((relativePaths) => {
          if (cancelled) {
            return
          }
          setState({
            loading: false,
            error: null,
            truncated: relativePaths.length >= DRIVE_SEARCH_MAX_RESULTS,
            results: relativePaths.map((relativePath) => ({
              relativePath,
              path: driveAbsoluteFromRelative(root, relativePath)
            }))
          })
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState({
              ...IDLE,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      void window.api.fs.cancelListFiles({ requestToken }).catch(() => {})
    }
  }, [root, trimmed, revision])

  return state
}
