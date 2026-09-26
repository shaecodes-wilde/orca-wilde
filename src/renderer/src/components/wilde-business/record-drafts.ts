import {
  newRecordFields,
  type Client,
  type DeliveryProject,
  type Knowledge,
  type Task
} from '../../../../shared/wilde/domain'

export function clientDraft(): Client {
  return {
    ...newRecordFields(),
    type: 'client',
    name: '',
    status: 'active',
    kind: 'external',
    owner: '',
    contacts: '',
    tags: [],
    notes: '',
    links: []
  }
}

export function projectDraft(clientId: string): DeliveryProject {
  return {
    ...newRecordFields(),
    type: 'project',
    clientId,
    title: '',
    outcome: '',
    status: 'planned',
    priority: 'normal',
    nextAction: '',
    dueDate: null,
    milestones: '',
    links: []
  }
}

export function knowledgeDraft(clientId: string, projectId?: string): Knowledge {
  return {
    ...newRecordFields(),
    type: 'knowledge',
    clientId,
    projectId: projectId ?? null,
    title: '',
    body: '',
    kind: projectId ? 'delivery' : 'note',
    state: 'curated',
    provenance: 'Operator',
    url: null
  }
}

export function taskDraft(clientId: string, projectId: string | null): Task {
  return {
    ...newRecordFields(),
    type: 'task',
    clientId,
    projectId,
    title: '',
    done: false,
    dueDate: null
  }
}

export function projectNoteDraft(project: DeliveryProject): Knowledge {
  return {
    ...knowledgeDraft(project.clientId, project.id),
    state: 'draft',
    title: `Project update: ${project.title}`,
    body: [
      `Project: ${project.title}`,
      `Status: ${project.status}`,
      `Intended outcome: ${project.outcome || 'Not recorded'}`,
      `Next action: ${project.nextAction || 'Not recorded'}`,
      '',
      'Delivery update:',
      '',
      'Decision / follow-up:'
    ].join('\n'),
    provenance: 'Prepared from this delivery project; review before saving'
  }
}
