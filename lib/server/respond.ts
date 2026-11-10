import 'server-only'
import { gzipSync } from 'node:zlib'
import { NextResponse } from 'next/server'
import { FeedUnavailableError } from './feed-cache'
import type { FeedErrorResponse } from '../feeds/types'

/**
 * JSON with cache headers: browsers always revalidate (max-age=0) so polling sees fresh data;
 * a shared CDN may hold it for `sMaxAge` seconds. The in-process feed cache is the real
 * rate-limit guard; these headers only matter when deployed behind a CDN.
 *
 * Large bodies are gzipped here when the client accepts it: `next start` did not compress
 * route-handler responses (the global flights feed went out as ~700 KB of raw JSON).
 */
const GZIP_MIN_BYTES = 16 * 1024

export function feedJson<T>(request: Request, body: T, sMaxAge: number): NextResponse {
  const json = JSON.stringify(body)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`,
    Vary: 'Accept-Encoding',
  }
  const acceptsGzip = /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')
  if (acceptsGzip && json.length >= GZIP_MIN_BYTES) {
    const gz = gzipSync(json, { level: 6 })
    return new NextResponse(new Uint8Array(gz), { headers: { ...headers, 'Content-Encoding': 'gzip' } })
  }
  return new NextResponse(json, { headers })
}

export function feedError(error: unknown): NextResponse<FeedErrorResponse> {
  const retryAfterMs = error instanceof FeedUnavailableError ? error.retryAfterMs : 15_000
  return NextResponse.json(
    { error: error instanceof FeedUnavailableError ? `${error.host} unavailable` : 'feed unavailable', retryAfterMs },
    { status: 503, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)), 'Cache-Control': 'no-store' } },
  )
}

export function badRequest(message: string): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
}
