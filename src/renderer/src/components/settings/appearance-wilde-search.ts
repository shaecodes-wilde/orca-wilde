import type { SettingsSearchEntry } from './settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getWildeAppearanceEntry = createLocalizedCatalog((): SettingsSearchEntry => ({
  title: translate('settings.appearance.wilde.search.title', 'Wilde Systems'),
  description: translate(
    'settings.appearance.wilde.search.description',
    'Restyle the app chrome with the Wilde Systems palette while Orca is in dark mode.'
  ),
  keywords: [
    ...translateSearchKeyword('settings.appearance.wilde.search.keyword.wilde', 'wilde'),
    ...translateSearchKeyword('settings.appearance.wilde.search.keyword.theme', 'theme'),
    ...translateSearchKeyword('settings.appearance.wilde.search.keyword.sidebar', 'sidebar'),
    ...translateSearchKeyword('settings.appearance.wilde.search.keyword.branding', 'branding')
  ]
}))
