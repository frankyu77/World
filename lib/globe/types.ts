import type { SensorMode } from './sensors/modes'

/** Geographic bounds of the visible globe area, in degrees. `west > east` means the view crosses the antimeridian. */
export interface ViewBounds {
  north: number
  south: number
  east: number
  west: number
}

/** Camera readout for the HUD. `zoom` is a web-mercator-equivalent level derived from camera height. */
export interface CameraState {
  latitude: number
  longitude: number
  height: number
  zoom: number
}

export interface GeoPoint {
  latitude: number
  longitude: number
}

/** One attribution in the HUD credits line. */
export interface CreditEntry {
  id: string
  label: string
  href?: string
}

export type ImageryMode = 'ion' | 'google3d' | 'esri'

/** A world position projected to the viewport for DOM overlays. */
export interface ScreenPoint {
  x: number
  y: number
  visible: boolean
}

export type FrameListener = () => void

export type { SensorMode }

/** Imperative API the globe exposes to the orchestrator via ref. */
export interface GlobeHandle {
  /** Cinematic flight that ends pitched toward the point; `onArrive` fires when the flight completes. */
  flyToCity(point: GeoPoint, onArrive: () => void): void
  /** Ease back to a whole-globe view. */
  resetView(): void
  /** Ease the camera back to level after a city flight (keeps position). */
  levelView(): void
  /** Project a ground point to viewport pixels; `visible` is false when behind the globe or off-screen. */
  project(point: GeoPoint, heightMeters?: number): ScreenPoint
  /** Switch the post-process sensor grade (AEGIS, NVG, FLIR, CRT, NOIR, RAW). */
  setSensor(mode: SensorMode): void
  /** Called after every rendered frame. Returns an unsubscribe function. */
  onFrame(listener: FrameListener): () => void
}
