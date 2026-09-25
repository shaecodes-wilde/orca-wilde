import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Loader2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { translate } from '@/i18n/i18n'
import {
  encodeWorkspaceFilePaths,
  WORKSPACE_FILE_PATH_MIME,
  WORKSPACE_FILE_PATHS_MIME
} from '@/lib/workspace-file-drag'
import { GoogleDriveIcon } from './google-drive-icon'
import { isGoogleShortcutFile } from '../../../../shared/wilde-drive'
import type { DriveEntry } from './use-wilde-drive-tree'

export const DRIVE_ROW_HEIGHT = 26

export type DriveRowMenuActions = {
  onOpen: (entry: DriveEntry) => void
  onOpenDefault: (entry: DriveEntry) => void
  onReveal: (entry: DriveEntry) => void
  onCopyPath: (entry: DriveEntry) => void
  onNew: (entry: DriveEntry, mode: 'new-file' | 'new-folder') => void
  onRename: (entry: DriveEntry) => void
  onDelete: (entry: DriveEntry) => void
}

/**
 * Writes the dragged path(s) the way Explorer rows do, so the terminal's existing drop handler
 * pastes them (quoted for the target shell) with no Drive-specific code.
 */
function writeDragPaths(event: React.DragEvent, entry: DriveEntry, selected: Set<string>): void {
  const paths = selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path]
  event.dataTransfer.setData(WORKSPACE_FILE_PATH_MIME, entry.path)
  if (paths.length > 1) {
    event.dataTransfer.setData(WORKSPACE_FILE_PATHS_MIME, encodeWorkspaceFilePaths(paths))
  }
  event.dataTransfer.effectAllowed = 'copy'
}

export function DriveEntryIcon({
  entry,
  expanded,
  loading
}: {
  entry: DriveEntry
  expanded?: boolean
  loading?: boolean
}): React.JSX.Element {
  if (entry.isDirectory) {
    if (loading) {
      return <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
    }
    return expanded ? (
      <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
    ) : (
      <Folder className="size-3 shrink-0 text-muted-foreground" />
    )
  }
  if (isGoogleShortcutFile(entry.name)) {
    return <GoogleDriveIcon size={12} className="shrink-0 text-muted-foreground" />
  }
  return React.createElement(getFileTypeIcon(entry.name), {
    className: 'size-3 shrink-0 text-muted-foreground'
  })
}

type DriveEntryRowProps = {
  entry: DriveEntry
  depth: number
  expanded: boolean
  loading: boolean
  selected: boolean
  selectedPaths: Set<string>
  renaming: boolean
  /** Shown after the name in search results (the folder it lives in). */
  detail?: string
  onClick: (event: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenuOpen: () => void
  onRenameSubmit: (name: string) => void
  onRenameCancel: () => void
  actions: DriveRowMenuActions
}

export function DriveEntryRow({
  entry,
  depth,
  expanded,
  loading,
  selected,
  selectedPaths,
  renaming,
  detail,
  onClick,
  onDoubleClick,
  onContextMenuOpen,
  onRenameSubmit,
  onRenameCancel,
  actions
}: DriveEntryRowProps): React.JSX.Element {
  const indent = { paddingLeft: `${depth * 16 + 8}px` }
  if (renaming) {
    return (
      <div className="flex h-full items-center gap-1 px-2" style={indent}>
        <span className="size-3 shrink-0" />
        <DriveEntryIcon entry={entry} expanded={expanded} />
        <DriveNameInput initial={entry.name} onSubmit={onRenameSubmit} onCancel={onRenameCancel} />
      </div>
    )
  }
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          onContextMenuOpen()
        }
      }}
    >
      <ContextMenuTrigger asChild>
        <button
          type="button"
          data-selected={selected ? 'true' : undefined}
          className={cn(
            'flex h-full w-full items-center gap-1 rounded-sm px-2 text-left text-xs transition-colors',
            selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-foreground'
          )}
          style={indent}
          draggable
          onDragStart={(event) => writeDragPaths(event, entry, selectedPaths)}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          title={entry.path}
        >
          {entry.isDirectory ? (
            <ChevronRight
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-90'
              )}
            />
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <DriveEntryIcon entry={entry} expanded={expanded} loading={loading} />
          <span className="truncate">{entry.name}</span>
          {detail ? (
            <span className="ml-1 min-w-0 shrink truncate text-[10px] text-muted-foreground">
              {detail}
            </span>
          ) : null}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        {!entry.isDirectory ? (
          <ContextMenuItem onSelect={() => actions.onOpen(entry)}>
            {translate('wildeDrive.menu.open', 'Open')}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={() => actions.onOpenDefault(entry)}>
          {translate('wildeDrive.menu.openDefault', 'Open in Default App')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onReveal(entry)}>
          {translate('wildeDrive.menu.reveal', 'Reveal in File Explorer')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onCopyPath(entry)}>
          {translate('wildeDrive.menu.copyPath', 'Copy Path')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onNew(entry, 'new-file')}>
          {translate('wildeDrive.menu.newFile', 'New File…')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onNew(entry, 'new-folder')}>
          {translate('wildeDrive.menu.newFolder', 'New Folder…')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onRename(entry)}>
          {translate('wildeDrive.menu.rename', 'Rename…')}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={() => actions.onDelete(entry)}>
          {translate('wildeDrive.menu.delete', 'Move to Recycle Bin')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Inline name editor for rename and new file/folder rows. Enter or blur saves; Escape cancels. */
export function DriveNameInput({
  initial,
  onSubmit,
  onCancel
}: {
  initial: string
  onSubmit: (name: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  const settled = useRef(false)
  useEffect(() => {
    const input = inputRef.current
    if (!input) {
      return
    }
    input.focus()
    // Select the name without its extension, like Explorer's rename.
    const dot = initial.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  const finish = (save: boolean): void => {
    if (settled.current) {
      return
    }
    settled.current = true
    const trimmed = value.trim()
    if (save && trimmed && trimmed !== initial) {
      onSubmit(trimmed)
    } else {
      onCancel()
    }
  }
  return (
    <input
      ref={inputRef}
      value={value}
      spellCheck={false}
      className="h-5 min-w-0 flex-1 rounded-sm border border-ring bg-input/60 px-1 text-xs text-foreground outline-none"
      onChange={(event) => setValue(event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
    />
  )
}
