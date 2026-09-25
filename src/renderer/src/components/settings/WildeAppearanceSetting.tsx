import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  DISABLED_WILDE_APPEARANCE,
  normalizeWildeAppearance,
  type WildeAppearanceV1
} from '../../../../shared/wilde-appearance'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useWildeAppearance } from '@/hooks/use-wilde-appearance'
import {
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSwitchRow
} from './SettingsFormControls'

type WildeAppearanceSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function WildeAppearanceSetting({
  settings,
  updateSettings
}: WildeAppearanceSettingProps): React.JSX.Element {
  const { resolvedDark } = useWildeAppearance()
  const stored = normalizeWildeAppearance(settings.wildeAppearance)
  // A non-v1 stored payload is a future build's shape; render the stock-off state rather
  // than drafting v1 edits over fields this build does not understand.
  const wilde = stored?.version === 1 ? stored : DISABLED_WILDE_APPEARANCE
  const subControlsInert = !wilde.enabled

  const update = (patch: Partial<Omit<WildeAppearanceV1, 'version'>>): void => {
    // The store shallow-merges this key, so every write ships a complete six-field object.
    updateSettings({ wildeAppearance: { ...wilde, ...patch } })
  }

  return (
    <div className="space-y-2">
      <SettingsSwitchRow
        label={translate('settings.appearance.wilde.enable.title', 'Wilde Systems appearance')}
        description={translate(
          'settings.appearance.wilde.enable.description',
          'Restyle the app chrome with the Wilde Systems palette while Orca is in dark mode.'
        )}
        checked={wilde.enabled}
        onChange={() => update({ enabled: !wilde.enabled })}
      />
      <div
        inert={subControlsInert}
        aria-hidden={subControlsInert}
        className={cn('space-y-2', subControlsInert && 'pointer-events-none opacity-50')}
      >
        <SettingsRow
          label={translate('settings.appearance.wilde.sidebarTreatment.title', 'Sidebar treatment')}
          control={
            <SettingsSegmentedControl<WildeAppearanceV1['sidebarTreatment']>
              size="sm"
              value={wilde.sidebarTreatment}
              onChange={(sidebarTreatment) => update({ sidebarTreatment })}
              ariaLabel={translate(
                'settings.appearance.wilde.sidebarTreatment.title',
                'Sidebar treatment'
              )}
              options={[
                {
                  value: 'solid',
                  label: translate('settings.appearance.wilde.sidebarTreatment.solid', 'Solid')
                },
                {
                  value: 'oil-slick',
                  label: translate(
                    'settings.appearance.wilde.sidebarTreatment.oilSlick',
                    'Oil Slick'
                  )
                }
              ]}
            />
          }
        />
        <SettingsRow
          label={translate('settings.appearance.wilde.intensity.title', 'Intensity')}
          control={
            <SettingsSegmentedControl<WildeAppearanceV1['intensity']>
              size="sm"
              value={wilde.intensity}
              onChange={(intensity) => update({ intensity })}
              ariaLabel={translate('settings.appearance.wilde.intensity.title', 'Intensity')}
              options={[
                {
                  value: 'subtle',
                  label: translate('settings.appearance.wilde.intensity.subtle', 'Subtle')
                },
                {
                  value: 'balanced',
                  label: translate('settings.appearance.wilde.intensity.balanced', 'Balanced')
                },
                {
                  value: 'expressive',
                  label: translate('settings.appearance.wilde.intensity.expressive', 'Expressive')
                }
              ]}
            />
          }
        />
        <SettingsRow
          label={translate('settings.appearance.wilde.motion.title', 'Motion')}
          control={
            <SettingsSegmentedControl<WildeAppearanceV1['motion']>
              size="sm"
              value={wilde.motion}
              onChange={(motion) => update({ motion })}
              ariaLabel={translate('settings.appearance.wilde.motion.title', 'Motion')}
              options={[
                {
                  value: 'off',
                  label: translate('settings.appearance.wilde.motion.off', 'Off')
                },
                {
                  value: 'slow',
                  label: translate('settings.appearance.wilde.motion.slow', 'Slow')
                }
              ]}
            />
          }
        />
      </div>
      {wilde.enabled && !resolvedDark ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'settings.appearance.wilde.darkModeHint',
            'Wilde chrome applies while Orca is in dark mode.'
          )}
        </p>
      ) : null}
    </div>
  )
}
