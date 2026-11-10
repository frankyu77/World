import type { Billboard, BillboardCollection, Scene } from 'cesium'
import type { CesiumModule } from '../cesium-env'
import type { AircraftRow, FlightSource, FlightsResponse } from '../../feeds/types'
import type { PickId, VisibilityProbe } from './shared'

/**
 * Aircraft as a BillboardCollection (one shared canvas glyph, rotated to track). Positions are
 * dead-reckoned between polls: each aircraft gets an ECEF velocity from ground speed, track and
 * vertical rate, so its position is p0 + v * dt (straight-line over <= 2 min is within ~30 m of
 * the great-circle path at cruise). A quarter of the fleet is updated each frame (15 Hz per
 * aircraft), which keeps per-frame cost flat with 10k aircraft on screen.
 */
const MAX_EXTRAPOLATE_S = 120
const UPDATE_SLICES = 4
const GLYPH_PX = 32

export interface FlightInfo {
  icao24: string
  callsign: string
  altitudeM: number | null
  groundSpeedMs: number | null
  trackDeg: number | null
  verticalRateMs: number | null
  onGround: boolean
  squawk: string | null
  typeCode: string | null
}

interface Aircraft {
  info: FlightInfo
  billboard: Billboard
  /** Position and velocity at t0 (ECEF meters, m/s). */
  p: [number, number, number]
  v: [number, number, number]
  t0: number
  /** Last displayed position, for visibility counting and tracking. */
  cur: [number, number, number]
}

function drawGlyph(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = GLYPH_PX
  c.height = GLYPH_PX
  const ctx = c.getContext('2d')
  if (!ctx) return c
  ctx.translate(GLYPH_PX / 2, GLYPH_PX / 2)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  // Nose up: fuselage, swept wings, tailplane.
  ctx.moveTo(0, -13)
  ctx.lineTo(2.2, -6)
  ctx.lineTo(12, 1)
  ctx.lineTo(12, 3.5)
  ctx.lineTo(2.2, 0.5)
  ctx.lineTo(1.6, 8)
  ctx.lineTo(5, 11)
  ctx.lineTo(5, 12.5)
  ctx.lineTo(0, 11)
  ctx.lineTo(-5, 12.5)
  ctx.lineTo(-5, 11)
  ctx.lineTo(-1.6, 8)
  ctx.lineTo(-2.2, 0.5)
  ctx.lineTo(-12, 3.5)
  ctx.lineTo(-12, 1)
  ctx.lineTo(-2.2, -6)
  ctx.closePath()
  ctx.stroke()
  ctx.fill()
  return c
}

export class FlightsLayer {
  private readonly collection: BillboardCollection
  private readonly aircraft = new Map<string, Aircraft>()
  private list: Aircraft[] = []
  private slice = 0
  private readonly glyph: HTMLCanvasElement
  private enabled = false
  snapshotAt: number | null = null
  source: FlightSource | null = null
  authenticated: boolean | null = null

  constructor(
    private readonly Cesium: CesiumModule,
    private readonly scene: Scene,
  ) {
    this.collection = new Cesium.BillboardCollection({ scene })
    this.collection.show = false
    scene.primitives.add(this.collection)
    this.glyph = drawGlyph()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.collection.show = on
  }

  get count(): number {
    return this.list.length
  }

