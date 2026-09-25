import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { SettingsRow } from '../settings/SettingsFormControls'
import { getWildeDriveApi, pickWildeDriveRoot, useWildeDriveConfig } from './use-wilde-drive'

/** Settings → Appearance → Wilde Systems: the folder the Google Drive sidebar tab browses. */
export function WildeDriveSettings(): React.JSX.Element | null {
  const [config, updateConfig] = useWildeDriveConfig()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft(config?.rootPath ?? '')
  }, [config?.rootPath])

  if (!getWildeDriveApi() || !config) {
    return null
  }

  const commit = (): void => {
    const next = draft.trim()
    if (next !== config.rootPath) {
      void updateConfig({ rootPath: next })
    }
  }

  return (
    <div className="space-y-1 border-t border-border/60 pt-2">
      <SettingsRow
        label={translate('wildeDrive.settings.title', 'Google Drive folder')}
        description={translate(
          'wildeDrive.settings.description',
          'The drive or folder the Google Drive tab in the right sidebar browses, usually where Google Drive for desktop mounts (for example H:\\).'
        )}
        alignTop
        control={
          <div className="flex w-64 gap-2">
            <Input
              value={draft}
              placeholder={translate('wildeDrive.settings.placeholder', 'H:\\')}
              aria-label={translate('wildeDrive.settings.title', 'Google Drive folder')}
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commit()
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void pickWildeDriveRoot(config.rootPath, updateConfig)}
            >
              <FolderOpen className="size-3.5" />
              {translate('wildeDrive.settings.browse', 'Browse…')}
            </Button>
          </div>
        }
      />
    </div>
  )
}
