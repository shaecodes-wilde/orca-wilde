import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { isIP } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { forbiddenAddress, normalizeApiBase } from './url-policy'
import { pageSchema, projectExecution, projectWorkflow } from './projection'
import type { N8nConnection } from './connector-types'

export class N8nError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryAfterMs = 0,
    readonly retryable = false
  ) {
    super(message)
  }
}
export type ClientOptions = {
  fixtureHttp?: boolean
  timeoutMs?: number
  maxBytes?: number
  retryDelayMs?: number
}
export class N8nClient {
  private readonly base: string
  constructor(
    private readonly connection: N8nConnection,
    private readonly options: ClientOptions = {}
  ) {
    this.base = normalizeApiBase(connection.baseUrl, options.fixtureHttp)
  }
  async workflows(cursor: string | null, signal: AbortSignal, limit = 100) {
    const page = pageSchema.parse(
      await this.get('workflows', { limit: String(limit), ...(cursor ? { cursor } : {}) }, signal)
    )
    const observedAt = new Date().toISOString()
    return {
      data: page.data.map((value) => projectWorkflow(value, observedAt)),
      cursor: page.nextCursor || null
    }
  }
  async executions(cursor: string | null, signal: AbortSignal) {
    const page = pageSchema.parse(
      await this.get(
        'executions',
        { limit: '100', includeData: 'false', ...(cursor ? { cursor } : {}) },
        signal
      )
    )
    const observedAt = new Date().toISOString()
    return {
      data: page.data.map((value) => projectExecution(value, observedAt)),
      cursor: page.nextCursor || null
    }
  }
  async execution(id: string, signal: AbortSignal) {
    if (
      !id ||
      id.length > 240 ||
      id === '.' ||
      id === '..' ||
      [...id].some((character) => character.charCodeAt(0) < 32)
    ) {
      throw new N8nError('Invalid execution identifier')
    }
    return projectExecution(
      await this.get(
        `executions/${encodeURIComponent(id)}`,
        { includeData: 'false' },
        signal,
        1024 * 1024
      ),
      new Date().toISOString()
    )
  }
  private async get(
    path: string,
    query: Record<string, string>,
    signal: AbortSignal,
    byteLimit?: number
  ): Promise<unknown> {
    const url = new URL(`${this.base}/${path}`)
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      try {
        return await this.request(url, signal, byteLimit)
      } catch (error) {
        if (signal.aborted) {
          throw signal.reason
        }
        if (!(error instanceof N8nError) || !error.retryable || attempt >= 2) {
          throw error
        }
        const wait = Math.min(
          15000,
          Math.max(
            error.retryAfterMs,
            (this.options.retryDelayMs ?? 500) * 2 ** attempt + Math.random() * 100
          )
        )
        await delay(wait, undefined, { signal })
      }
    }
  }
  private async request(url: URL, parentSignal: AbortSignal, byteLimit?: number): Promise<unknown> {
    const signal = AbortSignal.any([
      parentSignal,
      AbortSignal.timeout(this.options.timeoutMs ?? 15000)
    ])
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await Promise.race([
          lookup(hostname, { all: true }),
          new Promise<never>((_, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new N8nError('n8n request timed out or was cancelled', 0, 0, true)),
              { once: true }
            )
          })
        ])
    signal.throwIfAborted()
    if (!addresses.length || addresses.some((value) => forbiddenAddress(value.address))) {
      throw new N8nError('n8n resolved to a forbidden network address')
    }
    const address = addresses[0]
    return new Promise((resolve, reject) => {
      const request = url.protocol === 'https:' ? httpsRequest : httpRequest
      const req = request(
        {
          protocol: url.protocol,
          hostname: address.address,
          port: url.port || undefined,
          servername: isIP(hostname) ? undefined : hostname,
          method: 'GET',
          path: `${url.pathname}${url.search}`,
          headers: {
            Host: url.host,
            Accept: 'application/json',
            'X-N8N-API-KEY': this.connection.apiKey
          },
          signal,
          agent: false
        },
        (response) => {
          const status = response.statusCode ?? 0
          if (status < 200 || status >= 300) {
            response.destroy()
            const retry = response.headers['retry-after']
            const retrySeconds = Number(retry)
            const retryAfter = Number.isFinite(retrySeconds)
              ? retrySeconds * 1000
              : Math.max(0, Date.parse(String(retry)) - Date.now()) || 0
            reject(
              new N8nError(
                status === 401 || status === 403
                  ? 'n8n authorization failed; update the API key before retrying'
                  : `n8n read returned HTTP ${status}`,
                status,
                retryAfter,
                status === 429 || status >= 500
              )
            )
            return
          }
          const chunks: Buffer[] = []
          let size = 0
          response.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > (byteLimit ?? this.options.maxBytes ?? 4 * 1024 * 1024)) {
              response.destroy()
              reject(new N8nError('n8n response exceeded the safe size limit', 413))
            } else {
              chunks.push(chunk)
            }
          })
          response.on('error', () => reject(new N8nError('n8n response interrupted', 0, 0, true)))
          response.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch {
              reject(new N8nError('n8n returned invalid JSON'))
            }
          })
        }
      )
      req.on('error', () =>
        reject(new N8nError('n8n connection unavailable or timed out', 0, 0, true))
      )
      req.end()
    })
  }
}
