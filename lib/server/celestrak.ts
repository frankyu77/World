import 'server-only'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cached, FeedUnavailableError, type CachedResult } from './feed-cache'
import { fetchUpstream } from './upstream'
import type { SatelliteGroup, SatelliteRecord, SatelliteSet } from '../feeds/types'

/**
 * CelesTrak GP data as TLE text. Elements change slowly and CelesTrak asks clients not to
 * re-download the same data more than every couple of hours (it throttles per client with
 * 403/429), so each group is cached 6 h and every group shares one "celestrak" cooldown.
 * The curated set is stations + GPS + weather + brightest (a few hundred objects); "active"
 * (~16k) is only fetched when the user picks ALL ACTIVE.
 *
 * CelesTrak 403s a repeat download of the same group from one IP within ~2 h, and every
 * server process (dev, prod, restarts) has its own memory cache, so groups are also persisted
 * to .next/cache/aegis/ and shared: a fresh file is used instead of the network, and during a
 * cooldown any saved copy is served (stale) instead of failing.
 */
const TTL_MS = 6 * 3600_000
const CURATED: SatelliteGroup[] = ['stations', 'gps-ops', 'weather', 'visual']

function parseTle(text: string, group: SatelliteGroup): SatelliteRecord[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0)
  const out: SatelliteRecord[] = []
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim()
    const l1 = lines[i + 1]
    const l2 = lines[i + 2]
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) {
      // Out of step (e.g. a truncated record): advance one line and try again.
      i -= 2
      continue
    }
    const id = Number(l1.slice(2, 7))
    if (!Number.isFinite(id)) continue
    out.push({ n: name, id, g: group, l1, l2 })
  }
  return out
}

const DISK_DIR = join(process.cwd(), '.next', 'cache', 'aegis')
const diskPath = (group: SatelliteGroup) => join(DISK_DIR, `celestrak-${group}.json`)

interface DiskEntry {
  fetchedAt: number
  sats: SatelliteRecord[]
}

async function readDisk(group: SatelliteGroup): Promise<DiskEntry | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(diskPath(group), 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && 'fetchedAt' in parsed && 'sats' in parsed) {
      const e = parsed as DiskEntry
      return Array.isArray(e.sats) && typeof e.fetchedAt === 'number' ? e : null
    }
  } catch {
    // Missing or unreadable: treat as no cache.
  }
  return null
}

async function writeDisk(group: SatelliteGroup, entry: DiskEntry): Promise<void> {
  try {
    await mkdir(DISK_DIR, { recursive: true })
    await writeFile(diskPath(group), JSON.stringify(entry))
  } catch {
    // Best effort; the memory cache still works.
  }
}

const written = new Set<SatelliteGroup>()

async function getGroup(group: SatelliteGroup): Promise<CachedResult<SatelliteRecord[]>> {
  try {
    const result = await cached<SatelliteRecord[]>({
      key: `celestrak:${group}`,
      host: 'celestrak',
      ttlMs: TTL_MS,
      load: async () => {
        const disk = await readDisk(group)
        if (disk && Date.now() - disk.fetchedAt < TTL_MS) return disk.sats
        const { text } = await fetchUpstream(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, {
          source: 'celestrak',
          timeoutMs: 30_000,
          maxBytes: 8 * 1024 * 1024,
        })
        const sats = parseTle(text, group)
        await writeDisk(group, { fetchedAt: Date.now(), sats })
        written.add(group)
        return sats
      },
    })
    // Write-through for data this process already held (e.g. loaded before a restart).
    if (!written.has(group) && !result.stale) {
      written.add(group)
      if (!(await readDisk(group))) await writeDisk(group, { fetchedAt: result.fetchedAt, sats: result.value })
    }
    return result
  } catch (error) {
    // Cooling down (or failing) with nothing in memory: any saved copy beats nothing.
    const disk = await readDisk(group)
    if (disk) return { value: disk.sats, fetchedAt: disk.fetchedAt, stale: true }
    throw error instanceof FeedUnavailableError ? error : new FeedUnavailableError('celestrak', 60_000)
  }
}

export async function getSatellites(set: SatelliteSet): Promise<{ sats: SatelliteRecord[]; fetchedAt: number; stale: boolean }> {
  if (set === 'active') {
    const r = await getGroup('active')
    return { sats: r.value, fetchedAt: r.fetchedAt, stale: r.stale }
  }
  // Groups load independently: one failing (with nothing cached) doesn't sink the others.
  const results = await Promise.allSettled(CURATED.map(getGroup))
  const seen = new Set<number>()
  const sats: SatelliteRecord[] = []
  let fetchedAt = Date.now()
  let stale = false
  let ok = 0
  for (const r of results) {
    if (r.status !== 'fulfilled') {
      stale = true
      continue
    }
    ok++
    fetchedAt = Math.min(fetchedAt, r.value.fetchedAt)
    stale ||= r.value.stale
    for (const s of r.value.value) {
      // First group wins, in CURATED order (a station that's also "visual" stays a station).
      if (seen.has(s.id)) continue
      seen.add(s.id)
      sats.push(s)
    }
  }
  if (ok === 0) {
    const first = results[0]
    throw first.status === 'rejected' ? first.reason : new Error('celestrak unavailable')
  }
  return { sats, fetchedAt, stale }
}

export { parseTle as _parseTleForTest }
