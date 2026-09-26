import React from 'react'
import { Mic, MicOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getWildeObsApi, useWildeObsConfig, useWildeObsStatus } from './use-wilde-obs'

function reportFailure(action: string, result: { ok: boolean; message?: string }): void {
  if (!result.ok) {
    toast.error(
      translate('wildeObs.bar.actionFailed', 'OBS action failed: {{value0}}', {
        value0: action
      }),
      { description: result.message }
    )
  }
}

/**
 * OBS scene presets + mic mute, docked in the left sidebar above the settings/help toolbar.
 * Functional rather than decorative, so it gates on its own setting, not the Wilde look.
 */
export function WildeObsBar(): React.JSX.Element | null {
  const [config] = useWildeObsConfig()
  const visible = getWildeObsApi() !== null && config?.enabled === true
  return visible ? <ObsBar presets={config.presets} /> : null
}

function ObsBar({
  presets
}: {
  presets: { label: string; sceneName: string }[]
}): React.JSX.Element {
  const status = useWildeObsStatus(true)
  const connected = status?.state === 'connected'
  const micMuted = status?.micMuted === true
  const micAvailable = connected && status.micInputName !== null
  const statusText =
    status === null || status.state === 'connecting'
      ? translate('wildeObs.bar.connecting', 'Connecting…')
      : status.state === 'offline'
        ? translate('wildeObs.bar.offline', 'OBS offline')
        : null

  const setScene = async (sceneName: string): Promise<void> => {
    reportFailure(sceneName, (await getWildeObsApi()?.setScene(sceneName)) ?? { ok: false })
  }
  const toggleMic = async (): Promise<void> => {
    reportFailure(
      translate('wildeObs.bar.mic', 'Microphone'),
      (await getWildeObsApi()?.toggleMic()) ?? { ok: false }
    )
  }

  return (
    <div className="flex items-center justify-between border-t border-worktree-sidebar-border px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1">
        {presets.map((preset) => {
          const active = connected && status.currentScene === preset.sceneName
          return (
            <Tooltip key={preset.sceneName}>
              <TooltipTrigger asChild>
                <Button
                  variant={active ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  type="button"
                  disabled={!connected}
                  aria-label={preset.sceneName}
                  aria-pressed={active}
                  onClick={() => void setScene(preset.sceneName)}
                  className={cn('text-muted-foreground', active && 'text-foreground')}
                >
                  {preset.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {preset.sceneName}
              </TooltipContent>
            </Tooltip>
          )
        })}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              disabled={!micAvailable}
              aria-label={translate('wildeObs.bar.mic', 'Microphone')}
              aria-pressed={micMuted}
              onClick={() => void toggleMic()}
              className={cn(
                'text-muted-foreground',
                micMuted && 'text-destructive hover:text-destructive'
              )}
            >
              {micMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {status?.micInputName
              ? micMuted
                ? translate('wildeObs.bar.unmute', 'Unmute {{value0}}', {
                    value0: status.micInputName
                  })
                : translate('wildeObs.bar.mute', 'Mute {{value0}}', {
                    value0: status.micInputName
                  })
              : translate('wildeObs.bar.mic', 'Microphone')}
          </TooltipContent>
        </Tooltip>
      </div>
      {statusText ? (
        <span className="text-[10px] text-muted-foreground/70">{statusText}</span>
      ) : null}
    </div>
  )
}