  ingest(data: FlightsResponse): void {
    const C = this.Cesium
    this.snapshotAt = data.snapshotAt
    this.source = data.source
    this.authenticated = data.authenticated ?? null
    const seen = new Set<string>()
    for (const row of data.aircraft) {
      const key = row[0]
      if (!key || seen.has(key)) continue
      seen.add(key)
      const state = this.kinematics(row, data.snapshotAt)
      let a = this.aircraft.get(key)
      if (!a) {
        const id: PickId = { layer: 'flights', key }
        const billboard = this.collection.add({
          position: new C.Cartesian3(state.p[0], state.p[1], state.p[2]),
          image: this.glyph,
          width: 18,
          height: 18,
          alignedAxis: C.Cartesian3.UNIT_Z,
          scaleByDistance: new C.NearFarScalar(2e5, 1.0, 1.6e7, 0.45),
          id,
        })
        a = { info: state.info, billboard, p: state.p, v: state.v, t0: state.t0, cur: [...state.p] }
        this.aircraft.set(key, a)
      } else {
        a.info = state.info
        a.p = state.p
        a.v = state.v
        a.t0 = state.t0
      }
      a.billboard.rotation = -C.Math.toRadians(state.info.trackDeg ?? 0)
      a.billboard.color = state.info.onGround
        ? C.Color.fromCssColorString('#7d8b93').withAlpha(0.7)
        : C.Color.fromCssColorString('#2ff5ff')
    }
    // Drop aircraft no longer reported in this view.
    for (const [key, a] of this.aircraft) {
      if (seen.has(key)) continue
      this.collection.remove(a.billboard)
      this.aircraft.delete(key)
    }
    this.list = [...this.aircraft.values()]
    this.update(Date.now(), true)
  }

  private kinematics(row: AircraftRow, snapshotAt: number) {
    const [icao24, callsign, lat, lon, alt, gs, track, vr, onGround, squawk, typeCode, ageS] = row
    const r = Math.PI / 180
    const phi = lat * r
    const lam = lon * r
    const sp = Math.sin(phi)
    const cp = Math.cos(phi)
    const sl = Math.sin(lam)
    const cl = Math.cos(lam)
    const pos = this.Cesium.Cartesian3.fromDegrees(lon, lat, Math.max(0, alt ?? 0))
    const speed = onGround ? 0 : (gs ?? 0)
    const t = (track ?? 0) * r
    const ve = speed * Math.sin(t)
    const vn = speed * Math.cos(t)
    const vu = onGround ? 0 : (vr ?? 0)
    // ENU -> ECEF basis at (phi, lam).
    const v: [number, number, number] = [
      -sl * ve - sp * cl * vn + cp * cl * vu,
      cl * ve - sp * sl * vn + cp * sl * vu,
      cp * vn + sp * vu,
    ]
    const info: FlightInfo = {
      icao24,
      callsign,
      altitudeM: alt,
      groundSpeedMs: gs,
      trackDeg: track,
      verticalRateMs: vr,
      onGround: onGround === 1,
      squawk,
      typeCode,
    }
    return { info, p: [pos.x, pos.y, pos.z] as [number, number, number], v, t0: snapshotAt - ageS * 1000 }
  }

  /** Per-frame: advance one slice of the fleet (or all of it when `all`). */
  update(now: number, all = false): void {
    if (!this.enabled && !all) return
    const list = this.list
    const n = list.length
    if (n === 0) return
    const start = all ? 0 : Math.floor((this.slice * n) / UPDATE_SLICES)
    const end = all ? n : Math.floor(((this.slice + 1) * n) / UPDATE_SLICES)
    this.slice = (this.slice + 1) % UPDATE_SLICES
    const scratch = new this.Cesium.Cartesian3()
    for (let i = start; i < end; i++) {
      const a = list[i]
      const dt = Math.min(MAX_EXTRAPOLATE_S, Math.max(0, (now - a.t0) / 1000))
      a.cur[0] = a.p[0] + a.v[0] * dt
      a.cur[1] = a.p[1] + a.v[1] * dt
      a.cur[2] = a.p[2] + a.v[2] * dt
      scratch.x = a.cur[0]
      scratch.y = a.cur[1]
      scratch.z = a.cur[2]
      a.billboard.position = scratch
    }
  }

  countVisible(probe: VisibilityProbe): number {
    if (!this.enabled) return 0
    let n = 0
    for (const a of this.list) if (probe.isVisible(a.cur[0], a.cur[1], a.cur[2])) n++
    return n
  }

  get(key: string): { info: FlightInfo; position: [number, number, number] } | null {
    const a = this.aircraft.get(key)
    return a ? { info: a.info, position: a.cur } : null
  }

  clear(): void {
    this.collection.removeAll()
    this.aircraft.clear()
    this.list = []
    this.snapshotAt = null
    this.source = null
  }

  destroy(): void {
    if (!this.scene.isDestroyed()) this.scene.primitives.remove(this.collection)
  }
}
