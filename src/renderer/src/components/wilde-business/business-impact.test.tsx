// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BusinessResult, WildeBusinessApi } from '../../../../shared/wilde/commands'
import { BusinessDataDialogs } from './BusinessDataDialogs'

afterEach(cleanup)

describe('Business mutation impact review', () => {
  it('shows every moved project association and its previous/new scope before confirmation', () => {
    const affected = [
      'Delivery project: Intake',
      'Workspace: Intake on ssh:fixture-host',
      'Knowledge: Handoff',
      'Workflow: Booking intake'
    ].map((label) => ({
      id: crypto.randomUUID(),
      label,
      operation: 'save',
      before: `Client Harbour A / Project Intake / host ssh:fixture-${'a'.repeat(100)}`,
      after: `Client Harbour B / Project Intake / host ssh:fixture-${'b'.repeat(100)}`
    }))
    const preview: NonNullable<BusinessResult['preview']> = {
      token: crypto.randomUUID(),
      adds: 0,
      changes: affected.length,
      skips: 0,
      conflicts: 0,
      unresolved: 0,
      description:
        'Move one delivery project and three current associations. Historical execution and outcome attribution is retained.',
      affected
    }
    const api: WildeBusinessApi = {
      execute: vi.fn(),
      targets: vi.fn(),
      connection: vi.fn(),
      configureConnection: vi.fn(),
      setConnectionEnabled: vi.fn(),
      sync: vi.fn(),
      chooseImport: vi.fn(),
      saveExport: vi.fn(),
      resolveCommand: vi.fn(),
      auditCommand: vi.fn(async () => undefined)
    }
    const commit = vi.fn(async () => undefined)
    render(
      <BusinessDataDialogs
        preview={preview}
        busy={false}
        onCancel={vi.fn()}
        onCommit={commit}
        backup={false}
        onBackupChange={vi.fn()}
        api={api}
        perform={vi.fn()}
        error=""
      />
    )
    const dialog = screen.getByRole('alertdialog')
    const region = within(dialog).getByRole('region', { name: 'Affected records' })
    expect(region.tabIndex).toBe(0)
    const rows = within(region).getAllByRole('listitem')
    expect(rows).toHaveLength(affected.length)
    affected.forEach((record, index) => {
      const row = within(rows[index])
      expect(row.getByText(record.label)).toBeTruthy()
      expect(row.getByText(`save · ${record.id}`)).toBeTruthy()
      expect(row.getByText('Before')).toBeTruthy()
      expect(row.getByText(record.before)).toBeTruthy()
      expect(row.getByText('After')).toBeTruthy()
      expect(row.getByText(record.after)).toBeTruthy()
    })
    expect(commit).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm changes' }))
    expect(commit).toHaveBeenCalledExactlyOnceWith(preview.token)
  })
})
