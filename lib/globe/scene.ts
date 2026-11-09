import type { Viewer } from 'cesium'
import type { CesiumModule } from './cesium-env'
import { HOME_HEIGHT, HOME_LATITUDE } from './camera'
import { createStarfield } from './starfield'

/** AEGIS background (--color-jarvis-bg #00060e). */
const SPACE_COLOR = '#00060e'

export function createViewer(Cesium: CesiumModule, container: HTMLElement, creditContainer: HTMLElement): Viewer {
  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    vrButton: false,
    // Imagery is added by the fallback chain in imagery.ts.
    baseLayer: false,
    creditContainer,
    shouldAnimate: true,
    // Render at CSS pixels, not 2× Retina: the biggest single lever for 60 fps on a 3024×1964 panel.
    useBrowserRecommendedResolution: true,
    msaaSamples: 2,
    // Cap at 60 so a 120 Hz ProMotion display doesn't double the GPU work.
    targetFrameRate: 60,
    skyBox: createStarfield(Cesium),
  })
  configureScene(Cesium, viewer)
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(terminatorLongitude(new Date()), HOME_LATITUDE, HOME_HEIGHT),
  })
  return viewer
}

/**
 * Longitude ~70° east of the subsolar point: the start view straddles the evening terminator,
 * daylit land on one side and city lights on the other, whatever the time of day.
 * (Subsolar longitude ≈ (12 − UTC hours) × 15°, ignoring the equation of time.)
 */
function terminatorLongitude(now: Date): number {
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60
  const subsolar = (12 - utcHours) * 15
  const lon = subsolar + 70
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

function configureScene(Cesium: CesiumModule, viewer: Viewer): void {
  const { scene } = viewer
  const { globe } = scene

  // Apple GPUs: Cesium's per-vertex model-atmosphere shader binds varyings to `out` params, which ANGLE's Metal
  // backend fails to LINK, killing the render loop. That stage is only attached when fog is renderable, so turning
  // that off keeps it out of the pipeline. Fog density (used for tile LOD) still updates.
  // Technique from gods-eye-view (MIT, © 2026 Bilawal Sidhu), src/app/atmosphereCompat.js.
  scene.fog.renderable = false

  scene.backgroundColor = Cesium.Color.fromCssColorString(SPACE_COLOR)
  globe.baseColor = Cesium.Color.fromCssColorString('#020c18')

  // Sun-driven day/night terminator with a dark, cool atmosphere.
  globe.enableLighting = true
  globe.dynamicAtmosphereLighting = true
  globe.dynamicAtmosphereLightingFromSun = true
  globe.showGroundAtmosphere = true
  globe.atmosphereLightIntensity = 8
  globe.atmosphereBrightnessShift = -0.15
  globe.atmosphereSaturationShift = -0.1
  globe.lightingFadeOutDistance = 6_500_000
  globe.lightingFadeInDistance = 9_000_000
  globe.nightFadeOutDistance = 6_500_000
  globe.nightFadeInDistance = 9_000_000

  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true
    scene.skyAtmosphere.brightnessShift = -0.25
    scene.skyAtmosphere.saturationShift = -0.15
    scene.skyAtmosphere.hueShift = 0.02
  }
  if (scene.sun) scene.sun.glowFactor = 0.6
  if (scene.moon) scene.moon.show = true

  // Starfield: procedural (see starfield.ts), passed as the Viewer's skyBox.
  if (scene.skyBox) scene.skyBox.show = true

  // Gentler zoom and a sensible floor/ceiling.
  const controller = scene.screenSpaceCameraController
  controller.minimumZoomDistance = 150
  controller.maximumZoomDistance = 45_000_000
}

const ROTATION_DEG_PER_SEC = 2
const RESUME_AFTER_MS = 30_000
/** Only spin while looking at the whole planet; never drift away from a city the user zoomed into. */
const MIN_ROTATE_HEIGHT = 5_000_000

export interface IdleRotation {
  /**
   * Suspend while a scripted flight runs. Ending a flight counts as input (rotation waits
   * 30 s) unless `holdAfter` is false, e.g. for the hidden boot-time shader warm-up.
   */
  setFlightActive(active: boolean, holdAfter?: boolean): void
  destroy(): void
}

/**
 * Slow eastward spin while nobody is touching the globe. Stops on the first pointer, wheel, touch
 * or key input and resumes after 30 s of quiet (only when zoomed out to the whole planet).
 */
export function startIdleRotation(Cesium: CesiumModule, viewer: Viewer): IdleRotation {
  const canvas = viewer.scene.canvas
  let lastInput = Number.NEGATIVE_INFINITY
  let flightActive = false
  let lastTick = performance.now()

  const markInput = () => {
    lastInput = performance.now()
  }
  const inputEvents = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const
  for (const type of inputEvents) canvas.addEventListener(type, markInput, { passive: true })

  const removeTick = viewer.scene.preUpdate.addEventListener(() => {
    const now = performance.now()
    const dt = Math.min((now - lastTick) / 1000, 0.1)
    lastTick = now
    if (flightActive || now - lastInput < RESUME_AFTER_MS) return
    const camera = viewer.camera
    if (!Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) return
    if (camera.positionCartographic.height < MIN_ROTATE_HEIGHT) return
    camera.rotate(Cesium.Cartesian3.UNIT_Z, -Cesium.Math.toRadians(ROTATION_DEG_PER_SEC) * dt)
  })

  return {
    setFlightActive(active, holdAfter = true) {
      flightActive = active
      if (!active && holdAfter) markInput()
    },
    destroy() {
      removeTick()
      for (const type of inputEvents) canvas.removeEventListener(type, markInput)
    },
  }
}
