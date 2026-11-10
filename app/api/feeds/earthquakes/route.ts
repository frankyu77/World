import { type NextRequest } from 'next/server'
import { bboxContains, parseBbox } from '@/lib/feeds/bbox'
import type { QuakesResponse } from '@/lib/feeds/types'
import { getQuakes } from '@/lib/server/usgs'
import { badRequest, feedError, feedJson } from '@/lib/server/respond'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/feeds/earthquakes?bbox=west,south,east,north : USGS past-day quakes in view (60 s TTL). */
export async function GET(request: NextRequest) {
  const bbox = parseBbox(request.nextUrl.searchParams.get('bbox'))
  if (!bbox) return badRequest('bbox=west,south,east,north required')
  try {
    const r = await getQuakes()
    const body: QuakesResponse = {
      fetchedAt: r.fetchedAt,
      stale: r.stale,
      quakes: r.value.filter((q) => bboxContains(bbox, q[1], q[2])),
    }
    return feedJson(request, body, 30)
  } catch (error) {
    return feedError(error)
  }
}
