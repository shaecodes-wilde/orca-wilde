import { isIP } from 'node:net'

export function normalizeApiBase(input: string, fixtureHttp = false): string {
  if (input.length > 2048 || /[%\\]/.test(input) || /(?:^|\/)\.\.(?:\/|$)/.test(input)) {
    throw new Error('Invalid n8n instance path')
  }
  const url = new URL(input)
  if (url.username || url.password || url.hash || url.search) {
    throw new Error('Use an instance URL without credentials, query or fragment')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (
    url.protocol !== 'https:' &&
    !(fixtureHttp && url.protocol === 'http:' && ['127.0.0.1', '::1'].includes(host))
  ) {
    throw new Error('n8n requires HTTPS')
  }
  if (isIP(host) && forbiddenAddress(host)) {
    throw new Error('Forbidden n8n network address')
  }
  const path = url.pathname.replace(/\/+$/, '')
  if (path.endsWith('/api/v1/api/v1')) {
    throw new Error('Duplicate n8n API prefix')
  }
  url.pathname = path.endsWith('/api/v1') ? path : `${path}/api/v1`
  return url.toString().replace(/\/$/, '')
}

export function forbiddenAddress(address: string): boolean {
  const lower = address.toLowerCase().split('%')[0]
  if (lower.includes(':')) {
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice(7)
      if (mapped.includes('.')) {
        return forbiddenAddress(mapped)
      }
      const parts = mapped.split(':')
      if (parts.length !== 2) {
        return true
      }
      const first = Number.parseInt(parts[0], 16)
      const second = Number.parseInt(parts[1], 16)
      return forbiddenAddress(`${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`)
    }
    return (
      lower === 'fd00:ec2::254' ||
      (lower !== '::1' && !/^(?:[23][0-9a-f]{3}:|f[cd][0-9a-f]{2}:)/.test(lower)) ||
      /^(?:2001:0:|2001::|2002:)/.test(lower)
    )
  }
  const [a, b] = lower.split('.').map(Number)
  return a === 0 || (a === 169 && b === 254) || a >= 224 || (a === 100 && b >= 64 && b <= 127)
}
