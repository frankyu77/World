import type { Camera, Cartesian3 as Cartesian3T, CullingVolume, EllipsoidalOccluder } from 'cesium'
import type { CesiumModule } from '../cesium-env'
import type { Bbox } from '../../feeds/bbox'

export type LayerId = 'flights' | 'satellites' | 'earthquakes' | 'fires'

/** Attached to every primitive's `id`, so picking (Step 4) can resolve what was clicked. */
export interface PickId {
  layer: LayerId
  key: string
}

export function isPickId(value: unknown): value is PickId {
  return typeof value === 'object' && value !== null && 'layer' in value && 'key' in value
}

export interface LayerStats {
  /** Objects currently on screen (in the frustum and not behind the globe). */
  visible: number
}

/** Shared per-tick visibility test: frustum + globe occlusion. */
export class VisibilityProbe {
  private cull: CullingVolume | null = null
  private readonly occluder: EllipsoidalOccluder
  private readonly scratch: Cartesian3T
  private readonly sphere: InstanceType<CesiumModule['BoundingSphere']>

  constructor(
    private readonly Cesium: CesiumModule,
    private readonly camera: Camera,
  ) {
    this.occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, camera.positionWC)
    this.scratch = new Cesium.Cartesian3()
    this.sphere = new Cesium.BoundingSphere(new Cesium.Cartesian3(), 1)
  }

  /** Call once before a batch of `isVisible` checks. */
  begin(): void {
    const c = this.camera
    this.cull = c.frustum.computeCullingVolume(c.positionWC, c.directionWC, c.upWC)
    this.occluder.cameraPosition = c.positionWC
  }

  isVisible(x: number, y: number, z: number): boolean {
    if (!this.cull || !Number.isFinite(x)) return false
    const p = this.scratch
    p.x = x
    p.y = y
    p.z = z
    this.sphere.center = p
    if (this.cull.computeVisibility(this.sphere) === this.Cesium.Intersect.OUTSIDE) return false
    return this.occluder.isPointVisible(p)
  }
}

export type { Bbox }
