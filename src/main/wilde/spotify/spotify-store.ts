import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureFile, writeSecureJsonFile } from '../../../shared/secure-file'
import {
  normalizeWildeSpotifyConfig,
  type WildeSpotifyConfig
} from '../../../shared/wilde-spotify'

// Why a module-owned file instead of GlobalSettings: keeps the Wilde player out of upstream's
// settings plumbing (fewer merge conflicts) and off the host-synced settings schema.
const CONFIG_FILE = 'wilde-spotify.json'
const TOKEN_FILE = 'wilde-spotify-token.enc'
const TOKEN_ENVELOPE_PREFIX = 'wilde-spotify-refresh-token:v1:'

function userDataPath(file: string): string {
  return join(app.getPath('userData'), file)
}

export function readWildeSpotifyConfig(): WildeSpotifyConfig {
  try {
    return normalizeWildeSpotifyConfig(JSON.parse(readFileSync(userDataPath(CONFIG_FILE), 'utf8')))
  } catch {
    return normalizeWildeSpotifyConfig(undefined)
  }
}

export function writeWildeSpotifyConfig(config: WildeSpotifyConfig): WildeSpotifyConfig {
  const normalized = normalizeWildeSpotifyConfig(config)
  writeSecureJsonFile(userDataPath(CONFIG_FILE), normalized)
  return normalized
}

/** The refresh token is sealed with safeStorage (Windows DPAPI); never stored in plaintext. */
export function readRefreshToken(): string | null {
  const path = userDataPath(TOKEN_FILE)
  if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) {
    return null
  }
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.startsWith(TOKEN_ENVELOPE_PREFIX)) {
      return null
    }
    return safeStorage.decryptString(Buffer.from(text.slice(TOKEN_ENVELOPE_PREFIX.length), 'base64'))
  } catch {
    return null
  }
}

export function writeRefreshToken(token: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    return false
  }
  const sealed = safeStorage.encryptString(token).toString('base64')
  writeSecureFile(userDataPath(TOKEN_FILE), `${TOKEN_ENVELOPE_PREFIX}${sealed}`)
  return true
}

export function clearRefreshToken(): void {
  rmSync(userDataPath(TOKEN_FILE), { force: true })
}
