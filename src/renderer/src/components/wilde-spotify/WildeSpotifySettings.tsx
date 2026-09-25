import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { WILDE_SPOTIFY_REDIRECT_URI } from '../../../../shared/wilde-spotify'
import { SettingsRow, SettingsSwitchRow } from '../settings/SettingsFormControls'
import {
  getWildeSpotifyApi,
  useWildeSpotifyAccount,
  useWildeSpotifyConfig
} from './use-wilde-spotify'

const DASHBOARD_URL = 'https://developer.spotify.com/dashboard'

/** Settings → Appearance → Wilde Systems: the Spotify mini-player block. */
export function WildeSpotifySettings(): React.JSX.Element | null {
  const [config, updateConfig] = useWildeSpotifyConfig()
  const account = useWildeSpotifyAccount()
  const [clientIdDraft, setClientIdDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setClientIdDraft(config?.clientId ?? '')
  }, [config?.clientId])

  if (!getWildeSpotifyApi() || !config) {
    return null
  }

  const draft = clientIdDraft.trim()
  const draftValid = /^[A-Za-z0-9]{16,64}$/.test(draft)
  const connected = account?.state === 'connected'

  const saveClientId = async (): Promise<void> => {
    if (draftValid && draft !== config.clientId) {
      await updateConfig({ clientId: draft })
    }
  }

  const connect = async (): Promise<void> => {
    setBusy(true)
    try {
      await saveClientId()
      await getWildeSpotifyApi()?.connect()
    } finally {
      setBusy(false)
    }
  }

  const status =
    account === null
      ? ''
      : account.state === 'connected'
        ? translate('wildeSpotify.settings.connectedAs', 'Connected as {{value0}}', {
            value0: account.displayName ?? 'Spotify'
          })
        : account.state === 'connecting'
          ? translate('wildeSpotify.settings.connecting', 'Waiting for Spotify in your browser…')
          : account.state === 'error'
            ? account.message
            : account.state === 'no-client-id'
              ? translate('wildeSpotify.settings.needsClientId', 'Add your Client ID to connect.')
              : translate('wildeSpotify.settings.notConnected', 'Not connected.')

  return (
    <div className="space-y-1 border-t border-border/60 pt-2">
      <SettingsSwitchRow
        label={translate('wildeSpotify.settings.title', 'Spotify player')}
        description={translate(
          'wildeSpotify.settings.description',
          'Now playing and controls for the Spotify desktop app, docked at the bottom of the right sidebar.'
        )}
        checked={config.enabled}
        onChange={() => void updateConfig({ enabled: !config.enabled })}
      />
      <SettingsSwitchRow
        label={translate('wildeSpotify.settings.visualizer', 'Visualizer')}
        description={translate(
          'wildeSpotify.settings.visualizerDescription',
          'Lavender bars around play/pause that move with Spotify’s audio only. Audio is analysed on this PC, never recorded, and capture stops while paused.'
        )}
        checked={config.visualizer}
        disabled={!config.enabled}
        onChange={() => void updateConfig({ visualizer: !config.visualizer })}
      />
      <SettingsRow
        label={translate('wildeSpotify.settings.account', 'Spotify account')}
        description={translate(
          'wildeSpotify.settings.accountDescription',
          'Needed for seeking, Liked Songs and the recently played menu (Premium for playback control). Create an app at {{value0}}, add the redirect URI {{value1}}, and paste its Client ID here.',
          { value0: DASHBOARD_URL, value1: WILDE_SPOTIFY_REDIRECT_URI }
        )}
        alignTop
        control={
          <div className="flex w-64 flex-col gap-2">
            <Input
              value={clientIdDraft}
              placeholder={translate('wildeSpotify.settings.clientIdPlaceholder', 'Client ID')}
              aria-label={translate('wildeSpotify.settings.clientId', 'Spotify Client ID')}
              spellCheck={false}
              onChange={(event) => setClientIdDraft(event.target.value)}
              onBlur={() => void saveClientId()}
            />
            <div className="flex gap-2">
              {connected ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void getWildeSpotifyApi()?.disconnect()}
                >
                  {translate('wildeSpotify.settings.disconnect', 'Disconnect')}
                </Button>
              ) : (
                <Button size="sm" disabled={!draftValid || busy} onClick={() => void connect()}>
                  {translate('wildeSpotify.settings.connect', 'Connect Spotify')}
                </Button>
              )}
            </div>
            {status ? <p className="text-[11px] text-muted-foreground">{status}</p> : null}
          </div>
        }
      />
    </div>
  )
}
