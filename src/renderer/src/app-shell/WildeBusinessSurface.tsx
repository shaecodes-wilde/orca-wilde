import { useCallback, useRef, useState } from 'react'
import BusinessPage, { type BusinessPageName } from '@/components/wilde-business/BusinessPage'
import { BusinessCommandBar } from '@/components/wilde-business/commands/BusinessCommandBar'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { targetKey, type BusinessTarget } from '../../../shared/wilde/domain'
import type { BusinessAction, NavigationResult } from '../../../shared/wilde/navigation-commands'
import { useBusinessNavigationContext } from './business-navigation-context'
import type { CommandAudit } from '../../../shared/wilde/commands'

export default function WildeBusinessSurface({
  page
}: {
  page: BusinessPageName
}): React.JSX.Element {
  type Context = { page: BusinessPageName; clientId?: string; projectId?: string }
  const [initialContext] = useState<Context>(() => {
    const previous = useBusinessNavigationContext.getState().returnTo
    return previous?.page === page ? previous : { page }
  })
  const [context, setContext] = useState<Context>(initialContext)
  const [destination, setDestination] = useState<Context>(initialContext)
  const [navigationRevision, setNavigationRevision] = useState(0)
  const history = useRef<Context[]>([])
  const lastContext = useRef<Context>(initialContext)
  const replaying = useRef(false)
  const [action, setAction] = useState<BusinessAction>()
  const [result, setResult] = useState<NavigationResult>()
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const onContextChange = useCallback((next: Context) => {
    useBusinessNavigationContext.setState({ current: next })
    if (JSON.stringify(next) !== JSON.stringify(lastContext.current)) {
      if (!replaying.current) {
        history.current = [...history.current.slice(-49), lastContext.current]
      }
      lastContext.current = next
    }
    replaying.current = false
    generation.current++
    setContext(next)
    setResult(undefined)
  }, [])
  const openTarget = useCallback(async (target: BusinessTarget) => {
    const api = window.api.wildeBusiness
    if (!api) {
      return false
    }
    const expected = generation.current
    const targets = await api.targets()
    if (expected !== generation.current) {
      return false
    }
    const current = targets.find((candidate) => targetKey(candidate) === targetKey(target))
    const host = current && parseExecutionHostId(current.hostId)
    if (!current?.available || !host) {
      setMessage('Workspace unavailable. Reconnect or locate it on its owning host.')
      return false
    }
    const state = useAppStore.getState()
    if (current.kind === 'worktree') {
      const worktree = Object.values(state.worktreesByRepo)
        .flat()
        .find(
          (item) =>
            (item.instanceId ?? item.identity?.key) === current.stableId &&
            (host.kind === 'runtime'
              ? item.runtimeOwnerEnvironmentId === host.environmentId
              : (item.identity?.executionHostId ?? item.hostId ?? 'local') === current.hostId)
        )
      if (!worktree) {
        setMessage('Workspace catalog changed. Refresh before opening.')
        return false
      }
      activateAndRevealWorkspace(worktree.id, { executionHostId: host.id })
    } else if (current.kind === 'folder') {
      activateAndRevealWorkspace(`folder:${current.stableId}`, { executionHostId: host.id })
    } else {
      setMessage('Choose one of this project’s existing workspaces to open.')
      return false
    }
    return true
  }, [])
  async function audit(
    action: CommandAudit['action'],
    status: CommandAudit['status'],
    clientId?: string
  ): Promise<void> {
    try {
      await window.api.wildeBusiness?.auditCommand({
        requestId: crypto.randomUUID(),
        action,
        status,
        clientId: clientId ?? null
      })
    } catch {
      setMessage('Command result could not be recorded. Refresh business data before continuing.')
    }
  }
  async function apply(next: BusinessAction): Promise<void> {
    setResult(undefined)
    if (next.id === 'workspace.open') {
      useBusinessNavigationContext.getState().remember(lastContext.current)
      const opened = await openTarget(next.target)
      await audit(next.id, opened ? 'success' : 'unavailable', context.clientId)
      return
    }
    if (next.id === 'navigation.back') {
      const prior = history.current.pop()
      if (prior) {
        replaying.current = true
        setAction(undefined)
        setDestination(prior)
        setNavigationRevision((revision) => revision + 1)
        await audit(next.id, 'success', prior.clientId)
        return
      }
      const state = useAppStore.getState()
      if (state.worktreeNavHistoryIndex <= 0) {
        setMessage('No earlier available view in this session.')
      } else {
        state.goBackWorktree()
      }
      await audit(
        next.id,
        state.worktreeNavHistoryIndex <= 0 ? 'not-found' : 'success',
        context.clientId
      )
      return
    }
    setAction(next)
    setMessage(
      next.id === 'draft.projectNote'
        ? 'Draft prepared for review; save explicitly to keep it.'
        : 'Opened requested view.'
    )
    await audit(next.id, 'success', 'clientId' in next ? next.clientId : undefined)
  }
  async function command(text: string): Promise<void> {
    const api = window.api.wildeBusiness
    if (!api) {
      return
    }
    const currentGeneration = ++generation.current
    try {
      const resolved = await api.resolveCommand({
        text,
        clientId: context.clientId,
        projectId: context.projectId
      })
      if (currentGeneration !== generation.current) {
        await audit('unresolved', 'stale-context', context.clientId)
        return
      }
      if (resolved.status === 'success') {
        await apply(resolved.action)
      } else {
        setResult(resolved)
        await audit('unresolved', resolved.status, context.clientId)
      }
    } catch {
      setMessage('Command unavailable. Use the navigation controls or try again.')
      await audit('unresolved', 'failed', context.clientId)
    }
  }
  return (
    <BusinessPage
      key={navigationRevision}
      initialPage={destination.page}
      initialClientId={destination.clientId}
      initialProjectId={destination.projectId}
      action={action}
      onContextChange={onContextChange}
      onOpenTarget={(target) => {
        useBusinessNavigationContext.getState().remember(lastContext.current)
        void openTarget(target).catch(() => setMessage('Owning host could not be reached.'))
      }}
      onWorkspaces={() => useAppStore.getState().setActiveView('terminal')}
      commandSlot={
        <div className="space-y-2">
          <BusinessCommandBar
            scopeKey={`${context.page}:${context.clientId ?? ''}:${context.projectId ?? ''}`}
            onCommand={(text) => {
              void command(text)
            }}
          />
          {message ? (
            <p role="status" className="text-xs text-muted-foreground">
              {message}
            </p>
          ) : null}
          {result && result.status !== 'success' ? (
            <div role="status">
              <p className="text-sm">{result.message}</p>
              {result.status === 'needs-choice'
                ? result.choices.map((choice) => (
                    <Button
                      key={JSON.stringify(choice.action)}
                      variant="outline"
                      onClick={() => {
                        void apply(choice.action)
                      }}
                    >
                      {choice.label}
                    </Button>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      }
    />
  )
}
