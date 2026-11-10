import type { Scene, Viewer } from 'cesium'
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
  setFlatLighting(scene, false)

  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true
    scene.skyAtmosphere.brightnessShift = SKY_BRIGHTNESS
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

const LIGHTING_FADE_OUT = 6_500_000
const LIGHTING_FADE_IN = 9_000_000

/**
 * Flat lighting removes the day/night falloff (NVG, FLIR show the whole disc) without
 * turning `enableLighting` off: that would drop a shader define (recompile on every mode
 * switch) and the night-side blend that places city lights. Only uniforms change here:
 *  - globe lighting fade beyond any camera distance -> surface fully lit everywhere;
 *  - night-fade distances inverted below any camera distance -> ground atmosphere never
 *    darkens toward night (GlobeFS: sunlit = (d - in) / (out - in), clamped to 1).
 */
export function setFlatLighting(scene: Scene, flat: boolean): void {
  const globe = scene.globe
  if (flat) {
    globe.lightingFadeOutDistance = 1e10
    globe.lightingFadeInDistance = 1.1e10
    globe.nightFadeOutDistance = 2
    globe.nightFadeInDistance = 1
  } else {
    globe.lightingFadeOutDistance = LIGHTING_FADE_OUT
    globe.lightingFadeInDistance = LIGHTING_FADE_IN
    globe.nightFadeOutDistance = LIGHTING_FADE_OUT
    globe.nightFadeInDistance = LIGHTING_FADE_IN
  }
}

const SKY_FADE_START = 800_000
const SKY_HIDE_ABOVE = 1_500_000
const SKY_BRIGHTNESS = -0.25

/**
 * Cesium's sky-atmosphere shell renders as a thin dotted ring on the globe limb from orbit
 * (isolated by toggling: skirts, tessellation, MSAA 4 and per-fragment atmosphere all kept
 * the dots; hiding the shell removed them). From orbit the silhouette comes from the
 * post-process rim instead; near the ground the shell still draws the horizon sky. It fades
 * out through its brightness uniform between 800 and 1,500 km, then hides.
 */
export function updateSkyAtmosphere(scene: Scene, cameraHeight: number): void {
  const sky = scene.skyAtmosphere
  if (!sky) return
  const t = Math.min(1, Math.max(0, (cameraHeight - SKY_FADE_START) / (SKY_HIDE_ABOVE - SKY_FADE_START)))
  sky.show = t < 1
  sky.brightnessShift = SKY_BRIGHTNESS - t * (1 + SKY_BRIGHTNESS)
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
