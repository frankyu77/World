import 'server-only'
import { cached } from './feed-cache'
import { fetchUpstream } from './upstream'

/**
 * Points of interest near a city: Wikipedia GeoSearch (keyless, ~0.4 s, CC BY-SA). The previous
 * source, the public Overpass instance, routinely took 10-60 s and timed out.
 *
 * Wikipedia geotags many articles *about* a city (events, history, organisations) to its
 * centroid, so results are filtered to real places: coordinate type present and not
 * city/event/country/admin area; nothing within 15 m of the centroid; no "Timeline of ..."
 * style titles. Cached 24 h per ~100 m cell; Wikimedia rate-limits anonymous clients (429 with
 * Retry-After), which the shared "wikipedia" cooldown honours.
 */
export interface Poi {
  name: string
  /** Display distance ("250 m", "1.2 km"); the panel shows it where a type label would go. */
  type: string
  distance: number
}

const NOT_PLACES = new Set(['city', 'event', 'country', 'adm1st', 'adm2nd', 'adm3rd', 'region'])
const TTL_MS = 24 * 3600_000

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export async function getPois(lat: number, lng: number, cityName: string): Promise<Poi[]> {
  const city = cityName.trim().toLowerCase()
  try {
    const r = await cached<Poi[]>({
      key: `pois:${lat.toFixed(3)}:${lng.toFixed(3)}`,
      host: 'wikipedia',
      ttlMs: TTL_MS,
      load: async () => {
        const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
          action: 'query',
          list: 'geosearch',
          gscoord: `${lat}|${lng}`,
          gsradius: '3000',
          gslimit: '30',
          gsprop: 'type',
          format: 'json',
        })}`
        const { text } = await fetchUpstream(url, { source: 'wikipedia', timeoutMs: 3_000 })
        const data: unknown = JSON.parse(text)
        const list = isRecord(data) && isRecord(data.query) && Array.isArray(data.query.geosearch) ? data.query.geosearch : []
        const pois: Poi[] = []
        for (const item of list) {
          if (!isRecord(item) || typeof item.title !== 'string' || typeof item.dist !== 'number') continue
          const title = item.title
          const type = typeof item.type === 'string' ? item.type : null
          if (!type || NOT_PLACES.has(type)) continue
          if (item.dist < 15 || title.toLowerCase() === city) continue
          if (/^\d{4}\b/.test(title) || /^(timeline|history|list|outline) of\b/i.test(title)) continue
          const dist = item.dist
          pois.push({ name: title, type: dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`, distance: dist })
        }
        return pois.slice(0, 8)
      },
    })
    return r.value
  } catch {
    // Cooling down or failed with nothing cached: the panel omits the section.
    return []
  }
}
