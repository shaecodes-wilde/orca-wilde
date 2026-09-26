import { translate } from '@/i18n/i18n'
import { SettingsSwitchRow } from '../settings/SettingsFormControls'
import { getWildeObsApi, useWildeObsConfig, useWildeObsStatus } from './use-wilde-obs'

/** Settings → Appearance → Wilde Systems: the OBS scene-bar block. */
export function WildeObsSettings(): React.JSX.Element | null {
  const [config, updateConfig] = useWildeObsConfig()
  const status = useWildeObsStatus(config?.enabled === true)

  if (!getWildeObsApi() || !config) {
    return null
  }

  const statusText =
    status === null || status.state === 'connecting'
      ? translate('wildeObs.settings.connecting', 'Connecting to OBS…')
      : status.state === 'connected'
        ? status.micInputName
          ? translate('wildeObs.settings.connectedMic', 'Connected. Mic input: {{value0}}', {
              value0: status.micInputName
            })
          : translate('wildeObs.settings.connectedNoMic', 'Connected. No mic input found in OBS.')
        : translate(
            'wildeObs.settings.offlineHint',
            'OBS unreachable. In OBS, enable Tools → WebSocket Server Settings → Enable WebSocket Server.'
          )

  return (
    <div className="space-y-1 border-t border-border/60 pt-2">
      <SettingsSwitchRow
        label={translate('wildeObs.settings.title', 'OBS controls')}
        description={translate(
          'wildeObs.settings.description',
          'Scene preset buttons and a mic mute docked above the left sidebar’s settings gear. Connects to OBS’s websocket using the port and password from OBS’s own config.'
        )}
        checked={config.enabled}
        onChange={() => void updateConfig({ enabled: !config.enabled })}
      />
      {config.enabled ? <p className="text-[11px] text-muted-foreground">{statusText}</p> : null}
    </div>
  )
}
