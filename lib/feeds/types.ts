/**
 * Wire formats for /api/feeds/*, shared by the route handlers and the client layers.
 * Large feeds use positional tuples instead of objects to keep payloads small.
 */

export type FlightSource = 'adsb.lol' | 'opensky'

/**
 * [icao24, callsign, lat, lon, altitudeM | null, groundSpeedMs | null, trackDeg | null,
 *  verticalRateMs | null, onGround (0|1), squawk | null, typeCode | null, positionAgeS]
 */
export type AircraftRow = [
  string,
  string,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  0 | 1,
  string | null,
  string | null,
  number,
]

export interface FlightsResponse {
  source: FlightSource
  /** When the upstream observed this data (ms epoch); drives the HUD DATA AGE readout. */
  snapshotAt: number
  /** When this server fetched it (ms epoch). */
  fetchedAt: number
  stale: boolean
  /** OpenSky only: whether the snapshot came through the authenticated (4000/day) path. */
  authenticated?: boolean
  aircraft: AircraftRow[]
}

export type SatelliteGroup = 'stations' | 'gps-ops' | 'weather' | 'visual' | 'active'
export type SatelliteSet = 'curated' | 'active'

export interface SatelliteRecord {
  /** Name */
  n: string
  /** NORAD catalog id */
  id: number
  /** Group (for colour) */
  g: SatelliteGroup
  l1: string
  l2: string
}

export interface SatellitesResponse {
  set: SatelliteSet
  fetchedAt: number
  stale: boolean
  sats: SatelliteRecord[]
}

/** [id, lat, lon, depthKm, magnitude, timeMs, place, url] */
export type QuakeRow = [string, number, number, number, number, number, string, string]

export interface QuakesResponse {
  fetchedAt: number
  stale: boolean
  quakes: QuakeRow[]
}

/** [lat, lon, brightnessK, frpMW, confidence, acquiredMs] */
export type FireRow = [number, number, number, number, string, number]

export type FiresResponse =
  | { disabled: true; reason: 'NO_KEY' }
  | { disabled: false; fetchedAt: number; stale: boolean; fires: FireRow[] }

/** Error body for feeds that are down with nothing cached. */
export interface FeedErrorResponse {
  error: string
  retryAfterMs: number
}
