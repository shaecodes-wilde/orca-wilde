import { Home, Users, Workflow, PanelsTopLeft } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { useBusinessNavigationContext } from './business-navigation-context'

export function WildeBusinessNav(): React.JSX.Element | null {
  const activeView = useAppStore((state) => state.activeView)
  const returnTo = useBusinessNavigationContext((state) => state.returnTo)
  const current = useBusinessNavigationContext((state) => state.current)
  const selectedView =
    activeView.startsWith('wilde-') && current ? `wilde-${current.page}` : activeView
  if (!window.api?.wildeBusiness) {
    return null
  }
  const entries = [
    ['wilde-home', 'Home', Home],
    ['wilde-clients', 'Clients', Users],
    ['wilde-workspaces', 'Workspaces', PanelsTopLeft],
    ['wilde-automations', 'Automations', Workflow]
  ] as const
  return (
    <nav
      aria-label="Wilde business"
      className="grid gap-1 border-b border-sidebar-border pb-2 mb-1"
    >
      {entries.map(([view, label, Icon]) => (
        <Button
          key={view}
          variant={selectedView === view ? 'secondary' : 'ghost'}
          size="sm"
          aria-current={selectedView === view ? 'page' : undefined}
          onClick={() => {
            const state = useAppStore.getState()
            state.recordViewVisit(view)
            state.setActiveView(view)
          }}
        >
          <Icon />
          {label}
        </Button>
      ))}
      {activeView === 'terminal' && returnTo ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const state = useAppStore.getState()
            state.recordViewVisit(`wilde-${returnTo.page}`)
            state.setActiveView(`wilde-${returnTo.page}`)
          }}
        >
          {returnTo.clientId ? 'Return to client' : 'Return to business view'}
        </Button>
      ) : null}
    </nav>
  )
}
