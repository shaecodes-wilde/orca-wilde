import { z } from 'zod'

export const uuid = z.string().uuid()
export const instant = z.string().datetime({ offset: true })
const short = z.string().trim().max(240)
const text = z.string().max(32000)
export const safeLink = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  }, 'Use an HTTP(S) link without credentials')
const base = {
  id: uuid,
  revision: z.number().int().nonnegative(),
  createdAt: instant,
  updatedAt: instant,
  archivedAt: instant.nullable()
}
const scope = { clientId: uuid, projectId: uuid.nullable() }
export const clientSchema = z
  .object({
    ...base,
    type: z.literal('client'),
    name: short.min(1),
    status: z.enum(['prospect', 'active', 'paused', 'former']),
    kind: z.enum(['external', 'internal']),
    owner: short,
    contacts: text,
    tags: z.array(short).max(40),
    notes: text,
    links: z.array(safeLink).max(30)
  })
  .strict()
export const projectSchema = z
  .object({
    ...base,
    type: z.literal('project'),
    clientId: uuid,
    title: short.min(1),
    outcome: text,
    status: z.enum(['planned', 'active', 'blocked', 'completed', 'cancelled']),
    priority: z.enum(['low', 'normal', 'high']),
    nextAction: text,
    dueDate: z.iso.date().nullable(),
    milestones: text,
    links: z.array(safeLink).max(30)
  })
  .strict()
export const knowledgeSchema = z
  .object({
    ...base,
    ...scope,
    type: z.literal('knowledge'),
    title: short.min(1),
    body: text,
    kind: z.enum(['note', 'decision', 'procedure', 'document-reference', 'delivery', 'handoff']),
    state: z.enum(['curated', 'draft']),
    provenance: short,
    url: safeLink.nullable()
  })
  .strict()
export const taskSchema = z
  .object({
    ...base,
    ...scope,
    type: z.literal('task'),
    title: short.min(1),
    done: z.boolean(),
    dueDate: z.iso.date().nullable()
  })
  .strict()
export const targetSchema = z
  .object({
    kind: z.enum(['worktree', 'folder', 'orca-project', 'folder-project']),
    ownerId: z.string().min(1).max(240),
    hostId: z.string().min(1).max(240),
    stableId: z.string().min(1).max(1024),
    locator: z.string().max(2048),
    name: short.min(1)
  })
  .strict()
export type BusinessTarget = z.infer<typeof targetSchema>
export const assignmentSchema = z
  .object({
    ...base,
    ...scope,
    type: z.literal('assignment'),
    target: targetSchema,
    reason: short
  })
  .strict()
export const workflowSchema = z
  .object({
    ...base,
    type: z.literal('workflow'),
    instanceId: uuid,
    workflowId: short.min(1),
    title: short,
    active: z.boolean(),
    observedAt: instant,
    purpose: text,
    environment: z.enum(['production', 'test', 'unknown']),
    maintainer: short,
    ownership: z.enum(['exclusive', 'shared', 'unassigned']),
    clientId: uuid.nullable(),
    projectId: uuid.nullable()
  })
  .strict()
export const executionSchema = z
  .object({
    ...base,
    type: z.literal('execution'),
    instanceId: uuid,
    executionId: short.min(1),
    workflowId: short.min(1),
    status: short,
    mode: short,
    startedAt: instant.nullable(),
    stoppedAt: instant.nullable(),
    observedAt: instant,
    retryOf: short.nullable(),
    clientId: uuid.nullable(),
    projectId: uuid.nullable(),
    assignmentRevision: z.number().int().nullable()
  })
  .strict()
export const outcomeSchema = z
  .object({
    ...base,
    ...scope,
    type: z.literal('outcome'),
    eventType: z.enum([
      'enquiry_received',
      'appointment_booked',
      'job_scheduled',
      'report_delivered'
    ]),
    occurredAt: instant,
    receivedAt: instant,
    sourceNamespace: short.min(1),
    sourceReference: short.min(1),
    idempotencyKey: short.min(1),
    workflowId: uuid.nullable(),
    executionId: short.nullable(),
    correctsId: uuid.nullable(),
    voidsId: uuid.nullable()
  })
  .strict()
export const recordSchema = z.discriminatedUnion('type', [
  clientSchema,
  projectSchema,
  knowledgeSchema,
  taskSchema,
  assignmentSchema,
  workflowSchema,
  executionSchema,
  outcomeSchema
])
export type BusinessRecord = z.infer<typeof recordSchema>
export type Client = z.infer<typeof clientSchema>
export type DeliveryProject = z.infer<typeof projectSchema>
export type Knowledge = z.infer<typeof knowledgeSchema>
export type Task = z.infer<typeof taskSchema>
export type Assignment = z.infer<typeof assignmentSchema>
export type Workflow = z.infer<typeof workflowSchema>
export type Execution = z.infer<typeof executionSchema>
export type Outcome = z.infer<typeof outcomeSchema>
export type Activity = {
  id: string
  requestId: string
  operation: string
  entityId: string
  clientId: string | null
  at: string
}
export type BusinessSnapshot = {
  ownerId: string
  revision: number
  records: BusinessRecord[]
  activity: Activity[]
  truncated: boolean
}
export type TargetState = BusinessTarget & { available: boolean; reason?: string }
export function targetKey(target: BusinessTarget): string {
  return JSON.stringify([target.ownerId, target.hostId, target.kind, target.stableId])
}
export function newRecordFields(): Pick<
  BusinessRecord,
  'id' | 'revision' | 'createdAt' | 'updatedAt' | 'archivedAt'
> {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), revision: 0, createdAt: now, updatedAt: now, archivedAt: null }
}
