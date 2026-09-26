import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { N8nClient } from './client'
import { N8nCollector } from './collector'
import type {
  CaptureCheckpoint,
  CollectorPage,
  CollectorStore,
  ExecutionMetadata,
  N8nConnection
} from './connector-types'
import { forbiddenAddress, normalizeApiBase } from './url-policy'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
})
async function fixture(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<N8nConnection> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('No fixture port')
  }
  closers.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  return {
    instanceId: 'cfdd2c70-a5a2-4c47-80c3-df4166a8d47f',
    label: 'Fixture',
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey: 'fixture-secret',
    enabled: true
  }
}
function json(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
function storeFixture() {
  let checkpoint: CaptureCheckpoint | null = null
  const executions = new Map<string, ExecutionMetadata>()
  const pages: CollectorPage[] = []
  const store: CollectorStore = {
    readCheckpoint: async () => checkpoint,
    commitPage: async (page) => {
      pages.push(structuredClone(page))
      for (const value of page.executions ?? []) {
        executions.set(value.executionId, value)
      }
      checkpoint = structuredClone(page.checkpoint)
    },
    pendingExecutions: async () =>
      [...executions.values()]
        .filter((value) => value.status === 'waiting')
        .map((value) => value.executionId)
  }
  return { store, executions, pages }
}

describe('n8n allowlisted reads through real loopback HTTP', () => {
  it('encodes pagination, excludes execution data, and projects away workflow secrets', async () => {
    const paths: string[] = []
    const connection = await fixture((req, res) => {
      expect(req.method).toBe('GET')
      expect(req.headers['x-n8n-api-key']).toBe('fixture-secret')
      paths.push(req.url ?? '')
      json(
        res,
        req.url?.includes('workflows')
          ? {
              data: [
                {
                  id: 'w',
                  name: 'Inventory',
                  active: true,
                  nodes: [{ credentials: 'private' }],
                  staticData: 'private'
                }
              ],
              nextCursor: 'a&b'
            }
          : {
              data: [
                {
                  id: 'e',
                  workflowId: 'w',
                  status: 'future-status',
                  finished: true,
                  data: { secret: 'private' }
                }
              ]
            }
      )
    })
    const client = new N8nClient(connection, { fixtureHttp: true })
    const workflows = await client.workflows(null, new AbortController().signal)
    expect(workflows.cursor).toBe('a&b')
    expect(workflows.data[0]).toMatchObject({ workflowId: 'w', title: 'Inventory', active: true })
    expect(JSON.stringify(workflows)).not.toContain('private')
    const executions = await client.executions('a&b', new AbortController().signal)
    expect(executions.data[0].status).toBe('future-status')
    expect(JSON.stringify(executions)).not.toContain('private')
    expect(paths[1]).toContain('cursor=a%26b')
    expect(paths[1]).toContain('includeData=false')
  })
  it('retries transient responses at most twice and never follows redirects', async () => {
    let calls = 0
    const connection = await fixture((_, res) => {
      calls++
      json(res, {}, 503)
    })
    const client = new N8nClient(connection, { fixtureHttp: true, retryDelayMs: 0 })
    await expect(client.workflows(null, new AbortController().signal)).rejects.toThrow('HTTP 503')
    expect(calls).toBe(3)
    let redirected = 0
    const redirect = await fixture((req, res) => {
      if (req.url === '/target') {
        redirected++
      }
      res.writeHead(302, { location: '/target' })
      res.end()
    })
    await expect(
      new N8nClient(redirect, { fixtureHttp: true }).workflows(null, new AbortController().signal)
    ).rejects.toThrow('HTTP 302')
    expect(redirected).toBe(0)
  })
  it('cancels hanging sockets and rejects oversized bodies', async () => {
    const hanging = await fixture(() => {})
    const controller = new AbortController()
    const read = new N8nClient(hanging, { fixtureHttp: true }).workflows(null, controller.signal)
    setTimeout(() => controller.abort(), 20)
    await expect(read).rejects.toThrow()
    const large = await fixture((_, res) => json(res, { data: 'x'.repeat(1000) }))
    await expect(
      new N8nClient(large, { fixtureHttp: true, maxBytes: 100 }).workflows(
        null,
        new AbortController().signal
      )
    ).rejects.toThrow('size limit')
  })
  it('bounds timeout retries and rejects invalid pages without exposing bodies', async () => {
    const hanging = await fixture(() => {})
    await expect(
      new N8nClient(hanging, { fixtureHttp: true, timeoutMs: 10, retryDelayMs: 0 }).workflows(
        null,
        new AbortController().signal
      )
    ).rejects.toThrow('timed out')
    const invalid = await fixture((_, res) =>
      json(res, { data: [{ id: 'w', active: 'invalid', secret: 'private' }] })
    )
    await expect(
      new N8nClient(invalid, { fixtureHttp: true }).workflows(null, new AbortController().signal)
    ).rejects.toThrow()
  })
})

describe('collector lifecycle and capture evidence', () => {
  it('coalesces concurrent refresh, checkpoints pages, replays on restart and refreshes waiting executions', async () => {
    let complete = false
    let workflowReads = 0
    const connection = await fixture((req, res) => {
      if (req.url?.includes('/workflows')) {
        workflowReads++
        json(res, { data: [{ id: 'w', name: 'Workflow', active: true }] })
      } else if (req.url?.includes('/executions/e')) {
        json(res, { id: 'e', workflowId: 'w', status: complete ? 'success' : 'waiting' })
      } else {
        json(res, {
          data: [
            { id: 'e', workflowId: 'w', status: 'waiting', startedAt: new Date().toISOString() }
          ]
        })
      }
    })
    const memory = storeFixture()
    const collector = new N8nCollector(memory.store, async () => connection, { fixtureHttp: true })
    const first = collector.sync()
    expect(collector.sync()).toBe(first)
    expect((await first).status).toBe('idle')
    expect(memory.executions.get('e')?.status).toBe('waiting')
    expect(memory.pages.length).toBe(3)
    complete = true
    await collector.stop()
    const restarted = new N8nCollector(memory.store, async () => connection, { fixtureHttp: true })
    expect((await restarted.sync()).lastSync).not.toBeNull()
    expect(memory.executions.size).toBe(1)
    expect(memory.executions.get('e')?.status).toBe('success')
    expect(workflowReads).toBe(2)
  })
  it('stops hammering authorization failures until configuration changes', async () => {
    let calls = 0
    const connection = await fixture((_, res) => {
      calls++
      json(res, {}, 401)
    })
    const collector = new N8nCollector(storeFixture().store, async () => connection, {
      fixtureHttp: true
    })
    expect((await collector.sync()).status).toBe('error')
    await collector.sync()
    expect(calls).toBe(1)
    collector.configurationChanged()
    await collector.sync()
    expect(calls).toBe(2)
  })
  it('detects cursor loops without deleting previous evidence', async () => {
    const connection = await fixture((_, res) =>
      json(res, { data: [{ id: 'w', name: 'Workflow', active: true }], nextCursor: 'loop' })
    )
    const memory = storeFixture()
    const collector = new N8nCollector(memory.store, async () => connection, { fixtureHttp: true })
    const state = await collector.sync()
    expect(state.status).toBe('error')
    expect(state.message).toContain('cursor loop')
    expect(memory.pages).toHaveLength(2)
    expect(state.lastSync).toBeNull()
  })
  it('preserves the committed checkpoint if the next atomic page write fails', async () => {
    const connection = await fixture((req, res) =>
      json(
        res,
        req.url?.includes('workflows')
          ? { data: [], nextCursor: null }
          : { data: [{ id: 'e', workflowId: 'w' }] }
      )
    )
    const memory = storeFixture()
    const commit = memory.store.commitPage
    let calls = 0
    memory.store.commitPage = async (page) => {
      if (++calls === 2) {
        throw new Error('transaction interrupted')
      }
      await commit(page)
    }
    const collector = new N8nCollector(memory.store, async () => connection, { fixtureHttp: true })
    expect((await collector.sync()).status).toBe('error')
    expect(memory.executions.size).toBe(0)
    expect(memory.pages).toHaveLength(1)
    expect(memory.pages[0].checkpoint.lastSuccess).toBeNull()
  })
})

describe('instance URL policy', () => {
  it('normalizes deliberate HTTPS private instances and subpaths', () => {
    expect(normalizeApiBase('https://internal.example/n8n/')).toBe(
      'https://internal.example/n8n/api/v1'
    )
    expect(normalizeApiBase('https://10.0.0.2/api/v1')).toBe('https://10.0.0.2/api/v1')
  })
  it.each([
    'http://example.org',
    'https://user:pass@example.org',
    'https://example.org?url=bad',
    'https://example.org/#fragment',
    'https://example.org/%2e%2e/private',
    'https://169.254.169.254',
    'https://[fe80::1]',
    'https://[::ffff:a9fe:a9fe]'
  ])('rejects unsafe URL %s', (url) => {
    expect(() => normalizeApiBase(url)).toThrow()
  })
  it('classifies mapped IPv6 metadata addresses and private network HTTP is not a fixture escape', () => {
    expect(forbiddenAddress('::ffff:169.254.169.254')).toBe(true)
    expect(() => normalizeApiBase('http://10.0.0.1', true)).toThrow()
  })
})
