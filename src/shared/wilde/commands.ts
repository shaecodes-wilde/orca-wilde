import { z } from 'zod'
import {
  recordSchema,
  uuid,
  type BusinessSnapshot,
  type TargetState,
  type BusinessTarget
} from './domain'
import type { NavigationInput, NavigationResult } from './navigation-commands'

export const commandAuditSchema = z
  .object({
    requestId: uuid,
    action: z.enum([
      'client.open',
      'project.list',
      'workspace.open',
      'executions.list',
      'navigation.back',
      'draft.projectNote',
      'knowledge.search',
      'unresolved'
    ]),
    status: z.enum([
      'success',
      'rejected',
      'not-found',
      'needs-choice',
      'stale-context',
      'unavailable',
      'failed',
      'cancelled'
    ]),
    clientId: uuid.nullable()
  })
  .strict()
export type CommandAudit = z.infer<typeof commandAuditSchema>

export const mutationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('save'), record: recordSchema }).strict(),
  z
    .object({
      operation: z.literal('archive'),
      id: uuid,
      revision: z.number().int(),
      archived: z.boolean()
    })
    .strict(),
  z.object({ operation: z.literal('delete'), id: uuid, revision: z.number().int() }).strict()
])
export type BusinessMutation = z.infer<typeof mutationSchema>
export const requestSchema = z.discriminatedUnion('operation', [
  ...mutationSchema.options,
  z.object({ operation: z.literal('snapshot'), clientId: uuid.optional() }).strict(),
  z
    .object({
      operation: z.literal('preview'),
      mutations: z.array(mutationSchema).min(1).max(1000)
    })
    .strict(),
  z.object({ operation: z.literal('commit'), token: uuid }).strict(),
  z.object({ operation: z.literal('export') }).strict(),
  z
    .object({
      operation: z.literal('import-preview'),
      content: z.string().max(10 * 1024 * 1024),
      mode: z.enum(['merge', 'replace', 'outcomes'])
    })
    .strict()
])
export const commandSchema = z.object({ requestId: uuid, command: requestSchema }).strict()
export type BusinessRequest = z.infer<typeof commandSchema>
export type BusinessResult = {
  status: 'success' | 'needs-confirmation' | 'rejected' | 'failed' | 'stale-context' | 'cancelled'
  message: string
  snapshot?: BusinessSnapshot
  preview?: {
    token: string
    adds: number
    changes: number
    skips: number
    conflicts: number
    unresolved: number
    description: string
    affected?: { id: string; label: string; operation: string; before: string; after: string }[]
    targets?: BusinessTarget[]
  }
  exported?: string
}
export type ConnectionState = {
  configured: boolean
  enabled: boolean
  label: string
  lastSync: string | null
  status: 'disabled' | 'idle' | 'syncing' | 'error'
  message: string
  instanceId: string | null
}
export type WildeBusinessApi = {
  auditCommand: (input: CommandAudit) => Promise<void>
  resolveCommand: (input: NavigationInput) => Promise<NavigationResult>
  execute: (request: BusinessRequest) => Promise<BusinessResult>
  targets: () => Promise<TargetState[]>
  connection: () => Promise<ConnectionState>
  configureConnection: (input: {
    label: string
    baseUrl: string
    apiKey: string
    enabled: boolean
  }) => Promise<ConnectionState>
  sync: () => Promise<ConnectionState>
  setConnectionEnabled: (enabled: boolean) => Promise<ConnectionState>
  chooseImport: (mode: 'merge' | 'replace' | 'outcomes') => Promise<BusinessResult>
  saveExport: () => Promise<BusinessResult>
}
