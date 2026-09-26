/** Wilde OBS scene bar: types shared by main, preload and renderer. */

export type WildeObsScenePreset = {
  /** Short button label shown in the bar, e.g. '1'. */
  label: string
  /** Exact OBS scene name to switch to. */
  sceneName: string
}

export type WildeObsConfig = {
  /** Show the OBS bar above the sidebar toolbar. */
  enabled: boolean
  /** obs-websocket host override; OBS's own config wins when it specifies a port. */
  host: string
  /** Fallback port when OBS's websocket config file is missing/unreadable. */
  port: number
  /** OBS input to mute; null = auto-detect the first configured Mic/Aux device. */
  micInputName: string | null
  presets: WildeObsScenePreset[]
}

export const DEFAULT_WILDE_OBS_CONFIG: WildeObsConfig = {
  enabled: true,
  host: '127.0.0.1',
  port: 4455,
  micInputName: null,
  presets: [
    { label: '1', sceneName: 'Orca Capture' },
    { label: '2', sceneName: 'Display 1 Scene 2' },
    { label: '3', sceneName: 'Camera Full Screen' }
  ]
}

export type WildeObsStatus = {
  state: 'connecting' | 'connected' | 'offline'
  /** OBS scene currently on program; null until known or while offline. */
  currentScene: string | null
  /** Mute state of the resolved mic input; null while offline or when no mic was found. */
  micMuted: boolean | null
  /** The OBS input the mic button operates on (auto-detected or overridden). */
  micInputName: string | null
}

export const WILDE_OBS_OFFLINE_STATUS: WildeObsStatus = {
  state: 'offline',
  currentScene: null,
  micMuted: null,
  micInputName: null
}

export type WildeObsActionResult = { ok: true } | { ok: false; message: string }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePresets(value: unknown): WildeObsScenePreset[] {
  if (!Array.isArray(value)) {
    return DEFAULT_WILDE_OBS_CONFIG.presets
  }
  const presets = value
    .filter(
      (entry): entry is WildeObsScenePreset =>
        isPlainRecord(entry) &&
        typeof entry.label === 'string' &&
        entry.label.length > 0 &&
        entry.label.length <= 4 &&
        typeof entry.sceneName === 'string' &&
        entry.sceneName.length > 0
    )
    .map((entry) => ({ label: entry.label, sceneName: entry.sceneName }))
    .slice(0, 6)
  return presets.length > 0 ? presets : DEFAULT_WILDE_OBS_CONFIG.presets
}

export function normalizeWildeObsConfig(value: unknown): WildeObsConfig {
  if (!isPlainRecord(value)) {
    return DEFAULT_WILDE_OBS_CONFIG
  }
  const record = value
  const host =
    typeof record.host === 'string' && record.host.trim().length > 0
      ? record.host.trim()
      : DEFAULT_WILDE_OBS_CONFIG.host
  const port =
    typeof record.port === 'number' &&
    Number.isInteger(record.port) &&
    record.port > 0 &&
    record.port < 65536
      ? record.port
      : DEFAULT_WILDE_OBS_CONFIG.port
  const micInputName =
    typeof record.micInputName === 'string' && record.micInputName.trim().length > 0
      ? record.micInputName.trim()
      : null
  return {
    enabled: record.enabled !== false,
    host,
    port,
    micInputName,
    presets: normalizePresets(record.presets)
  }
}
