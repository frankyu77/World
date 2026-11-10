import 'server-only'
import { cached } from './feed-cache'
import { fetchUpstream } from './upstream'

/**
 * Keyless city population:
 *  1. Resolve the place in OpenStreetMap: by the exact OSM object the user picked in search
 *     (`osmRef`, e.g. "R1543125"), or by name for preset cities. Reverse geocoding a city's
 *     center is not used: it lands on a district (Tokyo -> Chiyoda ward, 46k).
 *  2. Prefer Wikidata's P1082 (population) for its wikidata id: dated, and the preferred-rank
 *     or most recent value. Fall back to the OSM `population` tag.
 * Cached 7 days (populations don't change faster); Nominatim's policy is <= 1 req/s with an
 * identifying User-Agent, and Wikidata's API is keyless (data CC0).
 */
export interface Population {
  value: number
  year: number | null
  source: 'Wikidata' | 'OpenStreetMap'
}

const TTL_MS = 7 * 24 * 3600_000

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseCount(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const n = Number(String(v).replace(/[\s,_]/g, '').replace(/^\+/, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

async function resolvePlace(osmRef: string | null, name: string): Promise<{ osmPop: number | null; wikidata: string | null }> {
  const url = osmRef
    ? `https://nominatim.openstreetmap.org/lookup?osm_ids=${encodeURIComponent(osmRef)}&format=jsonv2&extratags=1`
    : `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: name, format: 'jsonv2', limit: '1', extratags: '1', featureType: 'city' })}`
  const { text } = await fetchUpstream(url, { source: 'nominatim', timeoutMs: 3_000 })
  const parsed: unknown = JSON.parse(text)
  const first = Array.isArray(parsed) ? parsed[0] : null
  const tags = isRecord(first) && isRecord(first.extratags) ? first.extratags : {}
  const wikidata = typeof tags.wikidata === 'string' && /^Q\d+$/.test(tags.wikidata) ? tags.wikidata : null
  return { osmPop: parseCount(tags.population), wikidata }
}

/** Wikidata P1082: preferred rank first, else the claim with the latest point in time (P585). */
async function wikidataPopulation(id: string): Promise<{ value: number; year: number | null } | null> {
  const { text } = await fetchUpstream(
    `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${id}&property=P1082&format=json`,
    { source: 'wikidata', timeoutMs: 3_000 },
  )
  const parsed: unknown = JSON.parse(text)
  const claims = isRecord(parsed) && isRecord(parsed.claims) && Array.isArray(parsed.claims.P1082) ? parsed.claims.P1082 : []
  let best: { value: number; year: number | null; preferred: boolean } | null = null
  for (const c of claims) {
    if (!isRecord(c) || c.rank === 'deprecated' || !isRecord(c.mainsnak) || !isRecord(c.mainsnak.datavalue)) continue
    const dv = c.mainsnak.datavalue.value
    const value = isRecord(dv) ? parseCount(dv.amount) : null
    if (!value) continue
    let year: number | null = null
    const q = isRecord(c.qualifiers) && Array.isArray(c.qualifiers.P585) ? c.qualifiers.P585[0] : null
    if (isRecord(q) && isRecord(q.datavalue) && isRecord(q.datavalue.value) && typeof q.datavalue.value.time === 'string') {
      const m = /^[+-](\d{4})/.exec(q.datavalue.value.time)
      year = m ? Number(m[1]) : null
    }
    const preferred = c.rank === 'preferred'
    const better =
      !best ||
      (preferred && !best.preferred) ||
      (preferred === best.preferred && (year ?? 0) > (best.year ?? 0))
    if (better) best = { value, year, preferred }
  }
  return best ? { value: best.value, year: best.year } : null
}

export async function getPopulation(input: { osmRef: string | null; name: string }): Promise<Population | null> {
  const key = input.osmRef ? `pop:${input.osmRef}` : `pop:name:${input.name.toLowerCase()}`
  try {
    const r = await cached<Population | null>({
      key,
      host: 'nominatim',
      ttlMs: TTL_MS,
      load: async () => {
        const place = await resolvePlace(input.osmRef, input.name)
        if (place.wikidata) {
          try {
            const wd = await wikidataPopulation(place.wikidata)
            if (wd) return { ...wd, source: 'Wikidata' }
          } catch {
            // Fall through to the OSM tag.
          }
        }
        return place.osmPop ? { value: place.osmPop, year: null, source: 'OpenStreetMap' } : null
      },
    })
    return r.value
  } catch {
    return null
  }
}
