import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { SecretStore } from '../../../shared/secret-store'
import { writeSecureFile } from '../../../shared/secure-file'
import type { N8nConnection } from './connector-types'
import { normalizeApiBase } from './url-policy'

const envelope = z
  .object({
    version: z.literal(1),
    instanceId: z.string().uuid(),
    label: z.string().max(240),
    baseUrl: z.string().max(2048),
    enabled: z.boolean(),
    ciphertext: z.string().min(1).max(32000)
  })
  .strict()

export class N8nConnectionStore {
  private readonly path: string
  constructor(
    profileDirectory: string,
    private readonly secrets: SecretStore
  ) {
    this.path = join(profileDirectory, 'wilde-business', 'n8n-connection.enc.json')
  }
  private protected(): void {
    if (!this.secrets.isEncryptionAvailable() || this.secrets.describeProtectionGap() !== null) {
      throw new Error(
        'n8n credentials require an available OS-protected keychain; configuration was not changed'
      )
    }
  }
  load(): N8nConnection | null {
    let raw: string
    try {
      if (statSync(this.path).size > 40000) {
        throw new Error('Invalid n8n credential envelope')
      }
      raw = readFileSync(this.path, 'utf8')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw new Error('Cannot read the n8n connection; existing configuration was preserved')
    }
    this.protected()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Invalid n8n credential envelope')
    }
    const value = envelope.safeParse(parsed)
    if (!value.success) {
      throw new Error('Invalid n8n credential envelope')
    }
    const { ciphertext, version: _version, ...configuration } = value.data
    try {
      return {
        ...configuration,
        baseUrl: normalizeApiBase(configuration.baseUrl),
        apiKey: this.secrets.decryptString(Buffer.from(ciphertext, 'base64'))
      }
    } catch {
      throw new Error('Cannot unlock the n8n connection with this OS keychain')
    }
  }
  save(input: { label: string; baseUrl: string; apiKey: string; enabled: boolean }): N8nConnection {
    this.protected()
    const baseUrl = normalizeApiBase(input.baseUrl)
    if (
      !input.label.trim() ||
      input.label.length > 240 ||
      input.apiKey.length > 8000 ||
      /[\r\n]/.test(input.apiKey)
    ) {
      throw new Error('Invalid n8n connection fields')
    }
    const previous = this.load()
    const apiKey = input.apiKey || (previous?.baseUrl === baseUrl ? previous.apiKey : '')
    if (!apiKey) {
      throw new Error('An n8n API key is required')
    }
    const instanceId = previous?.baseUrl === baseUrl ? previous.instanceId : randomUUID()
    const connection = {
      instanceId,
      label: input.label.trim(),
      baseUrl,
      enabled: input.enabled,
      apiKey
    }
    const { apiKey: _apiKey, ...metadata } = connection
    writeSecureFile(
      this.path,
      JSON.stringify({
        version: 1,
        ...metadata,
        ciphertext: this.secrets.encryptString(apiKey).toString('base64')
      })
    )
    return connection
  }
  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.protected()
    }
    let raw: string
    try {
      if (statSync(this.path).size > 40000) {
        throw new Error('Invalid envelope')
      }
      raw = readFileSync(this.path, 'utf8')
    } catch (error) {
      if (
        !enabled &&
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return
      }
      throw new Error('Cannot read the n8n connection state; existing configuration was preserved')
    }
    try {
      const stored = envelope.parse(JSON.parse(raw))
      writeSecureFile(this.path, JSON.stringify({ ...stored, enabled }), { durable: true })
    } catch {
      throw new Error('Cannot safely change n8n connection state; check the saved configuration')
    }
  }
}
