import { useRef, useState } from 'react'
import { ListMusic, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import type { WildeSpotifyRecentContext } from '../../../../shared/wilde-spotify'
import { getWildeSpotifyApi } from './use-wilde-spotify'

type MenuState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; contexts: WildeSpotifyRecentContext[] }
  | { kind: 'error'; message: string }

/** "Recently played" flyout: distinct albums/playlists/artists; clicking one plays it on this PC. */
export function WildeSpotifyRecentMenu({
  connected,
  onError,
  anchorRef
}: {
  connected: boolean
  onError: (message: string) => void
  /** The player card: the menu centers on it and matches its width. */
  anchorRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<MenuState>({ kind: 'idle' })
  const [startingUri, setStartingUri] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Measured on open: the menu matches the card's width and lines up with its edges.
  const [fit, setFit] = useState<{ width: number; alignOffset: number; sideOffset: number } | null>(
    null
  )

  const measureFit = (): void => {
    const card = anchorRef.current?.getBoundingClientRect()
    const trigger = triggerRef.current?.getBoundingClientRect()
    if (!card || !trigger) {
      setFit(null)
      return
    }
    // Why align="end" + a negative offset: floating-ui negates alignOffset for end alignment, so
    // this pushes the menu's right edge from the ≡ button out to the card's right edge.
    setFit({
      width: card.width,
      alignOffset: -(card.right - trigger.right),
      // Clear the card's top edge (the ≡ button sits below it), then a small gap.
      sideOffset: trigger.top - card.top + 8
    })
  }

  const load = async (): Promise<void> => {
    const api = getWildeSpotifyApi()
    if (!api) {
      return
    }
    setMenu((current) => (current.kind === 'ready' ? current : { kind: 'loading' }))
    const result = await api.getRecent()
    setMenu(result.ok ? { kind: 'ready', contexts: result.contexts } : { kind: 'error', message: result.message })
  }

  const play = async (context: WildeSpotifyRecentContext): Promise<void> => {
    setStartingUri(context.uri)
    const result = await getWildeSpotifyApi()?.playContext(context.uri)
    setStartingUri(null)
    if (result && !result.ok) {
      onError(result.message)
      return
    }
    setOpen(false)
  }

  const label = translate('wildeSpotify.recent.title', 'Recently played')

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          measureFit()
        }
        setOpen(next)
        if (next && connected) {
          void load()
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="wilde-spotify-icon-button"
          aria-label={label}
          title={label}
        >
          <ListMusic size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        alignOffset={fit?.alignOffset ?? 0}
        sideOffset={fit?.sideOffset ?? 10}
        className="wilde-spotify-menu wilde-spotify-recent p-0"
        style={{ width: fit?.width ?? 288 }}
      >
        <div className="wilde-spotify-menu-header">{label}</div>
        {!connected ? (
          <div className="wilde-spotify-menu-note">
            {translate(
              'wildeSpotify.recent.connect',
              'Connect Spotify in Settings → Appearance → Wilde Systems to see your recent albums.'
            )}
          </div>
        ) : menu.kind === 'loading' || menu.kind === 'idle' ? (
          <div className="wilde-spotify-menu-note">
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : menu.kind === 'error' ? (
          <div className="wilde-spotify-menu-note">{menu.message}</div>
        ) : menu.contexts.length === 0 ? (
          <div className="wilde-spotify-menu-note">
            {translate('wildeSpotify.recent.empty', 'Nothing played recently.')}
          </div>
        ) : (
          <ul className="wilde-spotify-menu-list">
            {menu.contexts.map((context) => (
              <li key={context.uri}>
                <button
                  type="button"
                  className="wilde-spotify-menu-item"
                  disabled={startingUri !== null}
                  onClick={() => void play(context)}
                >
                  {context.imageUrl ? (
                    <img src={context.imageUrl} alt="" className="wilde-spotify-menu-art" />
                  ) : (
                    <span className="wilde-spotify-menu-art" />
                  )}
                  <span className="wilde-spotify-menu-text">
                    <span className="wilde-spotify-menu-name">{context.name}</span>
                    <span className="wilde-spotify-menu-subtitle">{context.subtitle}</span>
                  </span>
                  {startingUri === context.uri ? <Loader2 size={14} className="animate-spin" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
