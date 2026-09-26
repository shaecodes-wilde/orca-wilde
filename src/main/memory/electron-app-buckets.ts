import { getAppEnvironment, type AppEnvironment } from '../../shared/app-environment'
import type {
  AppMemory,
  BrowserGuestPageMemory,
  UsageValues
} from '../../shared/process-stats-types'
import type { ProcIndex } from './collector'
import { clampMemoryMetric, optionalCommitField } from './memory-snapshot-values'

/** OS pid → browser page that owns it. Injected so memory/ never imports browser/. */
export type BrowserGuestPidMap = Map<number, { pageId: string; worktreeId: string | null }>

// ─── Electron app process bucketing ─────────────────────────────────

type AppBucketsRaw = Omit<AppMemory, 'history'>

function electronMetricMemoryBytes(
  proc: ReturnType<AppEnvironment['getAppMetrics']>[number],
  processIndex: ProcIndex
): number {
  const hostMemory = processIndex.byPid.get(proc.pid)?.memory
  if (typeof hostMemory === 'number' && Number.isFinite(hostMemory) && hostMemory > 0) {
    return hostMemory
  }
  // Why: on macOS, getAppEnvironment().getAppMetrics().workingSetSize can include large shared
  // Chromium/Electron mappings. Prefer the host RSS sweep used elsewhere, but
  // keep workingSetSize as a fallback when the process disappears mid-snapshot.
  return clampMemoryMetric(proc.memory?.workingSetSize) * 1024
}

export function bucketElectronMetrics(
  processIndex: ProcIndex,
  guestPids?: BrowserGuestPidMap
): AppBucketsRaw {
  const main = { cpu: 0, memory: 0, privateMemory: 0 }
  const renderer = { cpu: 0, memory: 0, privateMemory: 0 }
  const other = { cpu: 0, memory: 0, privateMemory: 0 }
  const guests = { cpu: 0, memory: 0, privateMemory: 0 }
  const pages: BrowserGuestPageMemory[] = []

  for (const proc of getAppEnvironment().getAppMetrics()) {
    const cpu = clampMemoryMetric(proc.cpu?.percentCPUUsage)
    const memoryBytes = electronMetricMemoryBytes(proc, processIndex)
    // Why the host row rather than Electron's own metric: getAppMetrics has no
    // commit figure for helper processes, and the sweep already indexed them.
    const privateBytes = clampMemoryMetric(processIndex.byPid.get(proc.pid)?.privateMemory)

    // Why: lowercase once so future Electron versions emitting different
    // casing ('browser' vs 'Browser') still bucket correctly.
    const type = (typeof proc.type === 'string' ? proc.type : '').toLowerCase()
    const guest = type === 'tab' ? guestPids?.get(proc.pid) : undefined
    let target = other
    if (type === 'browser') {
      target = main
    } else if (guest) {
      target = guests
      pages.push({ ...guest, cpu, memory: memoryBytes })
    } else if (type === 'renderer' || type === 'tab') {
      target = renderer
    }

    target.cpu += cpu
    target.memory += memoryBytes
    target.privateMemory += privateBytes
  }

  const usage = (bucket: typeof main): UsageValues => ({
    cpu: bucket.cpu,
    memory: bucket.memory,
    ...optionalCommitField(processIndex.hasPrivateMemory, bucket.privateMemory)
  })

  return {
    main: usage(main),
    renderer: usage(renderer),
    other: usage(other),
    ...(guestPids ? { browserGuests: { ...usage(guests), pages } } : {}),
    ...usage({
      cpu: main.cpu + renderer.cpu + other.cpu + guests.cpu,
      memory: main.memory + renderer.memory + other.memory + guests.memory,
      privateMemory:
        main.privateMemory + renderer.privateMemory + other.privateMemory + guests.privateMemory
    })
  }
}
