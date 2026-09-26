import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  commandAuditSchema,
  type CommandAudit,
  type BusinessRequest,
  type BusinessResult
} from '../../../shared/wilde/commands'
import type { CaptureCheckpoint, CollectorPage, CollectorStore } from '../n8n/connector-types'

export class BusinessService implements CollectorStore {
  private worker: Worker | null = null
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  constructor(private readonly profileDirectory: string) {}
  private request(payload: object): Promise<unknown> {
    if (this.pending.size >= 64) {
      return Promise.reject(new Error('Business service is busy. Try again shortly.'))
    }
    if (!this.worker) {
      const worker = new Worker(join(__dirname, 'wilde-business-worker.js'), {
        workerData: { file: join(this.profileDirectory, 'wilde-business.sqlite') }
      })
      this.worker = worker
      worker.on('message', (message: { id: string; result?: unknown; error?: string }) => {
        const pending = this.pending.get(message.id)
        if (!pending) {
          return
        }
        clearTimeout(pending.timer)
        this.pending.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error))
        } else {
          pending.resolve(message.result)
        }
      })
      worker.on('error', () =>
        this.failPending(
          'Business database could not open. Preserve it and restore a verified backup.'
        )
      )
      worker.on('exit', () => {
        if (this.worker === worker) {
          this.worker = null
          this.failPending(
            'Business database worker stopped. Reload and check whether the change was saved before retrying.'
          )
        }
      })
    }
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const worker = this.worker
        this.worker = null
        this.failPending(
          'Business request timed out. Reload to check its result; do not repeat with a new request ID.'
        )
        void worker?.terminate()
      }, 30000)
      this.pending.set(id, { resolve, reject, timer })
      this.worker?.postMessage({ id, ...payload })
    })
  }
  private failPending(message: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(message))
    }
    this.pending.clear()
  }
  async execute(input: BusinessRequest): Promise<BusinessResult> {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: execute replies are created by the bundled database worker's validated dispatcher.
    return (await this.request({ operation: 'execute', input })) as BusinessResult
  }
  async recordCommandAudit(input: CommandAudit): Promise<void> {
    await this.request({ operation: 'command-audit', input: commandAuditSchema.parse(input) })
  }
  async readCheckpoint(instanceId: string): Promise<CaptureCheckpoint | null> {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this worker operation returns the collector-owned checkpoint schema.
    return (await this.request({ operation: 'checkpoint', instanceId })) as CaptureCheckpoint | null
  }
  async commitPage(page: CollectorPage): Promise<void> {
    await this.request({ operation: 'collect', page })
  }
  async pendingExecutions(instanceId: string, limit: number): Promise<string[]> {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the bundled worker projects only execution IDs for this operation.
    return (await this.request({ operation: 'pending', instanceId, limit })) as string[]
  }
  async close(): Promise<void> {
    const worker = this.worker
    this.worker = null
    this.failPending('Business services disabled.')
    await worker?.terminate()
  }
}
