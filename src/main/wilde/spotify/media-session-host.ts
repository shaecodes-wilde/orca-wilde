import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  FALLBACK_WINDOWS_EXECUTION_POLICY,
  PREFERRED_WINDOWS_EXECUTION_POLICY,
  isExecutionPolicyBlocked,
  windowsPowerShellRuntimeArgs,
  type WindowsExecutionPolicy
} from '../../computer/windows-powershell-execution-policy'
import type { WildeSpotifyMediaCommand, WildeSpotifyNowPlaying } from '../../../shared/wilde-spotify'
import { parseMediaSessionLine, type MediaSessionMessage } from './media-session-protocol'

const SCRIPT_DIRECTORY = 'wilde-spotify-windows'
const SCRIPT_FILENAME = 'media-session.ps1'
const COMMAND_TIMEOUT_MS = 6000
const MAX_RESTARTS = 5

function resolveScriptPath(): string | null {
  const candidates = [
    ...(process.resourcesPath ? [join(process.resourcesPath, SCRIPT_DIRECTORY, SCRIPT_FILENAME)] : []),
    join(process.cwd(), 'native', SCRIPT_DIRECTORY, SCRIPT_FILENAME),
    resolve(__dirname, '../../native', SCRIPT_DIRECTORY, SCRIPT_FILENAME)
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

type PendingCommand = { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }

/**
 * Owns the persistent PowerShell bridge (native/wilde-spotify-windows/media-session.ps1) that
 * reads the Spotify desktop app's Windows media session. Windows only; started lazily by the
 * first subscriber and kept alive (with bounded restarts) for the rest of the app session.
 */
export class WildeSpotifyMediaSession {
  private child: ChildProcessWithoutNullStreams | null = null
  private policy: WindowsExecutionPolicy = PREFERRED_WINDOWS_EXECUTION_POLICY
  private restarts = 0
  private nextCommandId = 1
  private readonly pending = new Map<number, PendingCommand>()
  private stdoutBuffer = ''
  private stderrTail = ''
  private artwork: string | null = null
  private latest: WildeSpotifyNowPlaying = { available: false }
  private readonly listeners = new Set<(state: WildeSpotifyNowPlaying) => void>()
  private disposed = false

  get isSupported(): boolean {
    return process.platform === 'win32'
  }

  getState(): WildeSpotifyNowPlaying {
    return this.latest
  }

  subscribe(listener: (state: WildeSpotifyNowPlaying) => void): () => void {
    this.listeners.add(listener)
    this.ensureStarted()
    // Why snapshot: a late subscriber (window reload) needs artwork even if the track is unchanged.
    void this.send('snapshot')
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Passive listener: sees state changes without starting the bridge (used to gate the audio tap). */
  observe(listener: (state: WildeSpotifyNowPlaying) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async command(command: WildeSpotifyMediaCommand): Promise<boolean> {
    this.ensureStarted()
    return this.send(command)
  }

  dispose(): void {
    this.disposed = true
    this.child?.stdin.end()
    this.child?.kill()
    this.child = null
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.pending.clear()
  }

  private ensureStarted(): void {
    if (this.child || this.disposed || !this.isSupported) {
      return
    }
    const scriptPath = resolveScriptPath()
    if (!scriptPath) {
      console.warn('[wilde-spotify] media-session.ps1 not found; now-playing is unavailable')
      return
    }
    const child = spawn('powershell.exe', windowsPowerShellRuntimeArgs(scriptPath, this.policy), {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    this.stdoutBuffer = ''
    this.stderrTail = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-4000)
    })
    child.on('error', (error) => {
      console.warn('[wilde-spotify] media-session bridge failed to start', error)
    })
    child.on('exit', (code) => this.onExit(child, code))
  }

  private onExit(child: ChildProcessWithoutNullStreams, code: number | null): void {
    if (this.child !== child) {
      return
    }
    this.child = null
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.pending.clear()
    if (this.disposed) {
      return
    }
    // Why: `Restricted` is the Windows client default; fall back once, as computer use does.
    if (
      this.policy === PREFERRED_WINDOWS_EXECUTION_POLICY &&
      isExecutionPolicyBlocked(this.stderrTail)
    ) {
      this.policy = FALLBACK_WINDOWS_EXECUTION_POLICY
      this.ensureStarted()
      return
    }
    if (this.restarts >= MAX_RESTARTS) {
      console.warn(`[wilde-spotify] media-session bridge exited (${code}); giving up`, this.stderrTail)
      this.publish({ available: false })
      return
    }
    this.restarts += 1
    setTimeout(() => {
      if (this.listeners.size > 0) {
        this.ensureStarted()
        void this.send('snapshot')
      }
    }, 1000 * this.restarts)
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newline = this.stdoutBuffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.stdoutBuffer.slice(0, newline)
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      const message = parseMediaSessionLine(line)
      if (message) {
        this.onMessage(message)
      }
      newline = this.stdoutBuffer.indexOf('\n')
    }
  }

  private onMessage(message: MediaSessionMessage): void {
    if (message.type === 'result') {
      const pending = this.pending.get(message.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(message.id)
        pending.resolve(message.ok)
      }
      return
    }
    if (message.type === 'error') {
      return
    }
    // A healthy state message means the bridge is working again.
    this.restarts = 0
    const { artwork, state } = message
    if (artwork !== undefined) {
      this.artwork = artwork
    }
    this.publish(state.available ? { ...state, artwork: this.artwork } : state)
  }

  private publish(state: WildeSpotifyNowPlaying): void {
    this.latest = state
    for (const listener of this.listeners) {
      listener(state)
    }
  }

  private send(command: WildeSpotifyMediaCommand | 'snapshot'): Promise<boolean> {
    const child = this.child
    if (!child) {
      return Promise.resolve(false)
    }
    const id = this.nextCommandId++
    return new Promise((resolvePromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolvePromise(false)
      }, COMMAND_TIMEOUT_MS)
      this.pending.set(id, { resolve: resolvePromise, timer })
      child.stdin.write(`${JSON.stringify({ id, cmd: command })}\n`)
    })
  }
}
