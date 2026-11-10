import type { Polyline, PolylineCollection, Viewer } from 'cesium'
import { propagate, gstime, eciToEcf, twoline2satrec, type SatRec } from 'satellite.js'
import type { CesiumModule } from './cesium-env'
import type { LayerManager } from './layers/manager'
import type { PickId } from './layers/shared'
import type { FlightSource, SatelliteGroup } from '../feeds/types'

/**
 * Click-to-track for aircraft and satellites.
 *
 *  - Lock: a short flight to a framing offset, then every frame the camera's reference frame is
 *    re-anchored on the target (`lookAtTransform` without an offset keeps the camera's local
 *    position), so the user can still orbit and zoom around it while it moves.
 *  - Trail: a fading polyline (stepped alpha, tail transparent -> head opaque) refreshed once a
 *    second, plus a two-point head segment updated every frame so the trail never lags the
 *    target.
 *      aircraft:   positions sampled at 2 Hz while tracked (the feeds give no past track
 *                  without a key, so the trail starts at lock-on), up to 3 min;
 *      satellites: the past 10 min of orbit from SGP4, plus a dim dashed 10 min ahead.
 *  - Metadata for the HUD card is emitted at 4 Hz.
 */

export type TargetKind = 'aircraft' | 'satellite' | 'earthquake' | 'fire'

export interface AircraftTarget {
  kind: 'aircraft'
  key: string
  callsign: string
  icao24: string
  typeCode: string | null
  altitudeM: number | null
  groundSpeedMs: number | null
  trackDeg: number | null
  verticalRateMs: number | null
  onGround: boolean
  squawk: string | null
  source: FlightSource | null
  dataAgeS: number | null
  rangeKm: number
}

export interface SatelliteTarget {
  kind: 'satellite'
  key: string
  name: string
  noradId: number
  group: SatelliteGroup
  altitudeKm: number
  speedKms: number
  inclinationDeg: number
  periodMin: number
  apogeeKm: number
  perigeeKm: number
  rangeKm: number
}

export interface EarthquakeTarget {
  kind: 'earthquake'
  key: string
  magnitude: number
  depthKm: number
  timeMs: number
  place: string
  url: string
}

export interface FireTarget {
  kind: 'fire'
  key: string
  brightnessK: number
  frpMW: number
  confidence: string
  acquiredMs: number
}

export type TargetInfo = AircraftTarget | SatelliteTarget | EarthquakeTarget | FireTarget

const AIRCRAFT_RANGE_M = 8_000
const SATELLITE_RANGE_M = 1_500_000
const LOCK_FLIGHT_S = 1.5
const TRAIL_REBUILD_MS = 1000
const AIRCRAFT_SAMPLE_MS = 500
const AIRCRAFT_TRAIL_MAX = 360 // 3 min at 2 Hz
const ORBIT_PAST_MIN = 10
const ORBIT_FUTURE_MIN = 10
const ORBIT_STEP_S = 20
const INFO_INTERVAL_MS = 250
const EARTH_RADIUS_KM = 6378.137
const MU = 398600.4418 // km^3/s^2

type Vec3 = [number, number, number]

interface Tracked {
  id: PickId
  kind: 'aircraft' | 'satellite'
  locked: boolean
  /** The camera's reference frame is already anchored on the target (after the first locked frame). */
  anchored: boolean
  trail: Vec3[]
  lastSample: number
  satrec: SatRec | null
}

export interface Tracker {
  /** Handle a pick result. Returns true when it was a trackable/inspectable object. */
  select(id: PickId): boolean
  release(): void
  readonly active: boolean
  /** Screen-space anchor of the current target for the reticle (world position), or null. */
  targetPosition(): Vec3 | null
  destroy(): void
}

