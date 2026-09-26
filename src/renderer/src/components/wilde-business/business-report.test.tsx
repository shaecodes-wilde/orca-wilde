// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Outcome } from '../../../../shared/wilde/domain'
import { newRecordFields } from '../../../../shared/wilde/domain'
import { BusinessReports } from './BusinessReports'
import { ScopedContext } from './ScopedContext'
import { clientDraft, knowledgeDraft, projectDraft } from './record-drafts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
const outcome = (clientId: string, projectId: string | null): Outcome => ({
  ...newRecordFields(),
  type: 'outcome',
  clientId,
  projectId,
  eventType: 'enquiry_received',
  occurredAt: new Date(Date.now() - 3600000).toISOString(),
  receivedAt: new Date().toISOString(),
  sourceNamespace: 'fixture',
  sourceReference: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
  workflowId: null,
  executionId: null,
  correctsId: null,
  voidsId: null
})

describe('Scoped report and context evidence', () => {
  it('includes an in-period offset timestamp whose text sorts before the period', () => {
    const client = { ...clientDraft(), name: 'Offset client' }
    const event = outcome(client.id, null)
    event.occurredAt = `${new Date(Date.now() - 7 * 86400000 + 3600000 - 12 * 3600000).toISOString().slice(0, -1)}-12:00`
    render(<BusinessReports records={[client, event]} clientId={client.id} />)
    expect(screen.getByText(/1 imported events in this period/)).toBeTruthy()
    expect(screen.getByText(`Imported evidence: fixture / ${event.sourceReference}`)).toBeTruthy()
  })

  it('removes a superseded event from its original project when correction moves it', () => {
    const client = { ...clientDraft(), name: 'Corrections client' }
    const first = { ...projectDraft(client.id), title: 'Original project' }
    const second = { ...projectDraft(client.id), title: 'Correct project' }
    const original = outcome(client.id, first.id)
    const correction = { ...outcome(client.id, second.id), correctsId: original.id }
    const records = [client, first, second, original, correction]
    const view = render(
      <BusinessReports records={records} clientId={client.id} projectId={first.id} />
    )
    expect(screen.getByText(/0 imported events in this period/)).toBeTruthy()
    view.rerender(<BusinessReports records={records} clientId={client.id} projectId={second.id} />)
    expect(screen.getByText(/1 imported events in this period/)).toBeTruthy()
    expect(
      screen.queryByText(`Imported evidence: fixture / ${original.sourceReference}`)
    ).toBeNull()
  })

  it('requires reference selection and explicit copy, excludes another client and drafts', async () => {
    const client = { ...clientDraft(), name: 'Context A' }
    const other = { ...clientDraft(), name: 'Context B' }
    const note = {
      ...knowledgeDraft(client.id),
      title: 'Selected decision',
      body: 'Approved fixture procedure'
    }
    const privateNote = {
      ...knowledgeDraft(other.id),
      title: 'Other client secret',
      body: 'Do not include'
    }
    const draft = {
      ...knowledgeDraft(client.id),
      title: 'Unreviewed draft',
      state: 'draft' as const
    }
    const copy = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: copy }
    })
    render(<ScopedContext client={client} projects={[]} notes={[note, privateNote, draft]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prepare context' }))
    expect(screen.queryByText('Other client secret')).toBeNull()
    expect(screen.queryByText('Unreviewed draft')).toBeNull()
    expect(
      screen.getByRole('textbox', { name: 'Prepared client context' }).textContent
    ).not.toContain('Approved fixture procedure')
    fireEvent.click(screen.getByRole('checkbox', { name: /Selected decision/ }))
    expect(screen.getByRole('textbox', { name: 'Prepared client context' }).textContent).toContain(
      'Approved fixture procedure'
    )
    expect(copy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Copy selected context' }))
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('Approved fixture procedure'))
  })
})
