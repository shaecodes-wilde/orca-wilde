import { app, ipcMain, type WebContents } from 'electron'
import {
  WILDE_OBS_OFFLINE_STATUS,
  normalizeWildeObsConfig,
  type WildeObsActionResult,
  type WildeObsConfig,
  type WildeObsStatus
} from '../../../shared/wilde-obs'
import { readObsWebsocketFileConfig } from './obs-config-reader'
import { readWildeObsConfig, writeWildeObsConfig } from './obs-store'
import { WildeObsSocket } from './obs-websocket-client'

const STATUS_EVENT = 'wildeObs:status'
const RECONNECT_DELAY_MS = 3000

let config: WildeObsConfig = normalizeWildeObsConfig(undefined)
let status: WildeObsStatus = WILDE_OBS_OFFLINE_STATUS
const socket = new WildeObsSocket()
const statusSubscribers = new Map<number, WebContents>()
let reconnectTimer: NodeJS.Timeout | null = null
let connectInFlight = false

function broadcast(): void {
  for (const [id, contents] of statusSubscribers) {
    if (contents.isDestroyed()) {
      statusSubscribers.delete(id)
    } else {
      contents.send(STATUS_EVENT, status)
    }
  }
}

function setStatus(next: WildeObsStatus): void {
  status = next
  broadcast()
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function run(action: () => Promise<void>): Promise<WildeObsActionResult> {
  try {
    await action()
    return { ok: true }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scheduleReconnect(): void {
  if (reconnectTimer || !config.enabled) {
    return
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    // Why quiet: while OBS is closed, flashing "Connecting…" every retry makes the bar flicker.
    void connectOnce({ quiet: true })
  }, RECONNECT_DELAY_MS)
}

/** First configured Mic/Aux device (mic1–mic4); falls back to any *_input_capture input. */
async function discoverMicInput(): Promise<string | null> {
  try {
    const special = await socket.request('GetSpecialInputs')
    for (const key of ['mic1', 'mic2', 'mic3', 'mic4']) {
      const name = special[key]
      if (typeof name === 'string' && name.length > 0) {
        return name
      }
    }
  } catch {
    // Older OBS or no global devices — try the input list next.
  }
  try {
    const list = await socket.request('GetInputList')
    const inputs = Array.isArray(list.inputs) ? list.inputs : []
    const mic = inputs.find(
      (input) =>
        isRecord(input) &&
        typeof input.inputKind === 'string' &&
        input.inputKind.endsWith('_input_capture')
    )
    if (isRecord(mic) && typeof mic.inputName === 'string') {
      return mic.inputName
    }
  } catch {
    // No mic input — the mute button stays disabled.
  }
  return null
}

async function readInitialState(micInputName: string | null): Promise<WildeObsStatus> {
  let currentScene: string | null = null
  let micMuted: boolean | null = null
  try {
    const scene = await socket.request('GetCurrentProgramScene')
    if (typeof scene.currentProgramSceneName === 'string') {
      currentScene = scene.currentProgramSceneName
    }
  } catch {
    // Scene name stays unknown until the next scene-change event.
  }
  if (micInputName) {
    try {
      const mute = await socket.request('GetInputMute', { inputName: micInputName })
      if (typeof mute.inputMuted === 'boolean') {
        micMuted = mute.inputMuted
      }
    } catch {
      // Mute state unknown — the button still works via ToggleInputMute.
    }
  }
  return { state: 'connected', currentScene, micMuted, micInputName }
}

/** One connection attempt: re-reads OBS's own websocket config so OBS-side changes just work. */
async function connectOnce(options: { quiet?: boolean } = {}): Promise<void> {
  if (connectInFlight || !config.enabled) {
    return
  }
  connectInFlight = true
  if (!options.quiet) {
    setStatus({ ...WILDE_OBS_OFFLINE_STATUS, state: 'connecting' })
  }
  try {
    const fileConfig = readObsWebsocketFileConfig()
    const port = fileConfig?.serverPort ?? config.port
    const password = fileConfig?.authRequired ? fileConfig.serverPassword : null
    if (fileConfig?.authRequired && !fileConfig.serverPassword) {
      throw new Error('OBS websocket requires a password but its config file has none')
    }
    await socket.connect(`ws://${config.host}:${port}`, password)
    const micInputName = config.micInputName ?? (await discoverMicInput())
    setStatus(await readInitialState(micInputName))
  } catch {
    socket.close()
    if (status.state !== 'offline') {
      setStatus(WILDE_OBS_OFFLINE_STATUS)
    }
    scheduleReconnect()
  } finally {
    connectInFlight = false
  }
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket.close()
  setStatus(WILDE_OBS_OFFLINE_STATUS)
}

socket.on('event', (eventType: unknown, eventData: unknown) => {
  if (status.state !== 'connected' || !isRecord(eventData)) {
    return
  }
  if (eventType === 'CurrentProgramSceneChanged' && typeof eventData.sceneName === 'string') {
    setStatus({ ...status, currentScene: eventData.sceneName })
  } else if (
    eventType === 'InputMuteStateChanged' &&
    eventData.inputName === status.micInputName &&
    typeof eventData.inputMuted === 'boolean'
  ) {
    setStatus({ ...status, micMuted: eventData.inputMuted })
  }
})
socket.on('closed', () => {
  if (status.state !== 'offline') {
    setStatus(WILDE_OBS_OFFLINE_STATUS)
  }
  scheduleReconnect()
})

const HANDLE_CHANNELS = [
  'wildeObs:getConfig',
  'wildeObs:setConfig',
  'wildeObs:getStatus',
  'wildeObs:setScene',
  'wildeObs:toggleMic'
] as const

/** IPC for the Wilde OBS scene bar (left sidebar, above the settings gear). */
export function registerWildeObsHandlers(): void {
  config = readWildeObsConfig()
  app.once('will-quit', () => disconnect())
  // Why: registration can run again after a renderer recovery; ipcMain.handle throws on duplicates.
  for (const channel of HANDLE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('wildeObs:getConfig', (): WildeObsConfig => config)
  ipcMain.handle(
    'wildeObs:setConfig',
    (_event, update: Partial<WildeObsConfig>): WildeObsConfig => {
      config = writeWildeObsConfig({ ...config, ...update })
      disconnect()
      if (config.enabled) {
        void connectOnce()
      }
      return config
    }
  )
  ipcMain.handle('wildeObs:getStatus', (): WildeObsStatus => status)
  ipcMain.handle('wildeObs:setScene', (_event, sceneName: string) =>
    run(() => socket.request('SetCurrentProgramScene', { sceneName }).then(() => {}))
  )
  ipcMain.handle('wildeObs:toggleMic', () =>
    run(async () => {
      const micInputName = status.micInputName
      if (!micInputName) {
        throw new Error('No microphone input found in OBS')
      }
      const result = await socket.request('ToggleInputMute', { inputName: micInputName })
      if (typeof result.inputMuted === 'boolean' && status.state === 'connected') {
        setStatus({ ...status, micMuted: result.inputMuted })
      }
    })
  )

  ipcMain.removeAllListeners('wildeObs:subscribeStatus')
  ipcMain.on('wildeObs:subscribeStatus', (event) => {
    const contents = event.sender
    statusSubscribers.set(contents.id, contents)
    contents.once('destroyed', () => statusSubscribers.delete(contents.id))
    contents.send(STATUS_EVENT, status)
  })

  if (config.enabled) {
    void connectOnce()
  }
}
