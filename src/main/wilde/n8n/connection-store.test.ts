import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { N8nConnectionStore } from './connection-store'
import type { SecretStore } from '../../../shared/secret-store'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})
function profile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'wilde-n8n-vault-'))
  directories.push(directory)
  return directory
}
const keychainFixture: SecretStore = {
  isEncryptionAvailable: () => true,
  describeProtectionGap: () => null,
  encryptString: (text) => Buffer.from(text.split('').toReversed().join('')),
  decryptString: (bytes) => bytes.toString().split('').toReversed().join('')
}
describe('profile-local connection envelope', () => {
  it('allows pausing an unconfigured profile but refuses enabling without configuration', () => {
    const store = new N8nConnectionStore(profile(), keychainFixture)
    expect(() => store.setEnabled(false)).not.toThrow()
    expect(store.load()).toBeNull()
    expect(() => store.setEnabled(true)).toThrow('Cannot read')
  })
  it('refuses to treat corrupt or unreadable configuration as safely paused', () => {
    const directory = profile()
    const path = join(directory, 'wilde-business', 'n8n-connection.enc.json')
    mkdirSync(join(directory, 'wilde-business'))
    writeFileSync(path, '{broken envelope')
    const store = new N8nConnectionStore(directory, keychainFixture)
    expect(() => store.setEnabled(false)).toThrow('Cannot safely change')
    expect(readFileSync(path, 'utf8')).toBe('{broken envelope')
    const unreadable = profile()
    mkdirSync(join(unreadable, 'wilde-business', 'n8n-connection.enc.json'), { recursive: true })
    expect(() => new N8nConnectionStore(unreadable, keychainFixture).setEnabled(false)).toThrow(
      'Cannot read'
    )
  })
  it('reloads only a protected envelope and preserves instance identity and blank-key updates', () => {
    const directory = profile()
    const store = new N8nConnectionStore(directory, keychainFixture)
    const connection = store.save({
      label: 'Example',
      baseUrl: 'https://example.org',
      apiKey: 'fixture-secret',
      enabled: true
    })
    expect(
      readFileSync(join(directory, 'wilde-business', 'n8n-connection.enc.json'), 'utf8')
    ).not.toContain('fixture-secret')
    const reload = new N8nConnectionStore(directory, keychainFixture)
    expect(reload.load()).toEqual(connection)
    expect(
      reload.save({
        label: 'Renamed',
        baseUrl: 'https://example.org/api/v1',
        apiKey: '',
        enabled: false
      }).instanceId
    ).toBe(connection.instanceId)
    expect(reload.load()?.apiKey).toBe('fixture-secret')
    const storedBefore = readFileSync(
      join(directory, 'wilde-business', 'n8n-connection.enc.json'),
      'utf8'
    )
    reload.setEnabled(true)
    expect(reload.load()?.enabled).toBe(true)
    reload.setEnabled(false)
    expect(readFileSync(join(directory, 'wilde-business', 'n8n-connection.enc.json'), 'utf8')).toBe(
      storedBefore
    )
    expect(() =>
      reload.save({ label: 'Other', baseUrl: 'https://other.example', apiKey: '', enabled: true })
    ).toThrow('API key')
  })
  it('fails closed when the OS reports unavailable encryption or basic_text protection', () => {
    for (const secrets of [
      { ...keychainFixture, isEncryptionAvailable: () => false },
      { ...keychainFixture, describeProtectionGap: () => 'basic_text provides no protection' }
    ]) {
      const store = new N8nConnectionStore(profile(), secrets)
      expect(() =>
        store.save({
          label: 'Example',
          baseUrl: 'https://example.org',
          apiKey: 'secret',
          enabled: true
        })
      ).toThrow('OS-protected')
      expect(store.load()).toBeNull()
    }
  })
})
