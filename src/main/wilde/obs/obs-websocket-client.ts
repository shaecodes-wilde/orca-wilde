import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'

// obs-websocket v5 op codes (built into OBS >= 28).
const OP_HELLO = 0
const OP_IDENTIFY = 1
const OP_IDENTIFIED = 2
const OP_EVENT = 5
const OP_REQUEST = 6
const OP_REQUEST_RESPONSE = 7

// EventSubscriptions bitmask: General | Scenes | Inputs — program-scene and input-mute events only.
const EVENT_SUBSCRIPTIONS = (1 << 0) | (1 << 2) | (1 << 3)

const HANDSHAKE_TIMEOUT_MS = 5000
const REQUEST_TIMEOUT_MS = 5000

type PendingRequest = {
  resolve: (data: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

type ObsHello = {
  obsWebSocketVersion?: string
  rpcVersion?: number
  authentication?: { challenge?: string; salt?: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The double-hash proof OBS expects when its websocket requires a password. */
export function computeObsAuthentication(
  password: string,
  salt: string,
  challenge: string
): string {
  const secret = createHash('sha256')
    .update(password + salt)
    .digest('base64')
  return createHash('sha256')
    .update(secret + challenge)
    .digest('base64')
}

/**
 * Minimal obs-websocket v5 client: Hello → Identify → Identified, then op-6 requests matched to
 * op-7 responses by requestId, and op-5 events re-emitted on 'event'. One socket per instance;
 * reconnect policy lives in the caller.
 */
export class WildeObsSocket extends EventEmitter {
  private socket: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private handshakeTimer: NodeJS.Timeout | null = null
  private identifyResolve: (() => void) | null = null
  private identifyReject: ((error: Error) => void) | null = null
  private pendingPassword: string | null = null

  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN
  }

  /** Resolves once OBS answers Identified; rejects on auth failure, close or timeout. */
  connect(url: string, password: string | null): Promise<void> {
    this.close()
    this.pendingPassword = password
    return new Promise<void>((resolve, reject) => {
      this.identifyResolve = resolve
      this.identifyReject = reject
      const socket = new WebSocket(url)
      this.socket = socket
      this.handshakeTimer = setTimeout(() => {
        this.failIdentify(new Error('Timed out waiting for OBS websocket handshake'))
        socket.close()
      }, HANDSHAKE_TIMEOUT_MS)
      socket.on('message', (data) => this.onMessage(data))
      socket.on('error', (error) => this.onSocketFailure(error))
      socket.on('close', () => this.onSocketFailure(new Error('OBS websocket closed')))
    })
  }

  request(
    requestType: string,
    requestData?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected to OBS'))
    }
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`OBS request timed out: ${requestType}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(requestId, { resolve, reject, timer })
      socket.send(JSON.stringify({ op: OP_REQUEST, d: { requestType, requestId, requestData } }))
    })
  }

  close(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.removeAllListeners()
      try {
        socket.close()
      } catch {
        // Why: ws throws on an already-dead socket; closing is best-effort.
      }
    }
    this.failPending(new Error('Disconnected from OBS'))
    this.failIdentify(new Error('Disconnected from OBS'))
  }

  private onMessage(data: unknown): void {
    let message: Record<string, unknown>
    try {
      const parsed = JSON.parse(String(data))
      if (!isRecord(parsed)) {
        return
      }
      message = parsed
    } catch {
      return
    }
    const op = message.op
    const d = isRecord(message.d) ? message.d : {}
    if (op === OP_HELLO) {
      this.handleHello(d as ObsHello)
    } else if (op === OP_IDENTIFIED) {
      this.settleIdentify()
    } else if (op === OP_REQUEST_RESPONSE) {
      this.handleRequestResponse(d)
    } else if (op === OP_EVENT) {
      this.emit('event', d.eventType, d.eventData)
    }
  }

  private handleHello(hello: ObsHello): void {
    const auth = hello.authentication
    const identify: Record<string, unknown> = {
      rpcVersion: 1,
      eventSubscriptions: EVENT_SUBSCRIPTIONS
    }
    if (auth?.challenge && auth?.salt) {
      if (!this.pendingPassword) {
        this.failIdentify(new Error('OBS websocket requires a password but none is configured'))
        return
      }
      identify.authentication = computeObsAuthentication(
        this.pendingPassword,
        auth.salt,
        auth.challenge
      )
    }
    this.socket?.send(JSON.stringify({ op: OP_IDENTIFY, d: identify }))
  }

  private handleRequestResponse(d: Record<string, unknown>): void {
    const requestId = typeof d.requestId === 'string' ? d.requestId : null
    const pending = requestId ? this.pending.get(requestId) : null
    if (!requestId || !pending) {
      return
    }
    this.pending.delete(requestId)
    clearTimeout(pending.timer)
    const status = isRecord(d.requestStatus) ? d.requestStatus : {}
    if (status.result === true) {
      pending.resolve(isRecord(d.responseData) ? d.responseData : {})
    } else {
      const comment =
        typeof status.comment === 'string' ? status.comment : `code ${String(status.code)}`
      pending.reject(new Error(`OBS rejected ${String(d.requestType ?? 'request')}: ${comment}`))
    }
  }

  private settleIdentify(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    const resolve = this.identifyResolve
    this.identifyResolve = null
    this.identifyReject = null
    resolve?.()
  }

  private failIdentify(error: Error): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    const reject = this.identifyReject
    this.identifyResolve = null
    this.identifyReject = null
    reject?.(error)
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private onSocketFailure(error: Error): void {
    if (this.socket === null && this.identifyReject === null && this.pending.size === 0) {
      return
    }
    this.failIdentify(error)
    this.failPending(error)
    this.socket = null
    this.emit('closed', error)
  }
}
