import 'server-only'
import { UpstreamError } from './upstream'

/**
 * In-memory cache for third-party feeds, shared by every client of this server process:
 *  - TTL per key (fixed or computed from the previous result, e.g. OpenSky's credit budget);
 *  - one in-flight refresh per key (concurrent requests share it);
 *  - serve the last good value when the upstream fails;
 *  - cooldown per upstream host on 429/403, honouring Retry-After (bounded 30 s - 30 min);
 *    a short cooldown after other failures so a dead upstream isn't hammered.
 * Lives on globalThis so dev hot-reloads keep the cache and its rate-limit state. Per-process:
 * right for `next dev` / `next start`; serverless instances would each hold their own.
 */
interface Entry<T> {
  value: T
  fetchedAt: number
}
interface Slot {
  entry?: Entry<unknown>
  inflight?: Promise<Entry<unknown>>
  lastUsed: number
}
interface Store {
  slots: Map<string, Slot>
  cooldownUntil: Map<string, number>
}

const g = globalThis as typeof globalThis & { __aegisFeedStore?: Store }
const store: Store = (g.__aegisFeedStore ??= { slots: new Map(), cooldownUntil: new Map() })

const MAX_SLOTS = 400
const RATE_LIMIT_MIN_MS = 30_000
const RATE_LIMIT_MAX_MS = 30 * 60_000
const RATE_LIMIT_DEFAULT_MS = 2 * 60_000
const FAILURE_COOLDOWN_MS = 15_000

export interface CachedResult<T> {
  value: T
  fetchedAt: number
  /** True when served past its TTL because the upstream failed or is cooling down. */
  stale: boolean
}

export class FeedUnavailableError extends Error {
  constructor(
    readonly host: string,
    readonly retryAfterMs: number,
  ) {
    super(`${host} unavailable`)
    this.name = 'FeedUnavailableError'
  }
}

function evictIfFull(): void {
  if (store.slots.size <= MAX_SLOTS) return
  const idle = [...store.slots.entries()].filter(([, s]) => !s.inflight).sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  for (const [key] of idle.slice(0, store.slots.size - MAX_SLOTS)) store.slots.delete(key)
}

export interface CacheOptions<T> {
  key: string
  /** Upstream host group sharing one cooldown (e.g. "celestrak" for all its groups). */
  host: string
  ttlMs: number | ((previous: Entry<T> | undefined) => number)
  load: () => Promise<T>
}

export async function cached<T>({ key, host, ttlMs, load }: CacheOptions<T>): Promise<CachedResult<T>> {
  const now = Date.now()
  let slot = store.slots.get(key)
  if (!slot) {
    slot = { lastUsed: now }
    store.slots.set(key, slot)
    evictIfFull()
  }
  slot.lastUsed = now
  const entry = slot.entry as Entry<T> | undefined
  const ttl = typeof ttlMs === 'function' ? ttlMs(entry) : ttlMs
  if (entry && now - entry.fetchedAt < ttl) return { ...entry, stale: false }

  const coolUntil = store.cooldownUntil.get(host) ?? 0
  if (now < coolUntil) {
    if (entry) return { ...entry, stale: true }
    throw new FeedUnavailableError(host, coolUntil - now)
  }

  if (!slot.inflight) {
    const s = slot
    s.inflight = (async () => {
      try {
        const value = await load()
        const fresh: Entry<unknown> = { value, fetchedAt: Date.now() }
        s.entry = fresh
        return fresh
      } catch (error) {
        let wait = FAILURE_COOLDOWN_MS
        if (error instanceof UpstreamError && error.isRateLimit) {
          wait = Math.min(RATE_LIMIT_MAX_MS, Math.max(RATE_LIMIT_MIN_MS, error.retryAfterMs ?? RATE_LIMIT_DEFAULT_MS))
        }
        store.cooldownUntil.set(host, Date.now() + wait)
        console.warn(`[feeds] ${error instanceof Error ? error.message : 'upstream failure'}; cooling down ${host} ${Math.round(wait / 1000)}s`)
        throw error
      } finally {
        s.inflight = undefined
      }
    })()
  }

  try {
    const fresh = (await slot.inflight) as Entry<T>
    return { ...fresh, stale: false }
  } catch (error) {
    if (entry) return { ...entry, stale: true }
    const until = store.cooldownUntil.get(host) ?? Date.now()
    throw new FeedUnavailableError(host, Math.max(0, until - Date.now()))
  }
}
