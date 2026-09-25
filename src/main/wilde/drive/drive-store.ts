import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFile } from '../../../shared/secure-file'
import { normalizeWildeDriveConfig, type WildeDriveConfig } from '../../../shared/wilde-drive'

// Why a module-owned file instead of GlobalSettings: same reason as wilde-spotify.json — keeps the
// Wilde Drive tab out of upstream's settings plumbing and off the host-synced settings schema.
const CONFIG_FILE = 'wilde-drive.json'

function configPath(): string {
  return join(app.getPath('userData'), CONFIG_FILE)
}

export function readWildeDriveConfig(): WildeDriveConfig {
  try {
    return normalizeWildeDriveConfig(JSON.parse(readFileSync(configPath(), 'utf8')))
  } catch {
    return normalizeWildeDriveConfig(undefined)
  }
}

export function writeWildeDriveConfig(config: WildeDriveConfig): WildeDriveConfig {
  const normalized = normalizeWildeDriveConfig(config)
  writeSecureJsonFile(configPath(), normalized)
  return normalized
}
