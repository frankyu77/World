/**
 * Polls one /api/feeds route. Only one request is in flight; a newer refresh aborts the older
 * one (the view moved). A 503 from the route means the upstream is cooling down: wait for its
 * Retry-After instead of the normal interval. Never calls a third-party API directly.
 */
export interface Poller {
  /** Fetch now (debounced), e.g. after the view settles or the layer is enabled. */
  refresh(): void
  start(): void
  stop(): void
}

export interface PollerOptions<T> {
  /** URL to fetch, or null to skip (e.g. no view bounds yet). */
  url: () => string | null
  intervalMs: () => number
  onData: (data: T) => void
  /** Debounce for refresh() calls. */
  debounceMs?: number
}

export function createPoller<T>({ url, intervalMs, onData, debounceMs = 350 }: PollerOptions<T>): Poller {
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null
  let lastUrl: string | null = null

  const schedule = (ms: number) => {
    clearTimeout(timer)
    if (running) timer = setTimeout(run, ms)
  }

  const run = async () => {
    if (!running) return
    const target = url()
    if (!target) {
      schedule(intervalMs())
      return
    }
    controller?.abort()
    const mine = new AbortController()
    controller = mine
    lastUrl = target
    let next = intervalMs()
    try {
      const res = await fetch(target, { signal: mine.signal })
      if (res.status === 503) {
        const retry = Number(res.headers.get('Retry-After'))
        next = Math.max(next, Number.isFinite(retry) ? retry * 1000 : 30_000)
      } else if (res.ok) {
        const data = (await res.json()) as T
        if (!mine.signal.aborted && running) onData(data)
      }
    } catch {
      if (mine.signal.aborted) return // superseded; the newer request reschedules
    } finally {
      if (controller === mine) controller = null
    }
    schedule(next)
  }

  return {
    refresh() {
      if (!running) return
      const target = url()
      // Same request already pending or just made by the interval: no need to repeat it.
      if (target !== null && target === lastUrl && controller) return
      schedule(debounceMs)
    },
    start() {
      if (running) return
      running = true
      schedule(0)
    },
    stop() {
      running = false
      clearTimeout(timer)
      controller?.abort()
      controller = null
      lastUrl = null
    },
  }
}
