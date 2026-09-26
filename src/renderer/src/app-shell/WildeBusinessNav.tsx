import { Home, Users, Workflow, PanelsTopLeft } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { useBusinessNavigationContext } from './business-navigation-context'

export function WildeBusinessNav(): React.JSX.Element | null {
  const activeView = useAppStore((state) => state.activeView)
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
      className="flex items-center justify-center gap-1 border-b border-sidebar-border pb-2 mb-1"
    >
      {entries.map(([view, label, Icon]) => (
        <Button
          key={view}
          variant={selectedView === view ? 'secondary' : 'ghost'}
          size="icon-sm"
          title={label}
          aria-label={label}
          aria-current={selectedView === view ? 'page' : undefined}
          onClick={() => {
            const state = useAppStore.getState()
            state.recordViewVisit(view)
            state.setActiveView(view)
          }}
        >
          <Icon />
        </Button>
      ))}
    </nav>
  )
}
