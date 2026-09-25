import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { WildeSpotifyBands } from '../../../shared/wilde-spotify'

const EXE_NAME = 'wilde-spotify-audio-tap.exe'
const MAX_RESTARTS = 3

function resolveTapPath(): string | null {
  const candidates = [
    ...(process.resourcesPath ? [join(process.resourcesPath, 'wilde-spotify-windows', EXE_NAME)] : []),
    join(process.cwd(), 'native', 'wilde-spotify-windows', '.build', EXE_NAME),
    resolve(__dirname, '../../native/wilde-spotify-windows/.build', EXE_NAME)
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/** Parses one stdout line from the audio tap; bands for `{"b":[...]}`, null otherwise. */
export function parseBandsLine(line: string): WildeSpotifyBands | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{"b":')) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || !('b' in parsed) || !Array.isArray(parsed.b)) {
      return null
    }
    return parsed.b.map((value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
    )
  } catch {
    return null
  }
}

/**
 * Owns native/wilde-spotify-windows/wilde-spotify-audio-tap.exe, which captures only Spotify's
 * audio (WASAPI process loopback) and streams band levels. Capture runs only while `setActive(true)`
 * (a renderer is subscribed, the visualizer is on and Spotify is playing), so it is idle when paused.
 */
export class WildeSpotifyAudioTap {
  private child: ChildProcessWithoutNullStreams | null = null
  private active = false
  private restarts = 0
  private buffer = ''
  private disposed = false

  constructor(private readonly onBands: (bands: WildeSpotifyBands) => void) {}

  get isSupported(): boolean {
    return process.platform === 'win32'
  }

  setActive(active: boolean): void {
    if (active === this.active || this.disposed || !this.isSupported) {
      return
    }
    this.active = active
    const child = active ? this.ensureStarted() : this.child
    child?.stdin.write(active ? 'start\n' : 'stop\n')
  }

  dispose(): void {
    this.disposed = true
    this.active = false
    if (this.child) {
      this.child.stdin.write('exit\n')
      this.child.stdin.end()
      this.child = null
    }
  }

  private ensureStarted(): ChildProcessWithoutNullStreams | null {
    if (this.child) {
      return this.child
    }
    const tapPath = resolveTapPath()
    if (!tapPath) {
      console.warn('[wilde-spotify] audio tap not found; the visualizer is unavailable')
      return null
    }
    const child = spawn(tapPath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    this.buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      let newline = this.buffer.indexOf('\n')
      while (newline !== -1) {
        const bands = parseBandsLine(this.buffer.slice(0, newline))
        this.buffer = this.buffer.slice(newline + 1)
        if (bands && this.active) {
          this.restarts = 0
          this.onBands(bands)
        }
        newline = this.buffer.indexOf('\n')
      }
    })
    child.stderr.resume()
    child.on('error', (error) => console.warn('[wilde-spotify] audio tap failed to start', error))
    child.on('exit', () => {
      if (this.child !== child) {
        return
      }
      this.child = null
      if (this.disposed || !this.active || this.restarts >= MAX_RESTARTS) {
        return
      }
      this.restarts += 1
      setTimeout(() => {
        if (this.active && !this.child) {
          this.ensureStarted()?.stdin.write('start\n')
        }
      }, 1000 * this.restarts)
    })
    return child
  }
}
