import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FolderCog, ListCollapse, Loader2, RefreshCw } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { FileExplorerNameFilter } from '../right-sidebar/FileExplorerNameFilter'
import { pickWildeDriveRoot, useWildeDriveConfig } from './use-wilde-drive'
import { useWildeDriveTree, type DriveEntry, type DriveRow } from './use-wilde-drive-tree'
import { DRIVE_SEARCH_MAX_RESULTS, useWildeDriveSearch } from './use-wilde-drive-search'
import { useWildeDriveOperations, type DriveEditing } from './use-wilde-drive-operations'
import { DRIVE_ROW_HEIGHT, DriveEntryIcon, DriveEntryRow, DriveNameInput } from './WildeDriveRow'
import { DriveEmptyState, DriveToolbarButton } from './WildeDrivePanelParts'
import { makeDriveFilePermanent, openDriveFile, revealDrivePath } from './wilde-drive-actions'
import { driveBaseName, driveParentPath } from './wilde-drive-paths'

/** Right-sidebar tab (Wilde build): browse a mounted Google Drive folder like Explorer. */
export default function WildeDrivePanel(): React.JSX.Element {
  const [config, updateConfig] = useWildeDriveConfig()
  if (!config) {
    return <div className="flex-1" />
  }
  if (!config.rootPath) {
    return (
      <DriveEmptyState
        title={translate('wildeDrive.setup.title', 'Choose your Google Drive folder')}
        body={translate(
          'wildeDrive.setup.body',
          'Pick the drive or folder Google Drive for desktop mounts (for example H:\\). You can change it later in Settings → Appearance → Wilde Systems.'
        )}
        action={translate('wildeDrive.setup.browse', 'Browse…')}
        onAction={() => void pickWildeDriveRoot('', updateConfig)}
      />
    )
  }
  return (
    <DriveBrowser
      key={config.rootPath}
      root={config.rootPath}
      onChangeRoot={() => void pickWildeDriveRoot(config.rootPath, updateConfig)}
    />
  )
}

