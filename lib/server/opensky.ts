import 'server-only'
import { cached, type CachedResult } from './feed-cache'
import { fetchUpstream, UpstreamError } from './upstream'
import type { AircraftRow } from '../feeds/types'

/**
 * OpenSky Network global state vectors, authenticated with OAuth2 client credentials
 * (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET, server-only) for 4000 credits/day instead of
 * 400 anonymously. A global /states/all costs 4 credits, so the budget allows ~1000
 * snapshots/day: the TTL adapts to the credits left before the daily reset (00:00 UTC),
 * read from X-Rate-Limit-Remaining. One snapshot serves every client and every view; the
 * route filters it to the requested bbox.
 *
 * Credentials are never logged or returned: token-endpoint failures are reduced to a status.
 */
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
const STATES_URL = 'https://opensky-network.org/api/states/all'
const CREDITS_PER_GLOBAL_CALL = 4
const DEFAULT_TTL_MS = 90_000
const MIN_TTL_MS = 20_000
const MAX_TTL_MS = 30 * 60_000

interface TokenState {
  token: string | null
  expiresAt: number
  pending: Promise<string | null> | null
  authFailed: boolean
  creditsRemaining: number | null
}
const g = globalThis as typeof globalThis & { __aegisOpenSky?: TokenState }
const state: TokenState = (g.__aegisOpenSky ??= {
  token: null,
  expiresAt: 0,
  pending: null,
  authFailed: false,
  creditsRemaining: null,
})

export function hasOpenSkyCredentials(): boolean {
  return Boolean(process.env.OPENSKY_CLIENT_ID?.trim() && process.env.OPENSKY_CLIENT_SECRET?.trim())
}

async function getToken(): Promise<string | null> {
  if (!hasOpenSkyCredentials()) return null
  if (state.token && Date.now() < state.expiresAt - 60_000) return state.token
  if (state.pending) return state.pending
  state.pending = (async () => {
    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.OPENSKY_CLIENT_ID?.trim() ?? '',
        client_secret: process.env.OPENSKY_CLIENT_SECRET?.trim() ?? '',
      }).toString()
      const { text } = await fetchUpstream(TOKEN_URL, {
        source: 'opensky-auth',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        timeoutMs: 10_000,
      })
      const parsed: unknown = JSON.parse(text)
      const token = isRecord(parsed) && typeof parsed.access_token === 'string' ? parsed.access_token : null
      const expiresIn = isRecord(parsed) && typeof parsed.expires_in === 'number' ? parsed.expires_in : 1800
      if (!token) throw new Error('no access_token')
      state.token = token
      state.expiresAt = Date.now() + expiresIn * 1000
      if (state.authFailed) console.info('[opensky] authenticated')
      state.authFailed = false
      return token
    } catch (error) {
      // Status only: never the request body (it holds the secret).
      if (!state.authFailed) {
        const status = error instanceof UpstreamError ? `HTTP ${error.status}` : 'invalid response'
        console.warn(`[opensky] OAuth token request failed (${status}); using anonymous access`)
      }
      state.authFailed = true
      state.token = null
      return null
    } finally {
      state.pending = null
    }
  })()
  return state.pending
}

/** Spread the remaining daily credits evenly until the 00:00 UTC reset. */
function adaptiveTtl(): number {
  const remaining = state.creditsRemaining
  if (remaining === null) return DEFAULT_TTL_MS
  const now = new Date()
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  const callsLeft = Math.max(1, Math.floor(remaining / CREDITS_PER_GLOBAL_CALL))
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, (reset - now.getTime()) / callsLeft))
}

export interface OpenSkySnapshot {
  /** Data time reported by OpenSky (ms epoch). */
  snapshotAt: number
  authenticated: boolean
  rows: AircraftRow[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** OpenSky state vector -> compact row. Indices per https://openskynetwork.github.io/opensky-api/rest.html */
function toRow(s: unknown[], snapshotSec: number): AircraftRow | null {
  const lon = num(s[5])
  const lat = num(s[6])
  if (lat === null || lon === null) return null
  const timePosition = num(s[3]) ?? snapshotSec
  const alt = num(s[13]) ?? num(s[7])
  return [
    String(s[0] ?? ''),
    typeof s[1] === 'string' ? s[1].trim() : '',
    Math.round(lat * 1e5) / 1e5,
    Math.round(lon * 1e5) / 1e5,
    alt === null ? null : Math.round(alt),
    num(s[9]),
    num(s[10]),
    num(s[11]),
    s[8] === true ? 1 : 0,
    typeof s[14] === 'string' ? s[14] : null,
    null,
    Math.max(0, snapshotSec - timePosition),
  ]
}

export function getOpenSkySnapshot(): Promise<CachedResult<OpenSkySnapshot>> {
  return cached<OpenSkySnapshot>({
    key: 'opensky:global',
    host: 'opensky',
    ttlMs: adaptiveTtl,
    load: async () => {
      const token = await getToken()
      const { text, headers } = await fetchUpstream(STATES_URL, {
        source: 'opensky',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeoutMs: 20_000,
        maxBytes: 12 * 1024 * 1024,
      })
      const remaining = Number(headers.get('x-rate-limit-remaining'))
      if (Number.isFinite(remaining)) state.creditsRemaining = remaining
      const parsed: unknown = JSON.parse(text)
      if (!isRecord(parsed)) throw new UpstreamError('opensky', 502, null)
      const snapshotSec = num(parsed.time) ?? Date.now() / 1000
      const states = Array.isArray(parsed.states) ? parsed.states : []
      const rows: AircraftRow[] = []
      for (const s of states) {
        if (!Array.isArray(s)) continue
        const row = toRow(s, snapshotSec)
        if (row) rows.push(row)
      }
      return { snapshotAt: snapshotSec * 1000, authenticated: token !== null, rows }
    },
  })
}

/** Budget telemetry for the response (never the token). */
export function openSkyBudget(): { creditsRemaining: number | null; ttlMs: number } {
  return { creditsRemaining: state.creditsRemaining, ttlMs: adaptiveTtl() }
}
