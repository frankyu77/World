import { type NextRequest } from 'next/server'
import { bboxCenter, bboxContains, bboxRadiusKm, parseBbox, REGIONAL_RADIUS_KM } from '@/lib/feeds/bbox'
import type { AircraftRow, FlightsResponse } from '@/lib/feeds/types'
import { ADSB_MAX_RADIUS_KM, getAdsbPoint, snapPointQuery } from '@/lib/server/adsb-lol'
import { getOpenSkySnapshot } from '@/lib/server/opensky'
import { badRequest, feedError, feedJson } from '@/lib/server/respond'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/feeds/flights?bbox=west,south,east,north
 *
 * Views small enough for one adsb.lol point query (<= 250 nm) get fresh adsb.lol data (10 s TTL).
 * Wider views get the shared OpenSky global snapshot filtered to the bbox (authenticated,
 * adaptive TTL ~90 s). If OpenSky is unavailable with nothing cached, fall back to adsb.lol
 * around the view center. `snapshotAt` feeds the HUD DATA AGE readout.
 */
export async function GET(request: NextRequest) {
  const bbox = parseBbox(request.nextUrl.searchParams.get('bbox'))
  if (!bbox) return badRequest('bbox=west,south,east,north required')

  const center = bboxCenter(bbox)
  const radiusKm = bboxRadiusKm(bbox)
  const regional = radiusKm <= REGIONAL_RADIUS_KM

  const fromAdsb = async (): Promise<FlightsResponse> => {
    const q = snapPointQuery(center.lat, center.lon, Math.min(radiusKm, ADSB_MAX_RADIUS_KM))
    const r = await getAdsbPoint(q.lat, q.lon, q.nm)
    return {
      source: 'adsb.lol',
      snapshotAt: r.value.snapshotAt,
      fetchedAt: r.fetchedAt,
      stale: r.stale,
      aircraft: r.value.rows.filter((a) => bboxContains(bbox, a[2], a[3])),
    }
  }

  try {
    if (regional) return feedJson(request, await fromAdsb(), 5)
    try {
      const r = await getOpenSkySnapshot()
      const aircraft: AircraftRow[] = r.value.rows.filter((a) => bboxContains(bbox, a[2], a[3]))
      const body: FlightsResponse = {
        source: 'opensky',
        snapshotAt: r.value.snapshotAt,
        fetchedAt: r.fetchedAt,
        stale: r.stale,
        authenticated: r.value.authenticated,
        aircraft,
      }
      return feedJson(request, body, 15)
    } catch {
      // Something is better than nothing: the nearest 250 nm of live traffic.
      return feedJson(request, await fromAdsb(), 5)
    }
  } catch (error) {
    return feedError(error)
  }
}
