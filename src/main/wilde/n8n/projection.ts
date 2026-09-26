import { z } from 'zod'
import type { ExecutionMetadata, WorkflowMetadata } from './connector-types'

const identifier = z
  .union([z.string().min(1).max(240), z.number().int().nonnegative()])
  .transform(String)
const timestamp = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value ?? null)
const workflow = z.object({
  id: identifier,
  name: z.string().max(240).default(''),
  active: z.boolean()
})
const execution = z.object({
  id: identifier,
  workflowId: identifier,
  status: z.string().max(240).default('unknown'),
  mode: z.string().max(240).default('unknown'),
  startedAt: timestamp,
  stoppedAt: timestamp,
  retryOf: identifier.nullish().transform((value) => value ?? null)
})
export function projectWorkflow(input: unknown, observedAt: string): WorkflowMetadata {
  const value = workflow.parse(input)
  return { workflowId: value.id, title: value.name, active: value.active, observedAt }
}
export function projectExecution(input: unknown, observedAt: string): ExecutionMetadata {
  const value = execution.parse(input)
  return {
    executionId: value.id,
    workflowId: value.workflowId,
    status: value.status,
    mode: value.mode,
    startedAt: value.startedAt,
    stoppedAt: value.stoppedAt,
    retryOf: value.retryOf,
    observedAt
  }
}
export const pageSchema = z.object({
  data: z.array(z.unknown()).max(250),
  nextCursor: z.string().max(4096).nullish()
})