function DriveBrowser({
  root,
  onChangeRoot
}: {
  root: string
  onChangeRoot: () => void
}): React.JSX.Element {
  const tree = useWildeDriveTree(root)
  const [query, setQuery] = useState('')
  const [searchRevision, setSearchRevision] = useState(0)
  const search = useWildeDriveSearch(root, query, searchRevision)
  const searching = query.trim().length > 0
  const [editing, setEditing] = useState<DriveEditing>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchorRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    tree.refresh()
    setSearchRevision((value) => value + 1)
  }, [tree])

  const treeRows = useMemo(
    () => tree.buildRows(editing?.kind === 'create' ? editing : null),
    [tree, editing]
  )
  const searchRows = useMemo<DriveRow[]>(
    () =>
      search.results.map((result) => ({
        kind: 'entry',
        key: result.path,
        entry: { name: driveBaseName(result.path), path: result.path, isDirectory: false },
        depth: 0,
        expanded: false,
        loading: false
      })),
    [search.results]
  )
  const rows = searching ? searchRows : treeRows
  const entryPaths = useMemo(
    () => rows.flatMap((row) => (row.kind === 'entry' ? [row.entry.path] : [])),
    [rows]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DRIVE_ROW_HEIGHT,
    overscan: 20
  })

  // ── Selection ──────────────────────────────────────────
  const selectFromClick = (entry: DriveEntry, event: React.MouseEvent): boolean => {
    if (event.ctrlKey || event.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(entry.path)) {
          next.delete(entry.path)
        } else {
          next.add(entry.path)
        }
        return next
      })
      anchorRef.current = entry.path
      return false
    }
    if (event.shiftKey && anchorRef.current) {
      const from = entryPaths.indexOf(anchorRef.current)
      const to = entryPaths.indexOf(entry.path)
      if (from !== -1 && to !== -1) {
        setSelected(new Set(entryPaths.slice(Math.min(from, to), Math.max(from, to) + 1)))
        return false
      }
    }
    setSelected(new Set([entry.path]))
    anchorRef.current = entry.path
    return true
  }

  const handleClick = (entry: DriveEntry, event: React.MouseEvent): void => {
    if (!selectFromClick(entry, event)) {
      return
    }
    if (entry.isDirectory) {
      tree.toggleDir(entry.path)
    } else {
      openDriveFile(entry.path, { preview: true })
    }
  }

  const handleDoubleClick = (entry: DriveEntry): void => {
    if (!entry.isDirectory) {
      makeDriveFilePermanent(entry.path)
    }
  }

  const { actions, startCreate, submitCreate, submitRename } = useWildeDriveOperations({
    root,
    tree,
    searching,
    selected,
    setSelected,
    setEditing,
    clearQuery: () => setQuery(''),
    bumpSearch: () => setSearchRevision((value) => value + 1)
  })

  // ── Render ─────────────────────────────────────────────
  const rootState = tree.rootState
  const rootLoading = !rootState || rootState.status === 'loading'
  const rootError = rootState?.status === 'error' ? rootState.message : null

  let body: React.ReactNode
  if (rootError && !searching) {
    body = (
      <DriveEmptyState
        title={translate('wildeDrive.unavailable', 'Can’t open {{value0}}', { value0: root })}
        body={translate(
          'wildeDrive.unavailableBody',
          'Make sure Google Drive for desktop is running and the drive is mounted. ({{value0}})',
          { value0: rootError }
        )}
        action={translate('wildeDrive.retry', 'Retry')}
        onAction={refresh}
        secondaryAction={translate('wildeDrive.changeFolder', 'Change folder…')}
        onSecondaryAction={onChangeRoot}
      />
    )
  } else if (rows.length === 0) {
    const message = searching
      ? search.loading
        ? translate('wildeDrive.searching', 'Searching Google Drive…')
        : search.error ?? translate('wildeDrive.noMatches', 'No files match this search')
      : rootLoading
        ? translate('wildeDrive.loading', 'Loading…')
        : translate('wildeDrive.emptyFolder', 'This folder is empty')
    body = <p className="px-4 py-3 text-xs text-muted-foreground">{message}</p>
  } else {
    body = (
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) {
            return null
          }
          return (
            <div
              key={row.key}
              className="absolute left-0 w-full px-1"
              style={{ top: item.start, height: DRIVE_ROW_HEIGHT }}
            >
              {row.kind === 'entry' ? (
                <DriveEntryRow
                  entry={row.entry}
                  depth={row.depth}
                  expanded={row.expanded}
                  loading={row.loading}
                  selected={selected.has(row.entry.path)}
                  selectedPaths={selected}
                  renaming={editing?.kind === 'rename' && editing.path === row.entry.path}
                  detail={searching ? driveParentPath(row.entry.path).slice(root.length) || undefined : undefined}
                  onClick={(event) => handleClick(row.entry, event)}
                  onDoubleClick={() => handleDoubleClick(row.entry)}
                  onContextMenuOpen={() => {
                    if (!selected.has(row.entry.path)) {
                      setSelected(new Set([row.entry.path]))
                      anchorRef.current = row.entry.path
                    }
                  }}
                  onRenameSubmit={(name) => void submitRename(row.entry.path, name)}
                  onRenameCancel={() => setEditing(null)}
                  actions={actions}
                />
              ) : row.kind === 'create' ? (
                <div
                  className="flex h-full items-center gap-1 px-2"
                  style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
                >
                  <span className="size-3 shrink-0" />
                  <DriveEntryIcon
                    entry={{ name: '', path: '', isDirectory: row.mode === 'new-folder' }}
                  />
                  <DriveNameInput
                    initial=""
                    onSubmit={(name) => void submitCreate(row.parentDir, row.mode, name)}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : (
                <div
                  className={cn(
                    'flex h-full items-center truncate text-[11px]',
                    row.error ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  style={{ paddingLeft: `${row.depth * 16 + 28}px` }}
                >
                  {row.text}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 min-h-8 items-center gap-2 border-b border-border px-2">
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
          title={root}
        >
          {translate('wildeDrive.title', 'Google Drive')}
          <span className="ml-1.5 font-normal text-muted-foreground">{root}</span>
        </span>
        <DriveToolbarButton
          label={translate('wildeDrive.collapseAll', 'Collapse All')}
          onClick={tree.collapseAll}
        >
          <ListCollapse className="size-3" />
        </DriveToolbarButton>
        <DriveToolbarButton label={translate('wildeDrive.refresh', 'Refresh Google Drive')} onClick={refresh}>
          {rootLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
        </DriveToolbarButton>
        <DriveToolbarButton label={translate('wildeDrive.changeFolder', 'Change folder…')} onClick={onChangeRoot}>
          <FolderCog className="size-3" />
        </DriveToolbarButton>
      </div>
      <div className="border-b border-border px-2 py-1.5">
        <FileExplorerNameFilter
          query={query}
          loading={search.loading}
          onQueryChange={setQuery}
          onClear={() => setQuery('')}
        />
        {searching && search.truncated ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {translate('wildeDrive.truncated', 'Showing the first {{value0}} matches', {
              value0: DRIVE_SEARCH_MAX_RESULTS
            })}
          </p>
        ) : null}
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scrollRef}
            // Why: the Wilde Spotify card floats over this list; the inset lets the last row
            // scroll up above it (see wilde-spotify.css).
            className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek pt-1 pb-[calc(0.25rem+var(--wilde-spotify-inset,0px))]"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSelected(new Set())
              }
            }}
          >
            {body}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-44">
          <ContextMenuItem onSelect={() => startCreate(root, 'new-file')}>
            {translate('wildeDrive.menu.newFile', 'New File…')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => startCreate(root, 'new-folder')}>
            {translate('wildeDrive.menu.newFolder', 'New Folder…')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={refresh}>
            {translate('wildeDrive.refresh', 'Refresh Google Drive')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void revealDrivePath(root)}>
            {translate('wildeDrive.menu.reveal', 'Reveal in File Explorer')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
