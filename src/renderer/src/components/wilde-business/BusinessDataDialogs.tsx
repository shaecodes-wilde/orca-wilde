import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { BusinessResult, WildeBusinessApi } from '../../../../shared/wilde/commands'

export function BusinessDataDialogs({
  preview,
  busy,
  onCancel,
  onCommit,
  backup,
  onBackupChange,
  api,
  perform,
  error
}: {
  preview: BusinessResult['preview']
  busy: boolean
  onCancel: () => void
  onCommit: (token: string) => Promise<void>
  backup: boolean
  onBackupChange: (open: boolean) => void
  api: WildeBusinessApi
  perform: (action: () => Promise<BusinessResult>) => Promise<boolean>
  error: string
}): React.JSX.Element {
  return (
    <>
      {preview && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) {
              onCancel()
            }
          }}
        >
          <DialogContent role="alertdialog">
            <div className="max-h-[80dvh] space-y-4 overflow-y-auto scrollbar-sleek">
              <DialogHeader>
                <DialogTitle>Review business data changes</DialogTitle>
                <DialogDescription>{preview.description}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm tabular-nums">
                <div>
                  <dt>Added</dt>
                  <dd>{preview.adds}</dd>
                </div>
                <div>
                  <dt>Changed</dt>
                  <dd>{preview.changes}</dd>
                </div>
                <div>
                  <dt>Skipped</dt>
                  <dd>{preview.skips}</dd>
                </div>
                <div>
                  <dt>Conflicts</dt>
                  <dd>{preview.conflicts}</dd>
                </div>
                <div>
                  <dt>Unresolved targets</dt>
                  <dd>{preview.unresolved}</dd>
                </div>
              </dl>
              {preview.affected && preview.affected.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-balance">Exact affected records</h3>
                  <div
                    role="region"
                    aria-label="Affected records"
                    tabIndex={0}
                    className="max-h-64 overflow-y-auto scrollbar-sleek"
                  >
                    <ol className="divide-y divide-border">
                      {preview.affected.map((record) => (
                        <li key={`${record.operation}:${record.id}`} className="space-y-2 py-3">
                          <p className="text-sm font-medium break-words">{record.label}</p>
                          <p className="text-xs text-muted-foreground break-all">
                            {record.operation} · {record.id}
                          </p>
                          <dl className="space-y-2 text-sm">
                            <div>
                              <dt className="font-medium">Before</dt>
                              <dd className="whitespace-pre-wrap break-all text-muted-foreground">
                                {record.before || 'No existing record'}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium">After</dt>
                              <dd className="whitespace-pre-wrap break-all">
                                {record.after || 'No remaining record'}
                              </dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ol>
                  </div>
                </section>
              )}
              <p className="text-sm text-pretty text-muted-foreground">
                Only this reviewed change set will be applied. Workspace and terminal files are
                unaffected. Export a backup before replacing or deleting business data.
              </p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" disabled={busy} onClick={() => onCancel()}>
                  Cancel
                </Button>
                <Button
                  disabled={busy || preview.conflicts > 0}
                  onClick={() => {
                    const token = preview?.token
                    if (token) {
                      void onCommit(token)
                    }
                  }}
                >
                  Confirm changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {backup && (
        <Dialog open onOpenChange={onBackupChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Backup and import</DialogTitle>
              <DialogDescription>
                Business records belong to this local profile. Backups include client notes and
                execution summaries; keep the file private. Connector credentials are excluded.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void perform(() => api.saveExport())
                }}
              >
                Export business backup
              </Button>
              <p className="text-sm text-pretty text-muted-foreground">
                Choose a file to review its impact before applying. Replace affects this business
                store, including records absent from the backup; it does not restore Orca terminal
                sessions.
              </p>
              <div className="flex flex-wrap gap-2">
                {(['merge', 'replace', 'outcomes'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      onBackupChange(false)
                      void perform(() => api.chooseImport(mode))
                    }}
                  >
                    {mode === 'merge'
                      ? 'Merge backup'
                      : mode === 'replace'
                        ? 'Replace from backup'
                        : 'Import outcomes'}
                  </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
