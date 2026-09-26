import { z } from 'zod'
import type { BusinessSnapshot, BusinessTarget, TargetState } from './domain'

export const navigationInputSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    clientId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional()
  })
  .strict()
export type NavigationInput = z.infer<typeof navigationInputSchema>
export type BusinessAction =
  | { id: 'client.open' | 'project.list' | 'knowledge.search'; clientId: string; query?: string }
  | { id: 'draft.projectNote'; clientId: string; projectId: string }
  | { id: 'workspace.open'; target: BusinessTarget }
  | { id: 'executions.list'; clientId?: string; period: 'week'; failed: true }
  | { id: 'navigation.back' }
export type NavigationResult =
  | { status: 'success'; action: BusinessAction }
  | {
      status: 'needs-choice'
      message: string
      choices: { label: string; action: BusinessAction }[]
    }
  | { status: 'rejected' | 'not-found' | 'unavailable' | 'stale-context'; message: string }
const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[.!?]+$/, '')
    .trim()
export function resolveBusinessCommand(
  input: NavigationInput,
  snapshot: BusinessSnapshot,
  targets: TargetState[]
): NavigationResult {
  const parsed = navigationInputSchema.safeParse(input)
  if (!parsed.success) {
    return { status: 'rejected', message: 'Unsupported command.' }
  }
  const text = normalize(input.text)
  const clients = snapshot.records.filter(
    (record) => record.type === 'client' && !record.archivedAt
  )
  if (input.clientId && !clients.some((record) => record.id === input.clientId)) {
    return { status: 'stale-context', message: 'Owner context changed. Choose a current owner.' }
  }
  if (text === 'go back') {
    return { status: 'success', action: { id: 'navigation.back' } }
  }
  if (text === 'show failed automations this week') {
    return {
      status: 'success',
      action: { id: 'executions.list', clientId: input.clientId, period: 'week', failed: true }
    }
  }
  if (text === 'open their active projects' || text === 'open active projects') {
    if (input.clientId) {
      return { status: 'success', action: { id: 'project.list', clientId: input.clientId } }
    }
    return {
      status: 'needs-choice',
      message: 'Choose the owner whose projects you want.',
      choices: clients.map((client) => ({
        label: client.type === 'client' ? client.name : '',
        action: { id: 'project.list', clientId: client.id }
      }))
    }
  }
  if (text === 'draft a project note') {
    const projects = snapshot.records.filter(
      (record) =>
        record.type === 'project' &&
        !record.archivedAt &&
        (!input.clientId || record.clientId === input.clientId) &&
        (!input.projectId || record.id === input.projectId)
    )
    const choices = projects.flatMap((project) =>
      project.type === 'project'
        ? [
            {
              label: project.title,
              action: {
                id: 'draft.projectNote' as const,
                clientId: project.clientId,
                projectId: project.id
              }
            }
          ]
        : []
    )
    return choose(choices, 'Choose a delivery project for the draft.')
  }
  if (text.startsWith('search client knowledge')) {
    if (!input.clientId) {
      return { status: 'unavailable', message: 'Open an owner before searching their knowledge.' }
    }
    return {
      status: 'success',
      action: {
        id: 'knowledge.search',
        clientId: input.clientId,
        query: text.slice('search client knowledge'.length).trim()
      }
    }
  }
  const workspaceName = /^(?:switch to|focus) (?:the )?(.+?)(?: workspace| terminal)$/.exec(
    text
  )?.[1]
  if (workspaceName) {
    const matches = targets.filter(
      (target) =>
        ['worktree', 'folder'].includes(target.kind) && normalize(target.name) === workspaceName
    )
    if (matches.length === 1 && !matches[0].available) {
      return {
        status: 'unavailable',
        message: matches[0].reason ?? 'Owning host unavailable; reconnect before opening.'
      }
    }
    return choose(
      matches
        .filter((target) => target.available)
        .map((target) => ({
          label: `${target.name} · ${target.hostId}`,
          action: { id: 'workspace.open' as const, target }
        })),
      'Choose the exact workspace and host.'
    )
  }
  const name = /^open (.+)$/.exec(text)?.[1]
  if (name) {
    return choose(
      clients.flatMap((client) =>
        client.type === 'client' && normalize(client.name) === name
          ? [{ label: client.name, action: { id: 'client.open' as const, clientId: client.id } }]
          : []
      ),
      'More than one owner has that name. Choose one.'
    )
  }
  return {
    status: 'rejected',
    message:
      'Supported commands open owners, projects, workspaces, knowledge, failures, or a note draft. Shell commands and changes require their own reviewed controls.'
  }
}
function choose(
  choices: { label: string; action: BusinessAction }[],
  message: string
): NavigationResult {
  if (!choices.length) {
    return {
      status: 'not-found',
      message: 'No matching active target. Refresh or choose another name.'
    }
  }
  return choices.length === 1
    ? { status: 'success', action: choices[0].action }
    : { status: 'needs-choice', message, choices }
}
