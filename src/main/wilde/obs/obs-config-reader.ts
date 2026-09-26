import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ObsWebsocketFileConfig = {
  serverEnabled: boolean
  serverPort: number
  authRequired: boolean
  serverPassword: string | null
}

function obsStudioConfigDir(): string {
  if (process.platform === 'win32') {
    return join(app.getPath('appData'), 'obs-studio')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'obs-studio')
  }
  return join(homedir(), '.config', 'obs-studio')
}

/**
 * Reads OBS's own obs-websocket settings (port + password) so the user never copies them into
 * Orca. The file is plaintext JSON that OBS itself maintains; read-only and local to this PC.
 * Re-read on every call — OBS rewrites it when the user changes websocket settings, and the
 * reconnect loop should pick that up without an Orca restart.
 */
export function readObsWebsocketFileConfig(): ObsWebsocketFileConfig | null {
  const path = join(obsStudioConfigDir(), 'plugin_config', 'obs-websocket', 'config.json')
  if (!existsSync(path)) {
    return null
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const port =
      typeof raw.server_port === 'number' &&
      Number.isInteger(raw.server_port) &&
      raw.server_port > 0 &&
      raw.server_port < 65536
        ? raw.server_port
        : 4455
    return {
      serverEnabled: raw.server_enabled === true,
      serverPort: port,
      authRequired: raw.auth_required !== false,
      serverPassword: typeof raw.server_password === 'string' ? raw.server_password : null
    }
  } catch {
    return null
  }
}
