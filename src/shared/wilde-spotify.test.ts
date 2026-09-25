import { describe, expect, it } from 'vitest'
import { DEFAULT_WILDE_SPOTIFY_CONFIG, normalizeWildeSpotifyConfig } from './wilde-spotify'

describe('normalizeWildeSpotifyConfig', () => {
  it('defaults to enabled with no client id', () => {
    expect(normalizeWildeSpotifyConfig(undefined)).toEqual(DEFAULT_WILDE_SPOTIFY_CONFIG)
    expect(normalizeWildeSpotifyConfig('nope')).toEqual({ enabled: true, clientId: null })
  })

  it('keeps a well-formed client id and an explicit off', () => {
    expect(
      normalizeWildeSpotifyConfig({ enabled: false, clientId: ' 0123456789abcdef0123456789abcdef ' })
    ).toEqual({ enabled: false, clientId: '0123456789abcdef0123456789abcdef' })
  })

  it('drops client ids that are not plain alphanumerics', () => {
    expect(normalizeWildeSpotifyConfig({ clientId: 'abc' }).clientId).toBeNull()
    expect(normalizeWildeSpotifyConfig({ clientId: '0123456789abcdef/../x' }).clientId).toBeNull()
  })
})
