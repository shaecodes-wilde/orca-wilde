import { describe, expect, it, vi } from 'vitest'
import { collectRecentContexts, WildeSpotifyApi } from './spotify-web-api'
import type { WildeSpotifyAuth } from './spotify-auth'

function played(albumUri: string, context: { type: string; uri: string } | null) {
  return {
    played_at: '2026-09-25T10:00:00Z',
    context,
    track: {
      album: {
        uri: albumUri,
        name: `Album ${albumUri}`,
        artists: [{ name: 'Yeat' }],
        images: [{ url: 'big' }, { url: 'small' }]
      }
    }
  }
}

function fakeAuth(tokens: string[]) {
  const getAccessToken = vi.fn()
  for (const token of tokens) {
    getAccessToken.mockResolvedValueOnce(token)
  }
  getAccessToken.mockResolvedValue(tokens.at(-1))
  const auth = { getAccessToken, invalidate: vi.fn() }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the client only calls getAccessToken/invalidate.
  return { auth, asAuth: auth as unknown as WildeSpotifyAuth }
}

describe('collectRecentContexts', () => {
  it('dedupes by context, falls back to the album, and flags playlists for lookup', () => {
    const { contexts, needsLookup } = collectRecentContexts({
      items: [
        played('spotify:album:a', { type: 'album', uri: 'spotify:album:a' }),
        played('spotify:album:a', { type: 'album', uri: 'spotify:album:a' }),
        played('spotify:album:b', { type: 'playlist', uri: 'spotify:playlist:p' }),
        played('spotify:album:c', null)
      ]
    })
    expect(contexts.map((entry) => entry.uri)).toEqual([
      'spotify:album:a',
      'spotify:playlist:p',
      'spotify:album:c'
    ])
    expect(contexts[0]).toMatchObject({ kind: 'album', subtitle: 'Yeat', imageUrl: 'small' })
    expect(needsLookup.map((entry) => entry.uri)).toEqual(['spotify:playlist:p'])
  })

  it('tolerates malformed bodies', () => {
    expect(collectRecentContexts(null).contexts).toEqual([])
    expect(collectRecentContexts({ items: [null, { track: 'x' }] }).contexts).toEqual([])
  })
})

describe('WildeSpotifyApi.request', () => {
  it('refreshes the token once on 401 and retries', async () => {
    const { auth, asAuth } = fakeAuth(['old', 'new'])
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ display_name: 'Shae' }), { status: 200 }))
    const api = new WildeSpotifyApi(asAuth, fetchImpl)

    await expect(api.getDisplayName()).resolves.toBe('Shae')
    expect(auth.invalidate).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer new')
  })

  it('turns rate limits and a missing desktop device into readable errors', async () => {
    const { asAuth } = fakeAuth(['t'])
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '7' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ devices: [] }), { status: 200 }))
    const api = new WildeSpotifyApi(asAuth, fetchImpl)

    await expect(api.seek(1000)).rejects.toThrow('try again in 7 seconds')
    await expect(api.playContext('spotify:album:a')).rejects.toThrow('open on this PC')
  })

  it('plays a context on the desktop app, preferring the active computer', async () => {
    const { asAuth } = fakeAuth(['t'])
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            devices: [
              { id: 'phone', type: 'Smartphone', is_active: true },
              { id: 'pc', type: 'Computer', is_active: false }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const api = new WildeSpotifyApi(asAuth, fetchImpl)

    await api.playContext('spotify:album:a')
    expect(fetchImpl.mock.calls[1][0]).toContain('/me/player/play?device_id=pc')
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ context_uri: 'spotify:album:a' })
  })
})
