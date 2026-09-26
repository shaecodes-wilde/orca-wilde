// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BusinessResult, WildeBusinessApi } from '../../../../shared/wilde/commands'
import type { BusinessRecord, BusinessSnapshot, TargetState } from '../../../../shared/wilde/domain'
import BusinessPage from './BusinessPage'
import { clientDraft, projectDraft, knowledgeDraft } from './record-drafts'
import { BusinessReports } from './BusinessReports'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture(records: BusinessRecord[] = [], targets: TargetState[] = []) {
  let snapshot: BusinessSnapshot = {
    ownerId: 'fixture-runtime',
    revision: 1,
    records,
    activity: [],
    truncated: false
  }
  const api: WildeBusinessApi = {
    execute: vi.fn<WildeBusinessApi['execute']>(async (request) => {
      if (request.command.operation === 'save') {
        const saved = request.command.record
        snapshot = {
          ...snapshot,
          revision: snapshot.revision + 1,
          records: [
            ...snapshot.records.filter((record) => record.id !== saved.id),
            { ...request.command.record, revision: request.command.record.revision + 1 }
          ]
        }
      }
      return {
        status: 'success',
        message: request.command.operation === 'save' ? 'Saved locally.' : '',
        snapshot
      }
    }),
    targets: vi.fn(async () => targets),
    connection: vi.fn<WildeBusinessApi['connection']>(async () => ({
      configured: false,
      enabled: false,
      label: 'n8n',
      lastSync: null,
      status: 'disabled',
      message: 'Not configured',
      instanceId: null
    })),
    configureConnection: vi.fn(),
    sync: vi.fn(),
    setConnectionEnabled: vi.fn(),
    chooseImport: vi.fn(),
    saveExport: vi.fn(),
    resolveCommand: vi.fn(),
    auditCommand: vi.fn(async () => undefined)
  }
  Object.defineProperty(window, 'api', { configurable: true, value: { wildeBusiness: api } })
  return { api, snapshot }
}

