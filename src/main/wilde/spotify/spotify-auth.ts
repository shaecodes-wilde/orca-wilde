import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { shell } from 'electron'
import { isPlainRecord, WILDE_SPOTIFY_REDIRECT_PORT, WILDE_SPOTIFY_REDIRECT_URI } from '../../../shared/wilde-spotify'
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from './spotify-store'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
export const WILDE_SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-recently-played',
  'user-library-read',
  'user-library-modify'
].join(' ')

const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>Spotify connected</title>
<body style="background:#0b0c10;color:#f8f8fa;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="color:#8bd8b0;font-size:22px;margin-bottom:8px">Spotify connected</div>
You can close this tab and return to Orca.</div></body>`

// Why local helpers rather than orca-profiles/profile-cloud-pkce.ts: those are module-private and
// bind a random port; Spotify needs the fixed, pre-registered redirect.
function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

type TokenResponse = { accessToken: string; refreshToken: string | null; expiresAtMs: number }

function parseTokenResponse(body: unknown): TokenResponse {
  if (!isPlainRecord(body) || typeof body.access_token !== 'string') {
    const reason = isPlainRecord(body) && typeof body.error_description === 'string' ? body.error_description : 'unexpected response'
    throw new Error(`Spotify sign-in failed: ${reason}`)
  }
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    // Refresh a minute early so a request never races expiry.
    expiresAtMs: Date.now() + (expiresIn - 60) * 1000
  }
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  return parseTokenResponse(await response.json().catch(() => null))
}

function waitForAuthorizationCode(expectedState: string): { ready: Promise<void>; code: Promise<string>; server: Server } {
  let resolveCode: (code: string) => void = () => {}
  let rejectCode: (error: Error) => void = () => {}
  const code = new Promise<string>((resolvePromise, rejectPromise) => {
    resolveCode = resolvePromise
    rejectCode = rejectPromise
  })
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', WILDE_SPOTIFY_REDIRECT_URI)
    if (url.pathname !== '/callback') {
      response.writeHead(404).end()
      return
    }
    const error = url.searchParams.get('error')
    const receivedCode = url.searchParams.get('code')
    if (error || !receivedCode || url.searchParams.get('state') !== expectedState) {
      response.writeHead(400, { 'Content-Type': 'text/plain' }).end('Spotify sign-in was not completed.')
      rejectCode(new Error(error === 'access_denied' ? 'Spotify access was declined.' : 'Spotify sign-in was not completed.'))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(CALLBACK_PAGE)
    resolveCode(receivedCode)
  })
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      rejectPromise(
        new Error(
          error.code === 'EADDRINUSE'
            ? `Port ${WILDE_SPOTIFY_REDIRECT_PORT} is in use, so the Spotify sign-in callback can't be received. Close whatever is using it and try again.`
            : `Could not start the Spotify sign-in callback: ${error.message}`
        )
      )
    })
    server.listen(WILDE_SPOTIFY_REDIRECT_PORT, '127.0.0.1', () => resolvePromise())
  })
  return { ready, code, server }
}

function closeServer(server: Server): void {
  try {
    server.closeAllConnections?.()
    server.close()
  } catch {
    // Already closed.
  }
}

/** Holds the in-memory access token and refreshes it from the sealed refresh token on demand. */
export class WildeSpotifyAuth {
  private accessToken: string | null = null
  private expiresAtMs = 0
  private refreshing: Promise<string> | null = null

  constructor(private readonly getClientId: () => string | null) {}

  hasSession(): boolean {
    return readRefreshToken() !== null
  }

  /** Opens Spotify's consent page in the browser and completes the PKCE exchange. */
  async login(): Promise<void> {
    const clientId = this.getClientId()
    if (!clientId) {
      throw new Error('Add your Spotify Client ID first.')
    }
    const verifier = base64Url(randomBytes(48))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const state = base64Url(randomBytes(16))
    const { ready, code, server } = waitForAuthorizationCode(state)
    const timeout = setTimeout(() => closeServer(server), LOGIN_TIMEOUT_MS)
    try {
      await ready
      const authorizeUrl = new URL(AUTHORIZE_URL)
      authorizeUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: WILDE_SPOTIFY_SCOPES,
        redirect_uri: WILDE_SPOTIFY_REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state
      }).toString()
      await shell.openExternal(authorizeUrl.toString())
      const authorizationCode = await Promise.race([
        code,
        new Promise<never>((_, rejectPromise) =>
          setTimeout(() => rejectPromise(new Error('Spotify sign-in timed out.')), LOGIN_TIMEOUT_MS)
        )
      ])
      const tokens = await postToken({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: WILDE_SPOTIFY_REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier
      })
      if (!tokens.refreshToken) {
        throw new Error('Spotify did not return a refresh token.')
      }
      if (!writeRefreshToken(tokens.refreshToken)) {
        throw new Error('Windows secure storage is unavailable, so the Spotify login cannot be saved.')
      }
      this.accessToken = tokens.accessToken
      this.expiresAtMs = tokens.expiresAtMs
    } finally {
      clearTimeout(timeout)
      closeServer(server)
    }
  }

  logout(): void {
    this.accessToken = null
    this.expiresAtMs = 0
    clearRefreshToken()
  }

  /** Invalidates the cached access token so the next call refreshes (used after a 401). */
  invalidate(): void {
    this.accessToken = null
    this.expiresAtMs = 0
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAtMs) {
      return this.accessToken
    }
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async refresh(): Promise<string> {
    const clientId = this.getClientId()
    const refreshToken = readRefreshToken()
    if (!clientId || !refreshToken) {
      throw new WildeSpotifyNotConnectedError()
    }
    const tokens = await postToken({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId })
    // Why: Spotify may rotate the refresh token; the old one stops working once it does.
    if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
      writeRefreshToken(tokens.refreshToken)
    }
    this.accessToken = tokens.accessToken
    this.expiresAtMs = tokens.expiresAtMs
    return tokens.accessToken
  }
}

export class WildeSpotifyNotConnectedError extends Error {
  constructor() {
    super('Connect Spotify in Settings → Appearance → Wilde Systems.')
  }
}
