/** Geographic bbox helpers shared by feed routes and client layers. `west > east` crosses the antimeridian. */
export interface Bbox {
  west: number
  south: number
  east: number
  north: number
}

const EARTH_RADIUS_KM = 6371

/**
 * Views whose bbox fits within this radius are served by an adsb.lol point query (250 nm max,
 * with margin for center snapping); wider ones by the OpenSky snapshot. Shared by the route
 * (which decides the source) and the client (which pads requests without crossing it).
 */
export const REGIONAL_RADIUS_KM = 410

export function parseBbox(value: string | null): Bbox | null {
  if (!value) return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  const [west, south, east, north] = parts
  if (south < -90 || north > 90 || south > north) return null
  if (west < -180 || west > 180 || east < -180 || east > 180) return null
  return { west, south, east, north }
}

export function formatBbox(b: Bbox): string {
  return [b.west, b.south, b.east, b.north].map((n) => n.toFixed(3)).join(',')
}

export function bboxContains(b: Bbox, lat: number, lon: number): boolean {
  if (lat < b.south || lat > b.north) return false
  return b.west <= b.east ? lon >= b.west && lon <= b.east : lon >= b.west || lon <= b.east
}

export function bboxCenter(b: Bbox): { lat: number; lon: number } {
  const span = b.west <= b.east ? b.east - b.west : b.east + 360 - b.west
  let lon = b.west + span / 2
  if (lon > 180) lon -= 360
  return { lat: (b.south + b.north) / 2, lon }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const dLat = (lat2 - lat1) * r
  const dLon = (lon2 - lon1) * r
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Distance from the bbox center to its farthest corner (km): the radius a point query needs to cover it. */
export function bboxRadiusKm(b: Bbox): number {
  const c = bboxCenter(b)
  return Math.max(
    haversineKm(c.lat, c.lon, b.north, b.west),
    haversineKm(c.lat, c.lon, b.north, b.east),
    haversineKm(c.lat, c.lon, b.south, b.west),
    haversineKm(c.lat, c.lon, b.south, b.east),
  )
}

/** Expand outward to a grid (degrees) so nearby views share one cache entry. */
export function snapBbox(b: Bbox, step: number): Bbox {
  const fl = (v: number) => Math.floor(v / step) * step
  const ce = (v: number) => Math.ceil(v / step) * step
  return {
    west: Math.max(-180, fl(b.west)),
    south: Math.max(-90, fl(b.south)),
    east: Math.min(180, ce(b.east)),
    north: Math.min(90, ce(b.north)),
  }
}