export function createTracker(
  Cesium: CesiumModule,
  viewer: Viewer,
  layers: LayerManager,
  callbacks: {
    onInfo: (info: TargetInfo | null) => void
    onLockChange: (locked: boolean) => void
  },
): Tracker {
  const { scene, camera } = viewer
  const C = Cesium
  let tracked: Tracked | null = null
  let lastInfo = 0
  let lastTrailBuild = 0

  // ── Trail primitives ────────────────────────────────────────────────
  // The fading trail is TRAIL_SEGMENTS polylines in one PolylineCollection, each a contiguous
  // chunk of the path with stepped alpha (tail transparent -> head opaque). Updating a polyline's
  // positions only rewrites its buffer. The first version rebuilt a per-vertex-coloured
  // Primitive every second, and that synchronous geometry build cost ~one dropped frame per
  // rebuild (tracking measured 55.8 fps, p99 34.6 ms).
  const TRAIL_SEGMENTS = 10
  const lines: PolylineCollection = new C.PolylineCollection()
  scene.primitives.add(lines)
  const segments: Polyline[] = []
  for (let i = 0; i < TRAIL_SEGMENTS; i++) {
    const seg = lines.add({ positions: [C.Cartesian3.ZERO, C.Cartesian3.ZERO], width: 2.5, show: false })
    segments.push(seg)
  }
  let segmentColor = ''
  const setSegmentColors = (css: string) => {
    if (css === segmentColor) return
    segmentColor = css
    const base = C.Color.fromCssColorString(css)
    segments.forEach((seg, i) => {
      seg.material = C.Material.fromType('Color', { color: base.withAlpha(Math.pow((i + 1) / TRAIL_SEGMENTS, 1.6) * 0.95) })
    })
  }
  const headColor = C.Color.fromCssColorString('#2ff5ff')
  const head: Polyline = lines.add({ positions: [C.Cartesian3.ZERO, C.Cartesian3.ZERO], width: 2.5, show: false })
  head.material = C.Material.fromType('Color', { color: headColor })
  const future: Polyline = lines.add({ positions: [C.Cartesian3.ZERO, C.Cartesian3.ZERO], width: 1.5, show: false })
  future.material = C.Material.fromType('PolylineDash', {
    color: C.Color.fromCssColorString('#2ff5ff').withAlpha(0.45),
    dashLength: 14,
  })

  const clearTrail = () => {
    for (const seg of segments) seg.show = false
    head.show = false
    future.show = false
  }

  const buildTrail = (points: Vec3[], colorCss: string) => {
    setSegmentColors(colorCss)
    if (points.length < 2) {
      for (const seg of segments) seg.show = false
      return
    }
    const n = points.length
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      // Contiguous chunks that share their boundary point, so the line has no gaps.
      const from = Math.floor((i * (n - 1)) / TRAIL_SEGMENTS)
      const to = Math.floor(((i + 1) * (n - 1)) / TRAIL_SEGMENTS)
      const seg = segments[i]
      if (to <= from) {
        seg.show = false
        continue
      }
      seg.positions = points.slice(from, to + 1).map((p) => new C.Cartesian3(p[0], p[1], p[2]))
      seg.show = true
    }
  }

  // ── Positions ───────────────────────────────────────────────────────
  const positionOf = (t: Tracked): Vec3 | null => {
    if (t.kind === 'aircraft') {
      const a = layers.flights.positionAt(t.id.key, Date.now())
      return a
    }
    const s = layers.satellites.get(t.id.key)
    if (!s || !Number.isFinite(s.position[0])) return null
    return s.position
  }

  const satEcef = (satrec: SatRec, date: Date): Vec3 | null => {
    const pv = propagate(satrec, date)
    const eci = pv?.position
    if (!eci || typeof eci === 'boolean' || !Number.isFinite(eci.x)) return null
    const e = eciToEcf(eci, gstime(date))
    return [e.x * 1000, e.y * 1000, e.z * 1000]
  }

  const orbitPath = (satrec: SatRec, fromMin: number, toMin: number): Vec3[] => {
    const out: Vec3[] = []
    const now = Date.now()
    for (let s = fromMin * 60; s <= toMin * 60; s += ORBIT_STEP_S) {
      const p = satEcef(satrec, new Date(now + s * 1000))
      if (p) out.push(p)
    }
    return out
  }

  // ── Info for the HUD card ───────────────────────────────────────────
  const rangeKm = (p: Vec3) =>
    C.Cartesian3.distance(camera.positionWC, new C.Cartesian3(p[0], p[1], p[2])) / 1000

  const infoFor = (t: Tracked, pos: Vec3 | null): TargetInfo | null => {
    if (t.kind === 'aircraft') {
      const a = layers.flights.get(t.id.key)
      if (!a) return null
      const snap = layers.flights.snapshotAt
      return {
        kind: 'aircraft',
        key: t.id.key,
        callsign: a.info.callsign,
        icao24: a.info.icao24,
        typeCode: a.info.typeCode,
        altitudeM: a.info.altitudeM,
        groundSpeedMs: a.info.groundSpeedMs,
        trackDeg: a.info.trackDeg,
        verticalRateMs: a.info.verticalRateMs,
        onGround: a.info.onGround,
        squawk: a.info.squawk,
        source: layers.flights.source,
        dataAgeS: snap === null ? null : Math.max(0, Math.round((Date.now() - snap) / 1000)),
        rangeKm: pos ? rangeKm(pos) : 0,
      }
    }
    const s = layers.satellites.get(t.id.key)
    if (!s || !t.satrec) return null
    const rec = t.satrec
    const nRadS = rec.no / 60 // rad/min -> rad/s
    const aKm = Math.cbrt(MU / (nRadS * nRadS))
    const pv = propagate(rec, new Date())
    const vel = pv?.velocity && typeof pv.velocity !== "boolean" ? pv.velocity : null
    const p = pos ?? s.position
    const altitudeKm = Math.hypot(p[0], p[1], p[2]) / 1000 - EARTH_RADIUS_KM
    return {
      kind: 'satellite',
      key: t.id.key,
      name: s.record.n,
      noradId: s.record.id,
      group: s.record.g,
      altitudeKm,
      speedKms: vel ? Math.hypot(vel.x, vel.y, vel.z) : 0,
      inclinationDeg: C.Math.toDegrees(rec.inclo),
      periodMin: (2 * Math.PI) / rec.no,
      apogeeKm: aKm * (1 + rec.ecco) - EARTH_RADIUS_KM,
      perigeeKm: aKm * (1 - rec.ecco) - EARTH_RADIUS_KM,
      rangeKm: rangeKm(p),
    }
  }

  // ── Per-frame ───────────────────────────────────────────────────────
  const scratchEnu = new C.Matrix4()
  const scratchOffset = new C.Cartesian3()
  const onPreRender = () => {
    const t = tracked
    if (!t) return
    const pos = positionOf(t)
    const now = performance.now()
    if (pos && t.locked) {
      // Follow: re-anchor the camera's frame on the target's new position. lookAtTransform
      // *without* an offset keeps the camera's world position (it only re-expresses it), so it
      // would stay put while the target flies off. Instead: anchor once, then each frame carry
      // the camera's local offset (which the user's orbit/zoom changes) into the new frame.
      C.Transforms.eastNorthUpToFixedFrame(new C.Cartesian3(pos[0], pos[1], pos[2]), C.Ellipsoid.WGS84, scratchEnu)
      if (!t.anchored) {
        camera.lookAtTransform(scratchEnu)
        t.anchored = true
      } else {
        C.Cartesian3.clone(camera.position, scratchOffset)
        camera.lookAtTransform(scratchEnu, scratchOffset)
      }
    }
    if (pos && t.kind === 'aircraft' && now - t.lastSample >= AIRCRAFT_SAMPLE_MS) {
      t.lastSample = now
      t.trail.push([pos[0], pos[1], pos[2]])
      if (t.trail.length > AIRCRAFT_TRAIL_MAX) t.trail.shift()
    }
    if (now - lastTrailBuild >= TRAIL_REBUILD_MS) {
      lastTrailBuild = now
      if (t.kind === 'aircraft') buildTrail(t.trail, '#2ff5ff')
      else if (t.satrec) {
        buildTrail(orbitPath(t.satrec, -ORBIT_PAST_MIN, 0), '#ffd166')
        const ahead = orbitPath(t.satrec, 0, ORBIT_FUTURE_MIN)
        if (ahead.length > 1) {
          future.positions = ahead.map((p) => new C.Cartesian3(p[0], p[1], p[2]))
          future.show = true
        }
      }
    }
    // Head: last trail point -> live position, every frame.
    const tail = t.kind === 'aircraft' ? t.trail[t.trail.length - 1] : null
    if (pos && tail) {
      head.positions = [new C.Cartesian3(tail[0], tail[1], tail[2]), new C.Cartesian3(pos[0], pos[1], pos[2])]
      head.show = true
    } else {
      head.show = false
    }
    if (now - lastInfo >= INFO_INTERVAL_MS) {
      lastInfo = now
      callbacks.onInfo(infoFor(t, pos))
    }
  }
  const removePreRender = scene.preRender.addEventListener(onPreRender)

  const release = () => {
    if (!tracked) return
    const wasLocked = tracked.locked
    if (tracked.kind === 'aircraft') layers.setFlightFocus(null)
    tracked = null
    clearTrail()
    if (wasLocked) camera.lookAtTransform(C.Matrix4.IDENTITY)
    callbacks.onLockChange(false)
    callbacks.onInfo(null)
  }

  const lockOn = (id: PickId, kind: 'aircraft' | 'satellite') => {
    release()
    const satrec = kind === 'satellite' ? (() => {
      const s = layers.satellites.get(id.key)
      try {
        return s ? twoline2satrec(s.record.l1, s.record.l2) : null
      } catch {
        return null
      }
    })() : null
    const t: Tracked = { id, kind, locked: false, anchored: false, trail: [], lastSample: 0, satrec }
    tracked = t
    lastTrailBuild = 0
    const pos = positionOf(t)
    if (!pos) {
      release()
      return
    }
    callbacks.onLockChange(true)
    if (kind === 'aircraft') {
      // Keep the tracked aircraft on fresh regional data, whatever the view does.
      layers.setFlightFocus(() => {
        const p = positionOf(t)
        if (!p) return null
        const c = C.Cartographic.fromCartesian(new C.Cartesian3(p[0], p[1], p[2]))
        return { lat: C.Math.toDegrees(c.latitude), lon: C.Math.toDegrees(c.longitude) }
      })
    }
    camera.flyToBoundingSphere(new C.BoundingSphere(new C.Cartesian3(pos[0], pos[1], pos[2]), 0), {
      offset: new C.HeadingPitchRange(
        camera.heading,
        C.Math.toRadians(kind === 'aircraft' ? -30 : -55),
        kind === 'aircraft' ? AIRCRAFT_RANGE_M : SATELLITE_RANGE_M,
      ),
      duration: LOCK_FLIGHT_S,
      easingFunction: C.EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        if (tracked === t) t.locked = true
      },
      cancel: () => {
        if (tracked === t) t.locked = true
      },
    })
  }

  return {
    select(id) {
      if (id.layer === 'flights') {
        lockOn(id, 'aircraft')
        return true
      }
      if (id.layer === 'satellites') {
        lockOn(id, 'satellite')
        return true
      }
      // Quakes and fires: inspect only (no camera lock).
      release()
      if (id.layer === 'earthquakes') {
        const q = layers.earthquakes.get(id.key)
        if (!q) return false
        callbacks.onInfo({ kind: 'earthquake', key: id.key, magnitude: q[4], depthKm: q[3], timeMs: q[5], place: q[6], url: q[7] })
        return true
      }
      const f = layers.fires.get(id.key)
      if (!f) return false
      callbacks.onInfo({ kind: 'fire', key: id.key, brightnessK: f[2], frpMW: f[3], confidence: f[4], acquiredMs: f[5] })
      return true
    },
    release,
    get active() {
      return tracked !== null
    },
    targetPosition() {
      return tracked ? positionOf(tracked) : null
    },
    destroy() {
      release()
      removePreRender()
      if (!scene.isDestroyed()) scene.primitives.remove(lines)
    },
  }
}
