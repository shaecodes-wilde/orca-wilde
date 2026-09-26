import { randomUUID } from 'node:crypto'
import type { ConnectionState } from '../../../shared/wilde/commands'
import type { CaptureCheckpoint, CollectorStore, N8nConnection } from './connector-types'
import { N8nClient, N8nError, type ClientOptions } from './client'

const caveat =
  'Capture includes only saved source history; closed/asleep periods and source pruning can leave gaps. Date filtering uses a bounded local scan.'
export class N8nCollector {
  private timer: ReturnType<typeof setTimeout> | null = null
  private abort: AbortController | null = null
  private running: Promise<ConnectionState> | null = null
  private active = false
  private failures = 0
  private authorizationBlocked = false
  private checkpoint: CaptureCheckpoint | null = null
  private cursors = new Set<string>()
  private workflowsAt = 0
  private current: ConnectionState = {
    configured: false,
    enabled: false,
    label: '',
    lastSync: null,
    status: 'disabled',
    message: caveat,
    instanceId: null
  }
  constructor(
    private readonly store: CollectorStore,
    private readonly connection: () => Promise<N8nConnection | null>,
    private readonly options: ClientOptions = {}
  ) {}
  state(): ConnectionState {
    return { ...this.current }
  }
  start(): void {
    if (this.active) {
      return
    }
    this.active = true
    this.schedule(0)
  }
  async stop(): Promise<void> {
    this.active = false
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = null
    this.abort?.abort()
    await this.running
  }
  configurationChanged(): void {
    this.authorizationBlocked = false
    this.checkpoint = null
    this.cursors.clear()
    this.workflowsAt = 0
    this.failures = 0
  }
  sync(): Promise<ConnectionState> {
    if (this.running) {
      return this.running
    }
    this.running = this.collect().finally(() => {
      this.running = null
    })
    return this.running
  }
  private schedule(milliseconds: number): void {
    this.timer = setTimeout(() => {
      void this.sync().finally(() => {
        if (this.active) {
          this.schedule(Math.min(900000, 60000 * 2 ** this.failures))
        }
      })
    }, milliseconds)
    this.timer.unref?.()
  }
  private async collect(): Promise<ConnectionState> {
    this.abort = new AbortController()
    const signal = this.abort.signal
    try {
      const connection = await this.connection()
      signal.throwIfAborted()
      this.current = {
        ...this.current,
        configured: !!connection,
        enabled: !!connection?.enabled,
        label: connection?.label ?? '',
        instanceId: connection?.instanceId ?? null
      }
      if (!connection?.enabled) {
        this.current.status = 'disabled'
        return this.state()
      }
      if (this.authorizationBlocked) {
        return this.state()
      }
      this.current.status = 'syncing'
      const client = new N8nClient(connection, this.options)
      const previous = this.checkpoint ?? (await this.store.readCheckpoint(connection.instanceId))
      // Persisted cursors are not durable offsets: each process starts with an overlapping scan.
      const checkpoint: CaptureCheckpoint = this.checkpoint ?? {
        generation: randomUUID(),
        resource: 'workflows',
        cursor: null,
        startedAt: new Date().toISOString(),
        lastSuccess: previous?.lastSuccess ?? null,
        oldestObserved: previous?.oldestObserved ?? null,
        incomplete: true,
        message: caveat
      }
      this.current.lastSync = checkpoint.lastSuccess
      if (!this.checkpoint && Date.now() - this.workflowsAt < 300000) {
        checkpoint.resource = 'executions'
      }
      const sliceStarted = Date.now()
      if (!this.checkpoint) {
        this.cursors.clear()
      }
      let completed = false
      let pages = 0
      while (pages++ < 20 && Date.now() - sliceStarted < 30000) {
        signal.throwIfAborted()
        const key = `${checkpoint.resource}:${checkpoint.cursor ?? ''}`
        if (this.cursors.has(key)) {
          throw new N8nError('n8n cursor loop detected; history is incomplete')
        }
        if (this.cursors.size >= 10000) {
          throw new N8nError('n8n backfill limit reached; history is incomplete')
        }
        this.cursors.add(key)
        if (checkpoint.resource === 'workflows') {
          let page
          try {
            page = await client.workflows(checkpoint.cursor, signal)
          } catch (error) {
            if (!(error instanceof N8nError) || error.status !== 413) {
              throw error
            }
            page = await client.workflows(checkpoint.cursor, signal, 10)
          }
          const next = { ...checkpoint, cursor: page.cursor }
          if (!page.cursor) {
            next.resource = 'executions'
            this.workflowsAt = Date.now()
          }
          await this.store.commitPage({
            instanceId: connection.instanceId,
            workflows: page.data,
            checkpoint: next
          })
          Object.assign(checkpoint, next)
        } else {
          const page = await client.executions(checkpoint.cursor, signal)
          const dates = page.data.flatMap((value) => (value.startedAt ? [value.startedAt] : []))
          const cutoff = Date.parse(checkpoint.startedAt) - 30 * 86400000
          const atBoundary =
            page.data.length > 0 &&
            page.data.every((value) => value.startedAt && Date.parse(value.startedAt) < cutoff)
          const oldest =
            [
              ...dates,
              ...(checkpoint.oldestObserved ? [checkpoint.oldestObserved] : [])
            ].sort()[0] ?? null
          const next = { ...checkpoint, cursor: page.cursor, oldestObserved: oldest }
          if (atBoundary) {
            next.cursor = null
          }
          if (!next.cursor) {
            next.lastSuccess = new Date().toISOString()
          }
          await this.store.commitPage({
            instanceId: connection.instanceId,
            executions: page.data,
            checkpoint: next
          })
          Object.assign(checkpoint, next)
          if (!next.cursor) {
            completed = true
            break
          }
        }
      }
      for (const id of await this.store.pendingExecutions(connection.instanceId, 10)) {
        if (Date.now() - sliceStarted >= 30000) {
          break
        }
        try {
          const execution = await client.execution(id, signal)
          await this.store.commitPage({
            instanceId: connection.instanceId,
            executions: [execution],
            checkpoint
          })
        } catch (error) {
          if (!(error instanceof N8nError) || error.status !== 404) {
            throw error
          }
          checkpoint.message = `${caveat} An unfinished source execution is no longer available.`
          await this.store.commitPage({ instanceId: connection.instanceId, checkpoint })
        }
      }
      this.checkpoint = completed ? null : checkpoint
      this.current.lastSync = checkpoint.lastSuccess
      this.current.status = 'idle'
      this.current.message = `${!completed ? 'Backfill is incomplete; collection will continue. ' : ''}${checkpoint.message}`
      this.failures = 0
    } catch (error) {
      this.current.status = signal.aborted ? 'idle' : 'error'
      this.current.message = signal.aborted
        ? 'Collection cancelled; committed evidence is preserved.'
        : error instanceof N8nError
          ? error.message
          : 'n8n configuration or metadata could not be read; existing evidence is preserved.'
      if (error instanceof N8nError && [401, 403].includes(error.status)) {
        this.authorizationBlocked = true
      }
      this.checkpoint = null
      this.failures = Math.min(4, this.failures + 1)
    } finally {
      this.abort = null
    }
    return this.state()
  }
}