describe('Business desktop journeys (renderer with fixture bridge)', () => {
  it('creates a client through the form and reopens the returned saved record', async () => {
    const { api } = fixture()
    render(<BusinessPage initialPage="clients" />)
    await waitFor(() => expect(screen.queryByText('Loading local business records…')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'New owner' }))
    fireEvent.change(screen.getByLabelText('Owner name'), {
      target: { value: 'Harbour Electrical' }
    })
    fireEvent.change(screen.getByLabelText('Account manager'), {
      target: { value: 'Fixture operator' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save owner' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Harbour Electrical' }))
    expect(screen.getByRole('heading', { name: 'Harbour Electrical' })).toBeTruthy()
    expect(screen.getByText('Account manager: Fixture operator')).toBeTruthy()
    expect(api.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          operation: 'save',
          record: expect.objectContaining({ name: 'Harbour Electrical', owner: 'Fixture operator' })
        })
      })
    )
  })

  it('isolates knowledge and unsaved forms when a different client is selected', async () => {
    const first = { ...clientDraft(), name: 'Harbour A' }
    const second = { ...clientDraft(), name: 'Harbour B' }
    const note = { ...knowledgeDraft(first.id), title: 'Private A decision', body: 'Client A only' }
    fixture([first, second, note])
    const rendered = render(
      <BusinessPage
        initialPage="clients"
        initialClientId={first.id}
        action={{ id: 'knowledge.search', clientId: first.id, query: 'Private' }}
      />
    )
    await screen.findByText('Private A decision')
    fireEvent.click(screen.getByRole('button', { name: 'New knowledge note' }))
    fireEvent.change(screen.getByLabelText('Note content'), {
      target: { value: 'Unsaved A draft' }
    })
    rendered.rerender(<BusinessPage initialPage="clients" initialClientId={second.id} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('Private A decision')).toBeNull()
    expect(screen.queryByText('Unsaved A draft')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Harbour B' })).toBeTruthy()
  })

  it('opens a prepared project note without writing until Save is explicitly clicked', async () => {
    const client = { ...clientDraft(), name: 'Workshop' }
    const project = {
      ...projectDraft(client.id),
      title: 'Booking intake',
      outcome: 'Fewer missed enquiries'
    }
    const { api } = fixture([client, project])
    render(
      <BusinessPage
        action={{ id: 'draft.projectNote', clientId: client.id, projectId: project.id }}
      />
    )
    const title = await screen.findByLabelText('Note title')
    expect(title.getAttribute('value')).toBe('Project update: Booking intake')
    expect(screen.getByLabelText('Note content').textContent).toContain('Fewer missed enquiries')
    expect(api.execute).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          operation: 'save',
          record: expect.objectContaining({ state: 'draft', projectId: project.id })
        })
      })
    )
  })

  it('reviews archive impact and requires a separate confirmation before commit', async () => {
    const client = { ...clientDraft(), name: 'Archive fixture' }
    const { api, snapshot } = fixture([client])
    const token = crypto.randomUUID()
    vi.mocked(api.execute).mockImplementation(async (request) =>
      request.command.operation === 'preview'
        ? {
            status: 'needs-confirmation',
            message: 'Review archive.',
            preview: {
              token,
              adds: 0,
              changes: 1,
              skips: 0,
              conflicts: 0,
              unresolved: 0,
              description: 'Archive one client. Delivery history remains available.'
            }
          }
        : { status: 'success', message: '', snapshot }
    )
    render(<BusinessPage initialPage="clients" initialClientId={client.id} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive owner' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Archive one client. Delivery history remains available.')
    ).toBeTruthy()
    expect(api.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ operation: 'commit' }) })
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm changes' }))
    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith(
        expect.objectContaining({ command: { operation: 'commit', token } })
      )
    )
  })

  it('discards a delayed impact preview after navigating to another client', async () => {
    const first = { ...clientDraft(), name: 'First client' }
    const second = { ...clientDraft(), name: 'Second client' }
    const { api, snapshot } = fixture([first, second])
    const pending = deferred<BusinessResult>()
    vi.mocked(api.execute).mockImplementation(async (request) =>
      request.command.operation === 'preview'
        ? pending.promise
        : { status: 'success', message: '', snapshot }
    )
    const rendered = render(<BusinessPage initialPage="clients" initialClientId={first.id} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive owner' }))
    rendered.rerender(<BusinessPage initialPage="clients" initialClientId={second.id} />)
    await act(async () =>
      pending.resolve({
        status: 'needs-confirmation',
        message: 'First client archive',
        preview: {
          token: crypto.randomUUID(),
          adds: 0,
          changes: 1,
          skips: 0,
          conflicts: 0,
          unresolved: 0,
          description: 'Old scope archive'
        }
      })
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByText('First client archive')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Second client' })).toBeTruthy()
  })

  it('shows missing assigned targets as unavailable and never opens them', async () => {
    const client = { ...clientDraft(), name: 'Remote fixture' }
    const assignment: BusinessRecord = {
      ...knowledgeDraft(client.id),
      type: 'assignment',
      target: {
        ownerId: 'remote-runtime',
        hostId: 'ssh:fixture',
        kind: 'folder',
        stableId: crypto.randomUUID(),
        name: 'Workshop',
        locator: '/fixture/workshop'
      },
      reason: ''
    }
    fixture([client, assignment])
    const onOpen = vi.fn()
    render(<BusinessPage initialPage="clients" initialClientId={client.id} onOpenTarget={onOpen} />)
    const workspaceTab = await screen.findByRole('tab', { name: 'Workspaces' })
    fireEvent.mouseDown(workspaceTab, { button: 0, ctrlKey: false })
    await screen.findByText('Unavailable')
    const open = screen.getByRole('button', { name: 'Open' })
    expect(open.hasAttribute('disabled')).toBe(true)
    fireEvent.click(open)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('keeps a report preview restricted to the selected client', async () => {
    const first = { ...clientDraft(), name: 'Report A' }
    const second = { ...clientDraft(), name: 'Report B' }
    fixture([first, second])
    render(<BusinessReports records={[first, second]} clientId={first.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prepare report' }))
    const report = screen.getByRole('textbox', { name: 'Prepared report' })
    expect(report.textContent).toContain('Report A')
    expect(report.textContent).not.toContain('Report B')
    expect(report.textContent).toContain('Coverage is incomplete')
    expect(screen.getByText('0 successes / 0 successful or failed attempts')).toBeTruthy()
  })
})
