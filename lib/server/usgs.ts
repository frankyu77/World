import 'server-only'
import { cached, type CachedResult } from './feed-cache'
import { fetchUpstream } from './upstream'
import type { QuakeRow } from '../feeds/types'

/** USGS past-day earthquakes (all magnitudes, ~200-400 events). The feed itself sends max-age=60. */
const URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function getQuakes(): Promise<CachedResult<QuakeRow[]>> {
  return cached<QuakeRow[]>({
    key: 'usgs:all_day',
    host: 'usgs',
    ttlMs: 60_000,
    load: async () => {
      const { text } = await fetchUpstream(URL, { source: 'usgs', timeoutMs: 15_000, maxBytes: 8 * 1024 * 1024 })
      const parsed: unknown = JSON.parse(text)
      const features = isRecord(parsed) && Array.isArray(parsed.features) ? parsed.features : []
      const rows: QuakeRow[] = []
      for (const f of features) {
        if (!isRecord(f) || !isRecord(f.properties) || !isRecord(f.geometry)) continue
        const c = f.geometry.coordinates
        const p = f.properties
        if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue
        if (typeof p.mag !== 'number' || typeof p.time !== 'number') continue
        rows.push([
          typeof f.id === 'string' ? f.id : String(p.time),
          c[1],
          c[0],
          typeof c[2] === 'number' ? c[2] : 0,
          p.mag,
          p.time,
          typeof p.place === 'string' ? p.place : '',
          typeof p.url === 'string' ? p.url : '',
        ])
      }
      return rows
    },
  })
}
