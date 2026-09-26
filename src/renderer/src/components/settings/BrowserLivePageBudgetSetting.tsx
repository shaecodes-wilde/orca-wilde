import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSegmentedControl } from './SettingsFormControls'
import type { SettingsSearchEntry } from './settings-search'
import { DEFAULT_BROWSER_GUEST_LIVE_PAGE_BUDGET } from '../browser-pane/host-guest/browser-guest-worktree-retention'

export const getBrowserLivePageBudgetSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate('settings.browser.livePageBudget.title', 'Background pages kept live'),
    description: translate(
      'settings.browser.livePageBudget.description',
      'Browser pages in other workspaces stay loaded up to this limit. Older ones reload when you return. Pages playing audio, downloading, or driven by an agent always stay live.'
    ),
    keywords: ['browser', 'memory', 'pages', 'tabs', 'budget', 'reload', 'background']
  })
)

type BrowserLivePageBudgetSettingProps = {
  settings: Pick<GlobalSettings, 'browserGuestLivePageBudget'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserLivePageBudgetSetting({
  settings,
  updateSettings
}: BrowserLivePageBudgetSettingProps): React.JSX.Element {
  const { title, description, keywords } = getBrowserLivePageBudgetSearchEntry()
  return (
    <SearchableSetting title={title} description={description} keywords={keywords}>
      <div className="flex items-start justify-between gap-4 py-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <Label>{title}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <SettingsSegmentedControl
          value={settings.browserGuestLivePageBudget ?? DEFAULT_BROWSER_GUEST_LIVE_PAGE_BUDGET}
          onChange={(browserGuestLivePageBudget) => updateSettings({ browserGuestLivePageBudget })}
          ariaLabel={title}
          size="sm"
          options={[
            {
              value: 4,
              label: translate('settings.browser.livePageBudget.low', 'Low-memory (4)')
            },
            {
              value: 8,
              label: translate('settings.browser.livePageBudget.balanced', 'Balanced (8)')
            },
            {
              value: 16,
              label: translate('settings.browser.livePageBudget.keepWarm', 'Keep-warm (16)')
            }
          ]}
        />
      </div>
    </SearchableSetting>
  )
}
