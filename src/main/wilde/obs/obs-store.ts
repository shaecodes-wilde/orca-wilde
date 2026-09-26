import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFile } from '../../../shared/secure-file'
import { normalizeWildeObsConfig, type WildeObsConfig } from '../../../shared/wilde-obs'

// Why a module-owned file instead of GlobalSettings: same reasoning as wilde-spotify —
// keeps the Wilde OBS bar out of upstream's settings plumbing and off host-synced settings.
const CONFIG_FILE = 'wilde-obs.json'

function userDataPath(file: string): string {
  return join(app.getPath('userData'), file)
}

export function readWildeObsConfig(): WildeObsConfig {
  try {
    return normalizeWildeObsConfig(JSON.parse(readFileSync(userDataPath(CONFIG_FILE), 'utf8')))
  } catch {
    return normalizeWildeObsConfig(undefined)
  }
}

export function writeWildeObsConfig(config: WildeObsConfig): WildeObsConfig {
  const normalized = normalizeWildeObsConfig(config)
  writeSecureJsonFile(userDataPath(CONFIG_FILE), normalized)
  return normalized
}
