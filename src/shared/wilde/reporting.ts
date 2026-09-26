import type { Execution } from './domain'

export function reportingWindow(
  period: 'week' | '7days',
  timeZone: string,
  now = new Date()
): { from: string; to: string; timeZone: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  const parts = (date: Date) =>
    Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  let from = now.getTime() - 7 * 86400000
  if (period === 'week') {
    const local = parts(now)
    const day = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day))
    const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * 86400000
    from = monday
    for (let i = 0; i < 4; i++) {
      const candidate = parts(new Date(from))
      const wall = Date.UTC(
        Number(candidate.year),
        Number(candidate.month) - 1,
        Number(candidate.day),
        Number(candidate.hour),
        Number(candidate.minute),
        Number(candidate.second)
      )
      const delta = monday - wall
      if (!delta) {
        break
      }
      from += delta
    }
  }
  return { from: new Date(from).toISOString(), to: now.toISOString(), timeZone }
}
export function executionMetrics(
  executions: Execution[],
  window: { from: string; to: string },
  clientId?: string
) {
  const from = Date.parse(window.from)
  const to = Date.parse(window.to)
  const scoped = executions.filter((record) => !clientId || record.clientId === clientId)
  const undated = scoped.filter(
    (record) => !record.startedAt || !Number.isFinite(Date.parse(record.startedAt))
  ).length
  const inWindow = scoped.filter(
    (record) =>
      record.startedAt && Date.parse(record.startedAt) >= from && Date.parse(record.startedAt) <= to
  )
  const statusCounts: Record<string, number> = {}
  for (const record of inWindow) {
    statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1
  }
  const success = statusCounts.success ?? 0
  const failed = (statusCounts.error ?? 0) + (statusCounts.crashed ?? 0)
  const durations = inWindow
    .flatMap((record) => {
      if (
        !['success', 'error', 'crashed', 'canceled'].includes(record.status) ||
        !record.startedAt ||
        !record.stoppedAt
      ) {
        return []
      }
      const elapsed = Date.parse(record.stoppedAt) - Date.parse(record.startedAt)
      return Number.isFinite(elapsed) && elapsed >= 0 ? [elapsed] : []
    })
    .sort((a, b) => a - b)
  const n = durations.length
  return {
    recorded: inWindow.length,
    undated,
    success,
    failed,
    denominator: success + failed,
    successRate: success + failed ? success / (success + failed) : null,
    statusCounts,
    duration: {
      n,
      excluded: inWindow.length - n,
      meanMs: n ? durations.reduce((sum, value) => sum + value, 0) / n : null,
      medianMs: n ? (durations[Math.floor((n - 1) / 2)] + durations[Math.floor(n / 2)]) / 2 : null,
      p95Ms: n >= 100 ? durations[Math.ceil(n * 0.95) - 1] : null
    },
    lastSuccess:
      inWindow
        .filter((record) => record.status === 'success')
        .map((record) => record.startedAt!)
        .sort()
        .at(-1) ?? null,
    unattributed: inWindow.filter((record) => !record.clientId).length
  }
}
