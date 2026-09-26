import { parentPort, workerData } from 'node:worker_threads'
import { BusinessDatabase } from './database'
import { commitCollectedPage, pendingExecutionIds, readCaptureCheckpoint } from './collection-store'
import type { CollectorPage } from '../n8n/connector-types'
import { recordCommandAudit } from './command-audit'

type Message = { id: string } & (
  | { operation: 'execute'; input: unknown }
  | { operation: 'command-audit'; input: unknown }
  | { operation: 'checkpoint'; instanceId: string }
  | { operation: 'collect'; page: CollectorPage }
  | { operation: 'pending'; instanceId: string; limit: number }
)
const store = new BusinessDatabase(workerData.file)
parentPort?.on('message', (message: Message) => {
  try {
    let result: unknown
    switch (message.operation) {
      case 'command-audit':
        recordCommandAudit(store, message.input)
        result = null
        break
      case 'execute':
        result = store.execute(message.input)
        break
      case 'checkpoint':
        result = readCaptureCheckpoint(store, message.instanceId)
        break
      case 'collect':
        commitCollectedPage(store, message.page)
        result = null
        break
      case 'pending':
        result = pendingExecutionIds(store, message.instanceId, message.limit)
        break
    }
    parentPort?.postMessage({ id: message.id, result })
  } catch {
    parentPort?.postMessage({
      id: message.id,
      error: 'Business storage is unavailable. Check disk space and your backup before retrying.'
    })
  }
})
parentPort?.on('close', () => store.close())
