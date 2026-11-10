import 'server-only'

/**
 * Server-side fetch for third-party feeds. Errors carry the status and any Retry-After so the
 * cache can back off. Messages never include the request URL: some upstreams (NASA FIRMS)
 * put the API key in the path, and error text can end up in logs or responses.
 */
export const USER_AGENT = 'AEGIS/0.1 (https://github.com/frankyu77)'

export class UpstreamError extends Error {
  constructor(
    readonly source: string,
    readonly status: number,
    /** Server-requested wait before retrying, if it sent one. */
    readonly retryAfterMs: number | null,
  ) {
    super(`${source}: HTTP ${status}`)
    this.name = 'UpstreamError'
  }

  /** Throttled or refused: the cache should cool down rather than retry immediately. */
  get isRateLimit(): boolean {
    return this.status === 429 || this.status === 403
  }
}

function parseRetryAfter(headers: Headers): number | null {
  const custom = headers.get('x-rate-limit-retry-after-seconds')
  const value = custom ?? headers.get('retry-after')
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null
}

export interface UpstreamInit {
  /** Short label for errors and logs, e.g. "opensky" (never the URL). */
  source: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  /** Responses larger than this are rejected (bytes). */
  maxBytes?: number
}

export async function fetchUpstream(url: string, init: UpstreamInit): Promise<{ text: string; headers: Headers }> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { 'User-Agent': USER_AGENT, ...init.headers },
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
      cache: 'no-store',
    })
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network error'
    throw new UpstreamError(init.source, reason === 'timeout' ? 504 : 502, null)
  }
  if (!res.ok) {
    // Drain so the connection can be reused; the body itself is never surfaced.
    await res.arrayBuffer().catch(() => undefined)
    throw new UpstreamError(init.source, res.status, parseRetryAfter(res.headers))
  }
  const text = await res.text()
  if (init.maxBytes && text.length > init.maxBytes) throw new UpstreamError(init.source, 502, null)
  return { text, headers: res.headers }
}
