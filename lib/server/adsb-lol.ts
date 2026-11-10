import 'server-only'
import { cached, type CachedResult } from './feed-cache'
import { fetchUpstream, UpstreamError } from './upstream'
import type { AircraftRow } from '../feeds/types'

/**
 * adsb.lol point query (keyless, community ADS-B; ODbL). Radius is capped at 250 nm by the API.
 * The center is snapped to a 0.5° grid and the radius rounded up to 25 nm so nearby views
 * share one cache entry; a 10 s TTL matches how fast aircraft positions change.
 */
const MAX_RADIUS_NM = 250
const GRID_DEG = 0.5
const TTL_MS = 10_000
const FT_TO_M = 0.3048
const KT_TO_MS = 0.514444
const FPM_TO_MS = 0.00508

export interface AdsbSnapshot {
  snapshotAt: number
  rows: AircraftRow[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function toRow(a: Record<string, unknown>): AircraftRow | null {
  const lat = num(a.lat)
  const lon = num(a.lon)
  if (lat === null || lon === null || typeof a.hex !== 'string') return null
  const onGround = a.alt_baro === 'ground'
  const altFt = onGround ? 0 : (num(a.alt_geom) ?? num(a.alt_baro))
  const gs = num(a.gs)
  const rate = num(a.baro_rate) ?? num(a.geom_rate)
  return [
    a.hex.replace(/^~/, '').toLowerCase(),
    typeof a.flight === 'string' ? a.flight.trim() : '',
    Math.round(lat * 1e5) / 1e5,
    Math.round(lon * 1e5) / 1e5,
    altFt === null ? null : Math.round(altFt * FT_TO_M),
    gs === null ? null : Math.round(gs * KT_TO_MS * 10) / 10,
    num(a.track) ?? num(a.true_heading),
    rate === null ? null : Math.round(rate * FPM_TO_MS * 10) / 10,
    onGround ? 1 : 0,
    typeof a.squawk === 'string' ? a.squawk : null,
    typeof a.t === 'string' ? a.t : null,
    num(a.seen_pos) ?? 0,
  ]
}

export function snapPointQuery(lat: number, lon: number, radiusKm: number): { lat: number; lon: number; nm: number } {
  const snap = (v: number) => Math.round(v / GRID_DEG) * GRID_DEG
  // Snapping moves the center up to ~0.35° (~40 km); widen the radius to compensate.
  const nm = Math.min(MAX_RADIUS_NM, Math.ceil((radiusKm / 1.852 + 25) / 25) * 25)
  return { lat: snap(lat), lon: snap(lon), nm }
}

export function getAdsbPoint(lat: number, lon: number, nm: number): Promise<CachedResult<AdsbSnapshot>> {
  return cached<AdsbSnapshot>({
    key: `adsb:${lat}:${lon}:${nm}`,
    host: 'adsb.lol',
    ttlMs: TTL_MS,
    load: async () => {
      const { text } = await fetchUpstream(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}`, {
        source: 'adsb.lol',
        timeoutMs: 12_000,
        maxBytes: 8 * 1024 * 1024,
      })
      const parsed: unknown = JSON.parse(text)
      if (!isRecord(parsed)) throw new UpstreamError('adsb.lol', 502, null)
      const list = Array.isArray(parsed.ac) ? parsed.ac : []
      const rows: AircraftRow[] = []
      for (const a of list) {
        if (!isRecord(a)) continue
        const row = toRow(a)
        if (row) rows.push(row)
      }
      return { snapshotAt: num(parsed.now) ?? Date.now(), rows }
    },
  })
}

export const ADSB_MAX_RADIUS_KM = MAX_RADIUS_NM * 1.852
