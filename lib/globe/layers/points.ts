import type { PointPrimitiveCollection, Scene } from 'cesium'
import type { CesiumModule } from '../cesium-env'
import type { FireRow, QuakeRow } from '../../feeds/types'
import type { LayerId, PickId, VisibilityProbe } from './shared'

/**
 * Static point layers (earthquakes, fires): a PointPrimitiveCollection rebuilt on each
 * response. Points sit slightly above the ellipsoid so they never z-fight the globe surface.
 */
interface PointSpec {
  key: string
  lat: number
  lon: number
  size: number
  color: string
  alpha: number
}

class StaticPointLayer<Row> {
  protected readonly collection: PointPrimitiveCollection
  protected positions = new Float64Array(0)
  protected rows = new Map<string, Row>()
  private enabled = false

  constructor(
    protected readonly Cesium: CesiumModule,
    private readonly scene: Scene,
    private readonly layer: LayerId,
    private readonly heightM: number,
    private readonly toSpec: (row: Row, now: number) => PointSpec,
  ) {
    this.collection = new Cesium.PointPrimitiveCollection()
    this.collection.show = false
    scene.primitives.add(this.collection)
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.collection.show = on
  }

  get count(): number {
    return this.rows.size
  }

  ingest(rows: Row[]): void {
    const C = this.Cesium
    const now = Date.now()
    this.collection.removeAll()
    this.rows.clear()
    this.positions = new Float64Array(rows.length * 3)
    rows.forEach((row, i) => {
      const s = this.toSpec(row, now)
      const p = C.Cartesian3.fromDegrees(s.lon, s.lat, this.heightM)
      this.positions[i * 3] = p.x
      this.positions[i * 3 + 1] = p.y
      this.positions[i * 3 + 2] = p.z
      this.rows.set(s.key, row)
      const id: PickId = { layer: this.layer, key: s.key }
      this.collection.add({
        position: p,
        pixelSize: s.size,
        color: C.Color.fromCssColorString(s.color).withAlpha(s.alpha),
        outlineColor: C.Color.BLACK.withAlpha(0.5),
        outlineWidth: 1,
        scaleByDistance: new C.NearFarScalar(1e5, 1.4, 2e7, 0.8),
        id,
      })
    })
  }

  countVisible(probe: VisibilityProbe): number {
    if (!this.enabled) return 0
    let n = 0
    const p = this.positions
    for (let k = 0; k < p.length; k += 3) if (probe.isVisible(p[k], p[k + 1], p[k + 2])) n++
    return n
  }

  get(key: string): Row | undefined {
    return this.rows.get(key)
  }

  destroy(): void {
    if (!this.scene.isDestroyed()) this.scene.primitives.remove(this.collection)
  }
}

/** USGS quakes: size by magnitude, colour by age (red < 1 h, amber < 6 h, then yellow). */
export class EarthquakesLayer extends StaticPointLayer<QuakeRow> {
  constructor(Cesium: CesiumModule, scene: Scene) {
    super(Cesium, scene, 'earthquakes', 2_000, (q, now) => {
      const ageH = (now - q[5]) / 3_600_000
      return {
        key: q[0],
        lat: q[1],
        lon: q[2],
        size: Math.max(4, 4 + q[4] * 2.4),
        color: ageH < 1 ? '#ff4d5e' : ageH < 6 ? '#ffb020' : '#ffe27a',
        alpha: ageH < 6 ? 0.95 : 0.7,
      }
    })
  }
}

/** FIRMS fires: small orange points, brighter for higher fire radiative power. */
export class FiresLayer extends StaticPointLayer<FireRow> {
  constructor(Cesium: CesiumModule, scene: Scene) {
    super(Cesium, scene, 'fires', 500, (f) => ({
      key: `${f[0].toFixed(4)},${f[1].toFixed(4)},${f[5]}`,
      lat: f[0],
      lon: f[1],
      size: f[3] > 50 ? 5 : 3.5,
      color: f[3] > 50 ? '#ff7a1a' : '#ffae42',
      alpha: 0.9,
    }))
  }
}
