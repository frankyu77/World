import type { Viewer } from 'cesium'
import type { CesiumModule } from './cesium-env'

/**
 * Cesium compiles globe shader variants lazily as the camera crosses height thresholds
 * (lighting/night fade, per-fragment vs per-vertex ground atmosphere, fog). On Apple
 * Metal each compile batch runs in the GPU process and stalled a city flight by
 * 100-380 ms around 125 km. Measured during a Tokyo/Paris descent, new programs
 * appeared at ~6000, 790, 380, 130, 55 and 10 km.
 *
 * While the opaque boot overlay hides the globe, sweep the camera down through those
 * bands one step per frame so the variants compile up front, then restore the start
 * view. Spreading it across frames keeps the boot animation smooth; the overlay keeps
 * it invisible.
 */
const SWEEP_HEIGHTS_M = [
  9_000_000, 6_000_000, 4_000_000, 2_500_000, 1_500_000, 800_000, 500_000, 350_000, 200_000, 125_000,
  80_000, 50_000, 30_000, 15_000, 9_000,
]
const FRAMES_PER_STEP = 2

export function warmUpShaders(Cesium: CesiumModule, viewer: Viewer, onDone: () => void): () => void {
  const { scene } = viewer
  const camera = scene.camera
  const start = {
    destination: Cesium.Cartesian3.clone(camera.positionWC),
    orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
  }
  const carto = camera.positionCartographic
  const lon = carto.longitude
  const lat = carto.latitude
  // The city-flight look (pitched, so the horizon and sky atmosphere are in frame too).
  const pitch = Cesium.Math.toRadians(-38)

  let step = 0
  let frame = 0
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    remove()
    camera.setView(start)
    onDone()
  }
  const remove = scene.preRender.addEventListener(() => {
    if (frame++ % FRAMES_PER_STEP !== 0) return
    if (step >= SWEEP_HEIGHTS_M.length) {
      finish()
      return
    }
    camera.setView({
      destination: Cesium.Cartesian3.fromRadians(lon, lat, SWEEP_HEIGHTS_M[step]),
      orientation: { heading: 0, pitch, roll: 0 },
    })
    step++
  })
  return finish
}
