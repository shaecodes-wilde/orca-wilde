import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { DriveCreateMode, DriveEntry, useWildeDriveTree } from './use-wilde-drive-tree'
import type { DriveRowMenuActions } from './WildeDriveRow'
import { openDriveFile, openDriveFileInDefaultApp, revealDrivePath } from './wilde-drive-actions'
import {
  driveBaseName,
  driveParentPath,
  isValidDriveEntryName,
  joinDrivePath
} from './wilde-drive-paths'

export type DriveEditing =
  | { kind: 'rename'; path: string }
  | { kind: 'create'; mode: DriveCreateMode; parentDir: string }
  | null

type DriveOperationsParams = {
  root: string
  tree: ReturnType<typeof useWildeDriveTree>
  searching: boolean
  selected: Set<string>
  setSelected: (next: Set<string>) => void
  setEditing: (next: DriveEditing) => void
  clearQuery: () => void
  bumpSearch: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rejectInvalidName(name: string): boolean {
  if (isValidDriveEntryName(name)) {
    return false
  }
  toast.error(translate('wildeDrive.invalidName', 'That name can’t be used on Google Drive'))
  return true
}

/** Create / rename / delete / menu actions for the Drive tab, via the authorized fs:* IPC. */
export function useWildeDriveOperations({
  root,
  tree,
  searching,
  selected,
  setSelected,
  setEditing,
  clearQuery,
  bumpSearch
}: DriveOperationsParams) {
  // Right-click on one row of a multi-selection acts on the whole selection, like Explorer.
  const targetsFor = (entry: DriveEntry): string[] =>
    selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path]

  const reloadParentOf = (path: string): void => {
    void tree.loadDir(driveParentPath(path))
    if (searching) {
      bumpSearch()
    }
  }

  const startCreate = (parentDir: string, mode: DriveCreateMode): void => {
    clearQuery()
    if (parentDir !== root) {
      tree.setDirExpanded(parentDir, true)
    }
    setEditing({ kind: 'create', mode, parentDir })
  }

  const submitCreate = async (parentDir: string, mode: DriveCreateMode, name: string) => {
    setEditing(null)
    if (rejectInvalidName(name)) {
      return
    }
    const target = joinDrivePath(parentDir, name, tree.sep)
    try {
      await (mode === 'new-folder'
        ? window.api.fs.createDir({ dirPath: target })
        : window.api.fs.createFile({ filePath: target }))
      await tree.loadDir(parentDir)
      setSelected(new Set([target]))
      if (mode === 'new-file') {
        openDriveFile(target, { preview: false })
      }
    } catch (error) {
      toast.error(
        translate('wildeDrive.createFailed', 'Couldn’t create {{value0}}', { value0: name }),
        { description: errorText(error) }
      )
    }
  }

  const submitRename = async (path: string, name: string) => {
    setEditing(null)
    if (rejectInvalidName(name)) {
      return
    }
    const target = joinDrivePath(driveParentPath(path), name, tree.sep)
    try {
      await window.api.fs.rename({ oldPath: path, newPath: target })
      reloadParentOf(path)
      setSelected(new Set([target]))
    } catch (error) {
      toast.error(
        translate('wildeDrive.renameFailed', 'Couldn’t rename {{value0}}', {
          value0: driveBaseName(path)
        }),
        { description: errorText(error) }
      )
    }
  }

  const deleteEntries = async (entry: DriveEntry) => {
    for (const path of targetsFor(entry)) {
      try {
        // Recycle Bin (shell.trashItem) in the main process, so a mistake can be undone.
        await window.api.fs.deletePath({ targetPath: path, recursive: true })
        reloadParentOf(path)
      } catch (error) {
        toast.error(
          translate('wildeDrive.deleteFailed', 'Couldn’t delete {{value0}}', {
            value0: driveBaseName(path)
          }),
          { description: errorText(error) }
        )
      }
    }
    setSelected(new Set())
  }

  const actions: DriveRowMenuActions = {
    onOpen: (entry) => openDriveFile(entry.path, { preview: false }),
    onOpenDefault: (entry) => void openDriveFileInDefaultApp(entry.path),
    onReveal: (entry) => void revealDrivePath(entry.path),
    onCopyPath: (entry) => window.api.ui.writeClipboardText(targetsFor(entry).join('\n')),
    onNew: (entry, mode) =>
      startCreate(entry.isDirectory ? entry.path : driveParentPath(entry.path), mode),
    onRename: (entry) => {
      clearQuery()
      setEditing({ kind: 'rename', path: entry.path })
    },
    onDelete: (entry) => void deleteEntries(entry)
  }

  return { actions, startCreate, submitCreate, submitRename }
}
