import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { ConnectionState, WildeBusinessApi } from '../../../../shared/wilde/commands'
import { Choice, TextField } from './business-fields'
export function ConnectionEditor({
  api,
  label,
  onClose,
  onSaved
}: {
  api: WildeBusinessApi
  label: string
  onClose: () => void
  onSaved: (state: ConnectionState) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError('')
    try {
      const result = await api.configureConnection({
        label: String(data.get('label') ?? ''),
        baseUrl: String(data.get('baseUrl') ?? ''),
        apiKey: String(data.get('apiKey') ?? ''),
        enabled: data.get('enabled') === 'enabled'
      })
      form.reset()
      onSaved(result)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the connection.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>n8n connection</DialogTitle>
          <DialogDescription>
            Credentials stay in protected desktop storage. Enabling collection authorizes
            allowlisted reads while this runtime is running.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <TextField label="Connection label" name="label" value={label} required />
            <TextField label="Instance URL" name="baseUrl" type="url" required />
            <TextField label="API key" name="apiKey" type="password" required />
            <Choice
              label="Collection"
              name="enabled"
              value="enabled"
              options={[
                { value: 'enabled', label: 'Enabled: read inventory and executions' },
                { value: 'disabled', label: 'Disabled: store connection only' }
              ]}
            />
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save connection
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
