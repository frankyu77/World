import { type NextRequest } from 'next/server'
import type { SatellitesResponse, SatelliteSet } from '@/lib/feeds/types'
import { getSatellites } from '@/lib/server/celestrak'
import { badRequest, feedError, feedJson } from '@/lib/server/respond'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/feeds/satellites?set=curated|active
 * TLEs (cached 6 h server-side). Satellites move too fast to filter by view at fetch time; the
 * client propagates them (SGP4 in a worker) and the GPU culls what's behind the globe.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('set') ?? 'curated'
  if (raw !== 'curated' && raw !== 'active') return badRequest('set must be curated or active')
  const set: SatelliteSet = raw
  try {
    const r = await getSatellites(set)
    const body: SatellitesResponse = { set, fetchedAt: r.fetchedAt, stale: r.stale, sats: r.sats }
    return feedJson(request, body, 3600)
  } catch (error) {
    return feedError(error)
  }
}
