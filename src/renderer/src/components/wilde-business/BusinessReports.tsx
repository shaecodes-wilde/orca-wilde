import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { BusinessRecord, Execution, Outcome } from '../../../../shared/wilde/domain'
import { executionMetrics, reportingWindow } from '../../../../shared/wilde/reporting'
import { Choice, EmptyState } from './business-fields'

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const zones = [
  ...new Set([
    localZone,
    'UTC',
    'America/Halifax',
    'America/Toronto',
    'America/New_York',
    'America/Vancouver',
    'Europe/London',
    'Europe/Paris',
    'Australia/Sydney'
  ])
]
function initialTimezone(): string {
  try {
    const saved = localStorage.getItem('wilde-report-timezone')
    return saved && zones.includes(saved) ? saved : localZone
  } catch {
    return localZone
  }
}

export function BusinessReports({
  records,
  clientId,
  projectId,
  lastSync
}: {
  records: BusinessRecord[]
  clientId?: string
  projectId?: string
  lastSync?: string | null
}): React.JSX.Element {
  const [period, setPeriod] = useState<'week' | '7days'>('7days')
  const [timezone, setTimezone] = useState(initialTimezone)
  const [preview, setPreview] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const window = reportingWindow(period, timezone)
  const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { timeZone: timezone }) : 'Not recorded'
  const executions = records.filter(
    (record): record is Execution =>
      record.type === 'execution' &&
      (!clientId || record.clientId === clientId) &&
      (!projectId || record.projectId === projectId)
  )
  const metrics = executionMetrics(executions, window, clientId)
  const evidence = records.filter(
    (record): record is Outcome =>
      record.type === 'outcome' && (!clientId || record.clientId === clientId)
  )
  const superseded = new Set(
    evidence.flatMap((outcome) => [outcome.correctsId, outcome.voidsId].filter(Boolean))
  )
  const outcomes = evidence.filter(
    (outcome) =>
      !superseded.has(outcome.id) &&
      !outcome.archivedAt &&
      (!projectId || outcome.projectId === projectId) &&
      !outcome.voidsId &&
      Date.parse(outcome.occurredAt) >= Date.parse(window.from) &&
      Date.parse(outcome.occurredAt) <= Date.parse(window.to)
  )
  const last = executions
    .map((execution) => execution.observedAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1)
  const oldest = executions
    .flatMap((execution) => (execution.startedAt ? [execution.startedAt] : []))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0]
  const failed = executions.filter(
    (execution) =>
      ['error', 'crashed'].includes(execution.status) &&
      execution.startedAt &&
      Date.parse(execution.startedAt) >= Date.parse(window.from) &&
      Date.parse(execution.startedAt) <= Date.parse(window.to)
  )
  const failureDays = new Map<string, number>()
  for (const execution of failed) {
    if (!execution.startedAt) {
      continue
    }
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(execution.startedAt))
    failureDays.set(day, (failureDays.get(day) ?? 0) + 1)
  }
  const scope = records.find((record) => record.id === (projectId ?? clientId))
  const scopeName = scope
    ? 'name' in scope
      ? scope.name
      : 'title' in scope
        ? scope.title
        : 'Selected scope'
    : 'All owners and unattributed observations'
  const summary = [
    `${scopeName} — observed activity`,
    `Window: ${formatTime(window.from)} to ${formatTime(window.to)} (${timezone})`,
    `Executions: ${metrics.recorded}; undated: ${metrics.undated}`,
    `Successes: ${metrics.success}/${metrics.denominator}; failures: ${metrics.failed}/${metrics.denominator}`,
    `Unattributed execution observations: ${metrics.unattributed}`,
    `Last success: ${formatTime(metrics.lastSuccess)}`,
    `Elapsed duration samples: ${metrics.duration.n}; excluded: ${metrics.duration.excluded}`,
    `Business outcomes: ${outcomes.length} imported events, independent of execution success`,
    ...outcomes.map(
      (outcome) =>
        `${outcome.eventType}: ${outcome.sourceNamespace}/${outcome.sourceReference} at ${formatTime(outcome.occurredAt)}`
    ),
    `Last observation: ${formatTime(last ?? null)}; last successful sync: ${formatTime(lastSync ?? null)}`,
    'Coverage is incomplete: source retention, unsaved runs and runtime downtime can leave unknown activity. Imported outcomes are assertions from their named sources.'
  ].join('\n')
  return (
    <section aria-label="Observed reports" className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-balance">Observed execution evidence</h3>
        <p className="text-sm text-pretty text-muted-foreground">{scopeName}</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Choice
          label="Report period"
          value={period}
          onChange={(value) => setPeriod(value === 'week' ? 'week' : '7days')}
          options={[
            { value: '7days', label: 'Last 7 days' },
            { value: 'week', label: 'This week, from Monday' }
          ]}
        />
        <Choice
          label="Reporting timezone"
          value={timezone}
          onChange={(value) => {
            setTimezone(value)
            try {
              localStorage.setItem('wilde-report-timezone', value)
            } catch {
              /* Optional display preference. */
            }
          }}
          options={zones.map((zone) => ({ value: zone, label: zone }))}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCopyStatus('')
            setPreview(true)
          }}
        >
          Prepare report
        </Button>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {formatTime(window.from)} – {formatTime(window.to)} ({timezone})
      </p>
      <dl className="grid grid-cols-2 gap-5 border-y border-border py-5 sm:grid-cols-4">
        <Metric
          label="Recorded executions"
          value={String(metrics.recorded)}
          detail={`${metrics.undated} undated observations outside this window count; retries count separately`}
        />
        <Metric
          label="Terminal success rate"
          value={metrics.successRate === null ? '—' : `${(metrics.successRate * 100).toFixed(1)}%`}
          detail={`${metrics.success} successes / ${metrics.denominator} successful or failed attempts`}
        />
        <Metric
          label="Terminal failure rate"
          value={
            metrics.denominator
              ? `${((metrics.failed / metrics.denominator) * 100).toFixed(1)}%`
              : '—'
          }
          detail={`${metrics.failed} errors or crashes / ${metrics.denominator} successful or failed attempts`}
        />
        <Metric
          label="Median elapsed duration"
          value={milliseconds(metrics.duration.medianMs)}
          detail={`${metrics.duration.n} eligible samples; ${metrics.duration.excluded} excluded; may include waiting`}
        />
      </dl>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Mean elapsed duration: {milliseconds(metrics.duration.meanMs)} ·{' '}
          {metrics.duration.p95Ms === null
            ? 'p95 requires at least 100 eligible samples'
            : `p95: ${milliseconds(metrics.duration.p95Ms)}`}
        </p>
        <p>
          Observed statuses:{' '}
          {Object.entries(metrics.statusCounts)
            .map(([status, count]) => `${status}: ${count}`)
            .join(' · ') || 'No dated observations in this window'}
        </p>
        <p>
          Last recorded success:{' '}
          {metrics.lastSuccess ? formatTime(metrics.lastSuccess) : 'No recorded success'}
        </p>
        <p>
          Oldest retained run: {formatTime(oldest ?? null)} · Last observation:{' '}
          {formatTime(last ?? null)}
        </p>
        <p>
          Last successful collection: {formatTime(lastSync ?? null)} · Unattributed in this window:{' '}
          {metrics.unattributed}
        </p>
      </div>
      <p className="text-sm text-pretty text-muted-foreground">
        Coverage is incomplete unless verified against source retention and collection history.
        Collection runs while this desktop runtime is open. Unsaved, pruned and disconnected periods
        are unknown. Shared or unassigned workflows are excluded from client execution counts.
        Historical attribution is preserved.
      </p>
      {failureDays.size > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Failure attempts by day ({timezone})</h4>
          <ul>
            {[...failureDays]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, count]) => (
                <li key={day} className="text-sm tabular-nums">
                  {day}: {count}
                </li>
              ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-balance">Business outcomes</h3>
        <p className="text-sm text-pretty text-muted-foreground">
          {outcomes.length} imported events in this period. Execution success does not prove a
          business outcome. Superseded and voided events are excluded from counts.
        </p>
      </div>
      {!outcomes.length ? (
        <EmptyState>
          No effective business outcomes have been imported for this scope and period.
        </EmptyState>
      ) : (
        <div className="divide-y divide-border">
          {outcomes.map((outcome) => (
            <div key={outcome.id} className="py-3 text-sm">
              <p>
                {outcome.eventType.replaceAll('_', ' ')} · {formatTime(outcome.occurredAt)}
              </p>
              <p className="text-xs text-muted-foreground break-all">
                Imported evidence: {outcome.sourceNamespace} / {outcome.sourceReference}
                {outcome.correctsId ? ' · Correction' : ''}
              </p>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <Dialog open onOpenChange={setPreview}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review prepared report</DialogTitle>
              <DialogDescription>
                This contains only the selected scope. Copying is an explicit action; no report is
                sent automatically.
              </DialogDescription>
            </DialogHeader>
            <Textarea aria-label="Prepared report" value={summary} readOnly rows={14} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(summary).then(
                    () => setCopyStatus('Copied to clipboard.'),
                    () => setCopyStatus('Copy failed. Select and copy the preview text.')
                  )
                }}
              >
                Copy report
              </Button>
            </div>
            {copyStatus && (
              <p role="status" className="text-sm text-muted-foreground">
                {copyStatus}
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}

function milliseconds(value: number | null): string {
  return value === null ? '—' : `${(value / 1000).toFixed(1)} s`
}
function Metric({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-pretty text-muted-foreground">{detail}</dd>
    </div>
  )
}
