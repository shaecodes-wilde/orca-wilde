import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store'

import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ConnectionState, WildeBusinessApi } from '../../../../shared/wilde/commands'
import type { BusinessRecord, Client, Execution, Workflow } from '../../../../shared/wilde/domain'
import { BusinessReports } from './BusinessReports'
import { ConnectionEditor } from './ConnectionEditor'
import type { BusinessAction } from '../../../../shared/wilde/navigation-commands'
import { reportingWindow } from '../../../../shared/wilde/reporting'
import { Choice, EmptyState, timestamp } from './business-fields'

export function AutomationsView({
  action,
  api,
  records,
  clients,
  onEdit,
  onRefresh,
  onImportOutcomes
}: {
  action?: Extract<BusinessAction, { id: 'executions.list' }>
  api: WildeBusinessApi
  records: BusinessRecord[]
  clients: Client[]
  onEdit: (workflow: Workflow) => void
  onRefresh: () => Promise<void>
  onImportOutcomes: () => void
}): React.JSX.Element {
  const openAgentAutomations = useAppStore((state) => state.openAutomationsPage)
  const [connection, setConnection] = useState<ConnectionState | null>(null)
  const [configuring, setConfiguring] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [clientId, setClientId] = useState(action?.clientId ?? 'all')
  const [tab, setTab] = useState(action ? 'executions' : 'workflows')
  const [failedThisWeek, setFailedThisWeek] = useState(Boolean(action))
  const week = reportingWindow('week', Intl.DateTimeFormat().resolvedOptions().timeZone)
  const alive = useRef(true)
  const refreshConnection = useCallback(async () => {
    try {
      const next = await api.connection()
      if (alive.current) {
        setConnection(next)
      }
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : 'Could not read connection status.')
      }
    }
  }, [api])
  useEffect(() => {
    alive.current = true
    void refreshConnection()
    const interval = setInterval(() => {
      void refreshConnection()
    }, 15000)
    return () => {
      alive.current = false
      clearInterval(interval)
    }
  }, [refreshConnection])
  async function sync(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const next = await api.sync()
      if (alive.current) {
        setConnection(next)
      }
      await onRefresh()
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : 'Collection failed.')
      }
    } finally {
      if (alive.current) {
        setBusy(false)
      }
    }
  }
  async function toggleCollection(): Promise<void> {
    if (!connection || busy) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await api.setConnectionEnabled(!connection.enabled)
      if (alive.current) {
        setConnection(next)
      }
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : 'Could not change collection state.')
      }
    } finally {
      if (alive.current) {
        setBusy(false)
      }
    }
  }
  const workflows = records.filter(
    (record): record is Workflow =>
      record.type === 'workflow' &&
      !record.archivedAt &&
      (clientId === 'all' || record.clientId === clientId) &&
      `${record.title} ${record.purpose} ${record.workflowId}`
        .toLowerCase()
        .includes(query.toLowerCase())
  )
  const executions = records
    .filter(
      (record): record is Execution =>
        record.type === 'execution' &&
        (clientId === 'all' || record.clientId === clientId) &&
        (!failedThisWeek ||
          (['error', 'crashed'].includes(record.status) &&
            !!record.startedAt &&
            Date.parse(record.startedAt) >= Date.parse(week.from) &&
            Date.parse(record.startedAt) <= Date.parse(week.to)))
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-balance">Automations</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Read-only workflow inventory and retained execution evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openAgentAutomations}>
            Agent automations
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfiguring(true)}>
            {connection?.configured ? 'Connection settings' : 'Connect n8n'}
          </Button>
          {connection?.configured && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                void toggleCollection()
              }}
            >
              {connection.enabled ? 'Pause collection' : 'Resume collection'}
            </Button>
          )}
          <Button
            size="sm"
            disabled={
              busy ||
              !connection?.configured ||
              !connection.enabled ||
              connection.status === 'syncing'
            }
            onClick={() => {
              void sync()
            }}
          >
            Collect now
          </Button>
        </div>
      </header>
      <div className="space-y-2 border-y border-border py-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <Badge variant="outline">{connection?.status ?? 'Loading connection'}</Badge>
          <p className="text-sm">{connection?.label ?? 'n8n'}</p>
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          {connection?.message || 'Checking connection configuration.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Last completed collection: {timestamp(connection?.lastSync ?? null)}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <Choice
          label="Owner scope"
          value={clientId}
          onChange={setClientId}
          options={[
            { value: 'all', label: 'All owners and unassigned' },
            ...clients.map((client) => ({ value: client.id, label: client.name }))
          ]}
        />
        <Button variant="ghost" size="sm" onClick={onImportOutcomes}>
          Import business outcomes
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="workflows">
          <div className="space-y-4">
            <Input
              aria-label="Search workflows"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workflows and purpose"
            />
            {!workflows.length && (
              <EmptyState>
                No observed workflows match this scope. Configure the connection and collect
                inventory, or clear the filter.
              </EmptyState>
            )}
            <div className="divide-y divide-border">
              {workflows.map((workflow) => (
                <article
                  key={workflow.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <h3 className="text-sm font-semibold text-balance">
                      {workflow.title || workflow.workflowId}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {workflow.active ? 'Active in n8n' : 'Inactive in n8n'}
                      </Badge>
                      <Badge variant="outline">{workflow.environment}</Badge>
                      <Badge variant="outline">{workflow.ownership}</Badge>
                    </div>
                    {workflow.purpose && <p className="text-sm text-pretty">{workflow.purpose}</p>}
                    <p className="text-xs text-muted-foreground">
                      {clients.find((client) => client.id === workflow.clientId)?.name ??
                        'No exclusive owner'}{' '}
                      · Observed {timestamp(workflow.observedAt)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onEdit(workflow)}>
                    Assign / document
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="executions">
          <div className="space-y-3">
            <Button size="sm" variant="outline" onClick={() => setFailedThisWeek(!failedThisWeek)}>
              {failedThisWeek ? 'Show all retained observations' : 'Failed attempts this week'}
            </Button>
            {failedThisWeek && (
              <p className="text-xs text-muted-foreground">
                From Monday midnight in {week.timeZone}. Missing start times are excluded.
              </p>
            )}
            <p className="text-xs text-pretty text-muted-foreground">
              Latest 100 retained observations. Raw execution payloads and customer message contents
              are not collected.
            </p>
            {!executions.length && (
              <EmptyState>
                No execution evidence is available for this scope. This does not establish zero
                activity.
              </EmptyState>
            )}
            <div className="divide-y divide-border">
              {executions.slice(0, 100).map((execution) => (
                <div key={execution.id} className="flex flex-wrap justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm">
                      {records.find(
                        (record) =>
                          record.type === 'workflow' &&
                          record.instanceId === execution.instanceId &&
                          record.workflowId === execution.workflowId
                      )?.type === 'workflow'
                        ? workflows.find(
                            (workflow) =>
                              workflow.instanceId === execution.instanceId &&
                              workflow.workflowId === execution.workflowId
                          )?.title || execution.workflowId
                        : execution.workflowId}{' '}
                      · #{execution.executionId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {execution.mode} · Started {timestamp(execution.startedAt)}
                      {execution.retryOf ? ` · Retry of ${execution.retryOf}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">{execution.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="reports">
          <BusinessReports
            lastSync={connection?.lastSync}
            records={records}
            clientId={clientId === 'all' ? undefined : clientId}
          />
        </TabsContent>
      </Tabs>
      {configuring && (
        <ConnectionEditor
          api={api}
          label={connection?.label ?? 'n8n'}
          onClose={() => setConfiguring(false)}
          onSaved={setConnection}
        />
      )}
    </div>
  )
}
