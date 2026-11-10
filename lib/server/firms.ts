import 'server-only'
import { cached, type CachedResult } from './feed-cache'
import { fetchUpstream } from './upstream'
import type { FireRow } from '../feeds/types'
import { snapBbox, type Bbox } from '../feeds/bbox'

/**
 * NASA FIRMS active fires (VIIRS NOAA-20, last 24 h) for an area. Needs FIRMS_MAP_KEY
 * (server-only); without it the layer is skipped. The quota is 5,000 transactions per
 * 10 minutes per key, and detections update a few times a day, so areas are snapped to a
 * 5° grid and cached 30 min. The key sits in the URL path, so errors never echo the URL.
 */
const TTL_MS = 30 * 60_000
const GRID_DEG = 5

export function firmsKey(): string | null {
  const key = process.env.FIRMS_MAP_KEY?.trim()
  return key ? key : null
}

export function parseFirmsCsv(csv: string): FireRow[] {
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].split(',')
  const col = (name: string) => header.indexOf(name)
  const iLat = col('latitude')
  const iLon = col('longitude')
  const iBright = col('bright_ti4')
  const iFrp = col('frp')
  const iConf = col('confidence')
  const iDate = col('acq_date')
  const iTime = col('acq_time')
  if (iLat < 0 || iLon < 0) return []
  const rows: FireRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',')
    const lat = Number(c[iLat])
    const lon = Number(c[iLon])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const hhmm = (c[iTime] ?? '0000').padStart(4, '0')
    const acquired = Date.parse(`${c[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`)
    rows.push([lat, lon, Number(c[iBright]) || 0, Number(c[iFrp]) || 0, c[iConf] ?? '', Number.isFinite(acquired) ? acquired : 0])
  }
  return rows
}

export function getFires(bbox: Bbox, key: string): Promise<CachedResult<FireRow[]>> {
  // A view across the antimeridian (west > east) takes the full longitude band.
  const area = snapBbox(bbox.west <= bbox.east ? bbox : { ...bbox, west: -180, east: 180 }, GRID_DEG)
  const areaParam = `${area.west},${area.south},${area.east},${area.north}`
  return cached<FireRow[]>({
    key: `firms:${areaParam}`,
    host: 'firms',
    ttlMs: TTL_MS,
    load: async () => {
      const { text } = await fetchUpstream(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_NOAA20_NRT/${areaParam}/1`,
        { source: 'firms', timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 },
      )
      return parseFirmsCsv(text)
    },
  })
}
