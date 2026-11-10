import type { PointPrimitive, PointPrimitiveCollection, Scene } from 'cesium'
import type { CesiumModule } from '../cesium-env'
import type { SatelliteGroup, SatelliteRecord, SatellitesResponse, SatelliteSet } from '../../feeds/types'
import type { Sgp4Request, Sgp4Response } from '../workers/sgp4.worker'
import type { PickId, VisibilityProbe } from './shared'

/**
 * Satellites as a PointPrimitiveCollection. SGP4 runs in a Web Worker at ~2 Hz, a little ahead
 * of now; the main thread only interpolates linearly between the last two samples each frame
 * (0.5 s of orbit is a straight line to well under a meter). Points behind the globe are hidden
 * by the GPU depth test, so nothing is culled on the CPU.
 */
const SAMPLE_MS = 500
const GROUP_STYLE: Record<SatelliteGroup, { color: string; size: number }> = {
  stations: { color: '#ffd166', size: 7 },
  'gps-ops': { color: '#34f5a0', size: 5 },
  weather: { color: '#2b9bff', size: 5 },
  visual: { color: '#2ff5ff', size: 4 },
  active: { color: '#7fe9ff', size: 2.5 },
}

interface Sample {
  timeMs: number
  positions: Float64Array
}

export class SatellitesLayer {
  private readonly collection: PointPrimitiveCollection
  private points: PointPrimitive[] = []
  private records: SatelliteRecord[] = []
  private worker: Worker | null = null
  private prev: Sample | null = null
  private next: Sample | null = null
  private seq = 0
  private sampler: ReturnType<typeof setInterval> | undefined
  private enabled = false
  /** Interpolated ECEF positions, for counting and tracking. */
  current = new Float64Array(0)
  set: SatelliteSet = 'curated'
  /** Worker propagation time for the last sample (ms), for profiling. */
  lastPropagateMs = 0

  constructor(
    private readonly Cesium: CesiumModule,
    private readonly scene: Scene,
  ) {
    this.collection = new Cesium.PointPrimitiveCollection()
    this.collection.show = false
    scene.primitives.add(this.collection)
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.collection.show = on
    if (on && this.records.length > 0) this.startSampling()
    else this.stopSampling()
  }

  get count(): number {
    return this.records.length
  }

  ingest(data: SatellitesResponse): void {
    const C = this.Cesium
    this.set = data.set
    this.records = data.sats
    this.collection.removeAll()
    this.points = data.sats.map((s) => {
      const style = GROUP_STYLE[s.g]
      const id: PickId = { layer: 'satellites', key: String(s.id) }
      return this.collection.add({
        position: C.Cartesian3.ZERO,
        pixelSize: style.size,
        color: C.Color.fromCssColorString(style.color),
        outlineColor: C.Color.BLACK.withAlpha(0.6),
        outlineWidth: style.size >= 4 ? 1 : 0,
        // ALL ACTIVE (~16k): fade the background population from far out so it reads as a
        // haze around the globe instead of a solid shell; curated groups stay fully opaque.
        translucencyByDistance: s.g === 'active' ? new C.NearFarScalar(8e6, 0.95, 4e7, 0.45) : undefined,
        show: false,
        id,
      })
    })
    this.current = new Float64Array(data.sats.length * 3).fill(Number.NaN)
    this.prev = null
    this.next = null
    this.worker?.terminate()
    this.worker = new Worker(new URL('../workers/sgp4.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<Sgp4Response>) => this.onWorker(e.data)
    const init: Sgp4Request = { type: 'init', tles: data.sats.map((s) => [s.l1, s.l2]) }
    this.worker.postMessage(init)
    if (this.enabled) this.startSampling()
  }

  private onWorker(msg: Sgp4Response): void {
    if (msg.type === 'ready') return
    if (msg.seq !== this.seq || msg.positions.length !== this.points.length * 3) return
    this.lastPropagateMs = msg.elapsedMs
    this.prev = this.next
    this.next = { timeMs: msg.timeMs, positions: msg.positions }
    if (!this.prev) this.prev = this.next
  }

  private request(): void {
    if (!this.worker) return
    this.seq++
    const req: Sgp4Request = { type: 'propagate', seq: this.seq, timeMs: Date.now() + SAMPLE_MS }
    this.worker.postMessage(req)
  }

  private startSampling(): void {
    if (this.sampler || !this.worker) return
    // Two quick samples (now, +0.5 s) so interpolation has a bracket immediately.
    this.seq++
    this.worker.postMessage({ type: 'propagate', seq: this.seq, timeMs: Date.now() } satisfies Sgp4Request)
    const seqAtStart = this.seq
    setTimeout(() => {
      if (this.seq === seqAtStart) this.request()
    }, 50)
    this.sampler = setInterval(() => this.request(), SAMPLE_MS)
  }

  private stopSampling(): void {
    clearInterval(this.sampler)
    this.sampler = undefined
  }

  /** Per-frame: interpolate every point between the bracketing samples. */
  update(now: number): void {
    if (!this.enabled || !this.prev || !this.next) return
    const a = this.prev
    const b = this.next
    const span = b.timeMs - a.timeMs
    const t = span > 0 ? Math.min(1.5, Math.max(0, (now - a.timeMs) / span)) : 0
    const pa = a.positions
    const pb = b.positions
    const cur = this.current
    const scratch = new this.Cesium.Cartesian3()
    for (let i = 0; i < this.points.length; i++) {
      const k = i * 3
      const x = pa[k] + (pb[k] - pa[k]) * t
      const point = this.points[i]
      if (!Number.isFinite(x)) {
        if (point.show) point.show = false
        cur[k] = Number.NaN
        continue
      }
      cur[k] = x
      cur[k + 1] = pa[k + 1] + (pb[k + 1] - pa[k + 1]) * t
      cur[k + 2] = pa[k + 2] + (pb[k + 2] - pa[k + 2]) * t
      scratch.x = cur[k]
      scratch.y = cur[k + 1]
      scratch.z = cur[k + 2]
      point.position = scratch
      if (!point.show) point.show = true
    }
  }

  countVisible(probe: VisibilityProbe): number {
    if (!this.enabled) return 0
    let n = 0
    const cur = this.current
    for (let k = 0; k < cur.length; k += 3) if (probe.isVisible(cur[k], cur[k + 1], cur[k + 2])) n++
    return n
  }

  get(key: string): { record: SatelliteRecord; position: [number, number, number] } | null {
    const i = this.records.findIndex((r) => String(r.id) === key)
    if (i < 0) return null
    const k = i * 3
    return { record: this.records[i], position: [this.current[k], this.current[k + 1], this.current[k + 2]] }
  }

  destroy(): void {
    this.stopSampling()
    this.worker?.terminate()
    if (!this.scene.isDestroyed()) this.scene.primitives.remove(this.collection)
  }
}
