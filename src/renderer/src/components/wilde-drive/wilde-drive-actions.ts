import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { translate } from '@/i18n/i18n'
import { isGoogleShortcutFile } from '../../../../shared/wilde-drive'
import { driveBaseName } from './wilde-drive-paths'

export async function openDriveFileInDefaultApp(path: string): Promise<void> {
  const opened = await window.api.shell.openFilePath(path)
  if (!opened) {
    toast.error(
      translate('wildeDrive.openFailed', 'Couldn’t open {{value0}}', { value0: driveBaseName(path) })
    )
  }
}

export async function revealDrivePath(path: string): Promise<void> {
  const result = await window.api.shell.openInFileManager(path)
  if (!result.ok) {
    toast.error(translate('wildeDrive.revealFailed', 'Couldn’t show it in File Explorer'))
  }
}

/**
 * Click on a Drive file: Google Docs/Sheets/Slides shortcuts open in the browser (via the default
 * app); everything else opens as an editor preview tab, like Explorer. Returns false when the file
 * went to the default app instead.
 */
export function openDriveFile(path: string, options: { preview: boolean }): boolean {
  const name = driveBaseName(path)
  if (isGoogleShortcutFile(name)) {
    void openDriveFileInDefaultApp(path)
    return false
  }
  const state = useAppStore.getState()
  const worktreeId = state.activeWorktreeId
  if (!worktreeId) {
    // Editor tabs belong to a workspace; with none open, fall back to the default app.
    void openDriveFileInDefaultApp(path)
    return false
  }
  state.openFile(
    {
      filePath: path,
      // Why: relativePath === filePath is the external-file contract (see ai-vault-session-log-open):
      // the editor reads the exact authorized Drive path, not a worktree-relative one.
      relativePath: path,
      worktreeId,
      // Drive is on this PC: pin local ownership so an active runtime can't claim the path.
      runtimeEnvironmentId: null,
      language: detectLanguage(name),
      mode: 'edit'
    },
    {
      preview: options.preview,
      focusEditor: true,
      suppressActiveRuntimeFallback: true
    }
  )
  return true
}

export function makeDriveFilePermanent(path: string): void {
  useAppStore.getState().makePreviewFilePermanent(path)
}
