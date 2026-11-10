import { type NextRequest } from 'next/server'
import { bboxContains, parseBbox } from '@/lib/feeds/bbox'
import type { FiresResponse } from '@/lib/feeds/types'
import { firmsKey, getFires } from '@/lib/server/firms'
import { badRequest, feedError, feedJson } from '@/lib/server/respond'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/feeds/fires?bbox=west,south,east,north
 * NASA FIRMS detections in view when FIRMS_MAP_KEY is set; otherwise { disabled: true } so the
 * LAYERS panel can show NO KEY. (`?probe=1` answers availability without a bbox or fetch.)
 */
export async function GET(request: NextRequest) {
  const key = firmsKey()
  if (!key) return feedJson<FiresResponse>(request, { disabled: true, reason: 'NO_KEY' }, 300)
  if (request.nextUrl.searchParams.get('probe') === '1') {
    return feedJson<FiresResponse>(request, { disabled: false, fetchedAt: 0, stale: false, fires: [] }, 300)
  }
  const bbox = parseBbox(request.nextUrl.searchParams.get('bbox'))
  if (!bbox) return badRequest('bbox=west,south,east,north required')
  try {
    const r = await getFires(bbox, key)
    const body: FiresResponse = {
      disabled: false,
      fetchedAt: r.fetchedAt,
      stale: r.stale,
      fires: r.value.filter((f) => bboxContains(bbox, f[0], f[1])),
    }
    return feedJson(request, body, 600)
  } catch (error) {
    return feedError(error)
  }
}
