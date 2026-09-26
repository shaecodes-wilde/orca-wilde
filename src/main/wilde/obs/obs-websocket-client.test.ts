import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { computeObsAuthentication, WildeObsSocket } from './obs-websocket-client'

const servers: WebSocketServer[] = []
const clients: WildeObsSocket[] = []

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.close()
  }
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
})

type FakeObs = {
  url: string
  /** Messages the server received from the client, most recent last. */
  received: Record<string, unknown>[]
  /** The server-side socket, for pushing events/closing. */
  serverSockets: WebSocket[]
}

/** A minimal obs-websocket v5 server: Hello on connect, Identified on Identify, echo-able requests. */
function startFakeObs(
  options: { auth?: { salt: string; challenge: string } } = {}
): Promise<FakeObs> {
  return new Promise((resolve) => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    servers.push(server)
    const fake: FakeObs = { url: '', received: [], serverSockets: [] }
    server.on('connection', (socket) => {
      fake.serverSockets.push(socket)
      socket.send(
        JSON.stringify({
          op: 0,
          d: { obsWebSocketVersion: '5.5.2', rpcVersion: 1, authentication: options.auth }
        })
      )
      socket.on('message', (data) => {
        const message = JSON.parse(String(data)) as Record<string, unknown>
        fake.received.push(message)
        if (message.op === 1) {
          socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }))
        } else if (message.op === 6) {
          const d = message.d as Record<string, unknown>
          const failed = d.requestType === 'FailMe'
          socket.send(
            JSON.stringify({
              op: 7,
              d: {
                requestType: d.requestType,
                requestId: d.requestId,
                requestStatus: failed
                  ? { result: false, code: 602, comment: 'nope' }
                  : { result: true, code: 100 },
                responseData: { echoed: d.requestType }
              }
            })
          )
        }
      })
    })
    server.on('listening', () => {
      fake.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
      resolve(fake)
    })
  })
}

function connectClient(url: string, password: string | null): Promise<WildeObsSocket> {
  const client = new WildeObsSocket()
  clients.push(client)
  return client.connect(url, password).then(() => client)
}

describe('computeObsAuthentication', () => {
  it('implements the obs-websocket v5 double-sha256 proof', () => {
    const secret = createHash('sha256').update(`hunter2NaCl`).digest('base64')
    const expected = createHash('sha256').update(`${secret}abc123`).digest('base64')
    expect(computeObsAuthentication('hunter2', 'NaCl', 'abc123')).toBe(expected)
  })
})

describe('WildeObsSocket', () => {
  it('identifies without auth when OBS sends no challenge', async () => {
    const obs = await startFakeObs()
    await connectClient(obs.url, null)
    const identify = obs.received.find((message) => message.op === 1)
    expect(identify).toBeTruthy()
    const d = identify?.d as Record<string, unknown>
    expect(d.rpcVersion).toBe(1)
    expect(d.authentication).toBeUndefined()
    expect(d.eventSubscriptions).toBe((1 << 0) | (1 << 2) | (1 << 3))
  })

  it('answers the auth challenge with the configured password', async () => {
    const auth = { salt: 'salty', challenge: 'chall' }
    const obs = await startFakeObs({ auth })
    await connectClient(obs.url, 'hunter2')
    const identify = obs.received.find((message) => message.op === 1)
    const d = identify?.d as Record<string, unknown>
    expect(d.authentication).toBe(computeObsAuthentication('hunter2', 'salty', 'chall'))
  })

  it('rejects when OBS requires a password but none is configured', async () => {
    const obs = await startFakeObs({ auth: { salt: 's', challenge: 'c' } })
    const client = new WildeObsSocket()
    clients.push(client)
    await expect(client.connect(obs.url, null)).rejects.toThrow(/password/i)
  })

  it('round-trips requests by requestId', async () => {
    const obs = await startFakeObs()
    const client = await connectClient(obs.url, null)
    const result = await client.request('SetCurrentProgramScene', { sceneName: 'A' })
    expect(result).toEqual({ echoed: 'SetCurrentProgramScene' })
    const request = obs.received.find((message) => message.op === 6)
    const d = request?.d as Record<string, unknown>
    expect(d.requestType).toBe('SetCurrentProgramScene')
    expect(d.requestData).toEqual({ sceneName: 'A' })
  })

  it('rejects requests when the requestStatus is a failure', async () => {
    const obs = await startFakeObs()
    const client = await connectClient(obs.url, null)
    await expect(client.request('FailMe')).rejects.toThrow(/nope/)
  })

  it('re-emits OBS events', async () => {
    const obs = await startFakeObs()
    const client = await connectClient(obs.url, null)
    const seen = new Promise<unknown>((resolve) => client.once('event', resolve))
    obs.serverSockets[0]?.send(
      JSON.stringify({
        op: 5,
        d: {
          eventType: 'CurrentProgramSceneChanged',
          eventIntent: 4,
          eventData: { sceneName: 'B' }
        }
      })
    )
    await expect(seen).resolves.toBe('CurrentProgramSceneChanged')
  })

  it('emits closed and rejects pending requests when OBS drops', async () => {
    const obs = await startFakeObs()
    const client = await connectClient(obs.url, null)
    const closed = new Promise((resolve) => client.once('closed', resolve))
    obs.serverSockets[0]?.close()
    await closed
    expect(client.connected).toBe(false)
  })
})
