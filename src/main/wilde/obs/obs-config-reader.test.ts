import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as OsModule from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testRoot = mkdtempSync(join(tmpdir(), 'wilde-obs-config-'))
const fakeAppData = join(testRoot, 'appdata')
const fakeHome = join(testRoot, 'home')

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'appData' ? fakeAppData : testRoot) }
}))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof OsModule>()),
  homedir: () => fakeHome
}))

const { readObsWebsocketFileConfig } = await import('./obs-config-reader')

function obsConfigDir(): string {
  if (process.platform === 'win32') {
    return join(fakeAppData, 'obs-studio')
  }
  if (process.platform === 'darwin') {
    return join(fakeHome, 'Library', 'Application Support', 'obs-studio')
  }
  return join(fakeHome, '.config', 'obs-studio')
}

function writeObsConfig(contents: string): void {
  const dir = join(obsConfigDir(), 'plugin_config', 'obs-websocket')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), contents)
}

describe('readObsWebsocketFileConfig', () => {
  beforeEach(() => {
    writeObsConfig(
      JSON.stringify({
        server_enabled: true,
        server_port: 4455,
        auth_required: true,
        server_password: 'secret'
      })
    )
  })

  it('parses OBS’s own websocket config', () => {
    expect(readObsWebsocketFileConfig()).toEqual({
      serverEnabled: true,
      serverPort: 4455,
      authRequired: true,
      serverPassword: 'secret'
    })
  })

  it('defaults auth to required and port to 4455 on partial config', () => {
    writeObsConfig(JSON.stringify({ server_enabled: false }))
    expect(readObsWebsocketFileConfig()).toEqual({
      serverEnabled: false,
      serverPort: 4455,
      authRequired: true,
      serverPassword: null
    })
  })

  it('treats a missing password as null and an explicit false as no auth', () => {
    writeObsConfig(JSON.stringify({ server_enabled: true, auth_required: false }))
    const config = readObsWebsocketFileConfig()
    expect(config?.authRequired).toBe(false)
    expect(config?.serverPassword).toBeNull()
  })

  it('returns null when the file is missing or malformed', () => {
    rmSync(join(obsConfigDir(), 'plugin_config', 'obs-websocket', 'config.json'), { force: true })
    expect(readObsWebsocketFileConfig()).toBeNull()
    writeObsConfig('not json {')
    expect(readObsWebsocketFileConfig()).toBeNull()
  })
})
