import type { Camera, Scene } from 'cesium'
import type { CesiumModule } from './cesium-env'
import type { CameraState, GeoPoint, ViewBounds } from './types'

/** Zoom-level gates for viewport data (web-mercator-equivalent levels, see heightToZoom). */
export const zoomThresholds = {
  noFetch: 5, // Below this: no data fetching
  majorCities: 8, // 5-8: major cities only
  allCities: 12, // 8-12: all visible cities
  streetLevel: 14, // Above 12: full detail with POIs
}

/**
 * Web-mercator zoom whose on-screen ground span matches a camera at `height` meters
 * (60° FOV, ~1000px viewport): span ≈ 156543 m/px × 1000 px / 2^z ≈ 1.15 × height.
 */
const ZOOM_HEIGHT_CONSTANT = 1.36e8

export function heightToZoom(height: number): number {
  const z = Math.log2(ZOOM_HEIGHT_CONSTANT / Math.max(height, 1))
  return Math.min(22, Math.max(0, z))
}

export const HOME_HEIGHT = 20_000_000
export const HOME_LATITUDE = 20

/** Ground point under the screen center, falling back to the point below the camera. */
export function readCameraState(Cesium: CesiumModule, scene: Scene): CameraState {
  const camera = scene.camera
  const height = camera.positionCartographic.height
  const canvas = scene.canvas
  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
  const hit = camera.pickEllipsoid(center, scene.globe.ellipsoid)
  const carto = hit ? Cesium.Cartographic.fromCartesian(hit) : camera.positionCartographic
  return {
    latitude: Cesium.Math.toDegrees(carto.latitude),
    longitude: Cesium.Math.toDegrees(carto.longitude),
    height,
    zoom: heightToZoom(height),
  }
}

/** Visible ground rectangle in degrees, or null when the globe is not in view. */
export function readViewBounds(Cesium: CesiumModule, scene: Scene): ViewBounds | null {
  const rect = scene.camera.computeViewRectangle(scene.globe.ellipsoid)
  if (!rect) return null
  return {
    north: Cesium.Math.toDegrees(rect.north),
    south: Cesium.Math.toDegrees(rect.south),
    east: Cesium.Math.toDegrees(rect.east),
    west: Cesium.Math.toDegrees(rect.west),
  }
}

/** True when a point lies inside the bounds, handling antimeridian-crossing views. */
export function boundsContain(bounds: ViewBounds, point: GeoPoint): boolean {
  if (point.latitude < bounds.south || point.latitude > bounds.north) return false
  if (bounds.west <= bounds.east) {
    return point.longitude >= bounds.west && point.longitude <= bounds.east
  }
  return point.longitude >= bounds.west || point.longitude <= bounds.east
}

/** Final framing of a city flight: viewing distance, and the pitched, rotated look of the old map's flyTo. */
const CITY_RANGE_METERS = 16_000
const CITY_HEADING_DEG = -30
const CITY_PITCH_DEG = -38
const CITY_FLIGHT_SECONDS = 3.2

export function flyToCity(
  Cesium: CesiumModule,
  camera: Camera,
  point: GeoPoint,
  onArrive: () => void,
): void {
  const target = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 0)
  camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
    offset: new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(CITY_HEADING_DEG),
      Cesium.Math.toRadians(CITY_PITCH_DEG),
      CITY_RANGE_METERS,
    ),
    duration: CITY_FLIGHT_SECONDS,
    easingFunction: Cesium.EasingFunction.QUINTIC_IN_OUT,
    complete: onArrive,
    cancel: onArrive,
  })
}

export function flyHome(Cesium: CesiumModule, camera: Camera, longitude: number, onDone: () => void): void {
  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(longitude, HOME_LATITUDE, HOME_HEIGHT),
    orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    duration: 1.6,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    complete: onDone,
    cancel: onDone,
  })
}

/** Rise to a top-down view over whatever the camera is currently looking at. */
export function flyLevel(Cesium: CesiumModule, scene: Scene, onDone: () => void): void {
  const state = readCameraState(Cesium, scene)
  const height = Math.max(scene.camera.positionCartographic.height * 2.5, 40_000)
  scene.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(state.longitude, state.latitude, height),
    orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    duration: 1.0,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    complete: onDone,
    cancel: onDone,
  })
}
