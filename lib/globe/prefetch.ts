import type { GeoPoint } from './types'
import { ESRI_SUBDOMAINS, ESRI_TILE_TEMPLATE } from './imagery'
import { CITY_HEADING_DEG, CITY_PITCH_DEG, CITY_RANGE_METERS } from './camera'

/**
 * Warms the browser HTTP cache with the Esri tiles a city flight will end on, while the
 * flight is still in the air. Cesium then finds them cached (Esri sends max-age=86400 and
 * CORS headers) instead of starting cold requests on arrival.
 *
 * The final framing (16 km range, -38° pitch) puts ~20 m/px on the target, which Cesium
 * covers with level ~13 tiles, level 14 in the foreground, coarser toward the horizon.
 * URLs must match Cesium's exactly, including its subdomain choice
 * `subdomains[(x + y + level) % n]` (UrlTemplateImageryProvider).
 *
 * Measured on a cold Esri cache: a 203-tile square around the target took ~5 s, finishing
 * level 14 after arrival, and 63 of its 81 level-14 tiles were never requested. The final
 * view looks along the flight heading, so aim each level where Cesium actually uses it:
 * finest tiles in the foreground (toward the camera), mid levels on the target, coarser
 * beyond it toward the horizon. `offset` is meters along the view heading (negative = toward
 * the camera). Ordered by what's on screen at arrival.
 */
const CAMERA_GROUND_DISTANCE = CITY_RANGE_METERS * Math.cos((CITY_PITCH_DEG * Math.PI) / 180)
const PLAN: ReadonlyArray<{ level: number; radius: number; offset: number }> = [
  { level: 13, radius: 2, offset: 0 },
  { level: 14, radius: 2, offset: -CAMERA_GROUND_DISTANCE * 0.35 },
  { level: 12, radius: 2, offset: CAMERA_GROUND_DISTANCE * 0.6 },
  { level: 11, radius: 1, offset: CAMERA_GROUND_DISTANCE * 1.2 },
]
const CONCURRENCY = 8

/** Moves a point `meters` along a compass bearing (small-distance approximation). */
function offsetPoint(point: GeoPoint, bearingDeg: number, meters: number): GeoPoint {
  const b = (bearingDeg * Math.PI) / 180
  const dLat = (meters * Math.cos(b)) / 111_320
  const dLon = (meters * Math.sin(b)) / (111_320 * Math.cos((point.latitude * Math.PI) / 180))
  return { latitude: point.latitude + dLat, longitude: point.longitude + dLon }
}

function tileXY(point: GeoPoint, level: number): { x: number; y: number } {
  const n = 2 ** level
  const lat = (Math.max(-85.05112878, Math.min(85.05112878, point.latitude)) * Math.PI) / 180
  const x = Math.floor(((point.longitude + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n)
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) }
}

function tileUrl(x: number, y: number, level: number): string {
  const sub = ESRI_SUBDOMAINS[(x + y + level) % ESRI_SUBDOMAINS.length]
  return ESRI_TILE_TEMPLATE.replace('{s}', sub)
    .replace('{z}', String(level))
    .replace('{y}', String(y))
    .replace('{x}', String(x))
}

export function destinationTileUrls(point: GeoPoint): string[] {
  const urls: string[] = []
  for (const { level, radius, offset } of PLAN) {
    const n = 2 ** level
    const center = tileXY(offsetPoint(point, CITY_HEADING_DEG, offset), level)
    // Nearest-first within each level.
    const ring: Array<{ x: number; y: number; d: number }> = []
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const y = center.y + dy
        if (y < 0 || y >= n) continue
        const x = (((center.x + dx) % n) + n) % n
        ring.push({ x, y, d: dx * dx + dy * dy })
      }
    }
    ring.sort((a, b) => a.d - b.d)
    for (const t of ring) urls.push(tileUrl(t.x, t.y, level))
  }
  return urls
}

/** Starts the prefetch; abort the returned controller to stop (e.g. a new flight starts). */
export function prefetchDestinationTiles(point: GeoPoint): AbortController {
  const controller = new AbortController()
  const queue = destinationTileUrls(point)
  const worker = async () => {
    while (!controller.signal.aborted) {
      const url = queue.shift()
      if (!url) return
      try {
        // Same mode/credentials as Cesium's image requests, so the cache entry is reusable.
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: controller.signal })
        await res.arrayBuffer()
      } catch {
        // Aborted or failed: Cesium will request the tile itself.
      }
    }
  }
  for (let i = 0; i < CONCURRENCY; i++) void worker()
  return controller
}
