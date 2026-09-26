export type WorkflowMetadata = {
  workflowId: string
  title: string
  active: boolean
  observedAt: string
}
export type ExecutionMetadata = {
  executionId: string
  workflowId: string
  status: string
  mode: string
  startedAt: string | null
  stoppedAt: string | null
  retryOf: string | null
  observedAt: string
}
export type N8nConnection = {
  instanceId: string
  label: string
  baseUrl: string
  apiKey: string
  enabled: boolean
}
export type CaptureCheckpoint = {
  generation: string
  resource: 'workflows' | 'executions'
  cursor: string | null
  startedAt: string
  lastSuccess: string | null
  oldestObserved: string | null
  incomplete: boolean
  message: string
}
export type CollectorPage = {
  instanceId: string
  workflows?: WorkflowMetadata[]
  executions?: ExecutionMetadata[]
  checkpoint: CaptureCheckpoint
}
export type CollectorStore = {
  readCheckpoint(instanceId: string): Promise<CaptureCheckpoint | null>
  commitPage(page: CollectorPage): Promise<void>
  pendingExecutions(instanceId: string, limit: number): Promise<string[]>
}
