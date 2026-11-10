import type { PostProcessStage, Scene } from 'cesium'
import type { CesiumModule } from '../cesium-env'
import { DEFAULT_SENSOR_MODE, type SensorMode } from './modes'
import { SENSOR_SHADERS } from './shaders'

type StagedMode = keyof typeof SENSOR_SHADERS

export interface SensorController {
  readonly mode: SensorMode
  setMode(mode: SensorMode): void
  /**
   * Compile every stage's shader up front: enable each for a couple of frames (hidden behind
   * the boot overlay), then restore the current mode. Avoids a GPU-process compile stall the
   * first time a mode is picked.
   */
  warmUp(onDone: () => void): () => void
  destroy(): void
}

/**
 * One PostProcessStage per mode, all created at start-up and disabled; switching modes only
 * flips `enabled`, so no shader is built mid-session. `time` is a uniform function Cesium
 * evaluates per frame, and only enabled stages execute, so idle modes cost nothing.
 */
export function createSensorController(
  Cesium: CesiumModule,
  scene: Scene,
  /** Scene-side changes for a mode (night profile, lighting); called whenever a mode is applied. */
  onApply: (mode: SensorMode) => void,
): SensorController {
  const t0 = performance.now()
  const elapsed = () => (performance.now() - t0) / 1000
  const stages = new Map<StagedMode, PostProcessStage>()

  for (const [mode, shader] of Object.entries(SENSOR_SHADERS) as Array<[StagedMode, (typeof SENSOR_SHADERS)[StagedMode]]>) {
    const stage = new Cesium.PostProcessStage({
      name: `aegis_sensor_${mode}`,
      fragmentShader: shader.source,
      uniforms: shader.animated ? { time: elapsed } : {},
    })
    stage.enabled = false
    scene.postProcessStages.add(stage)
    stages.set(mode, stage)
  }

  let current: SensorMode = DEFAULT_SENSOR_MODE
  const apply = (mode: SensorMode) => {
    for (const [id, stage] of stages) stage.enabled = id === mode
    onApply(mode)
  }
  apply(current)

  return {
    get mode() {
      return current
    },
    setMode(mode) {
      current = mode
      apply(mode)
    },
    warmUp(onDone) {
      // Every mode, not just staged ones, so each scene profile is also exercised once.
      const order: SensorMode[] = [...stages.keys(), 'raw']
      let frame = 0
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        remove()
        apply(current)
        onDone()
      }
      const remove = scene.preRender.addEventListener(() => {
        const step = Math.floor(frame++ / 2)
        if (step >= order.length) {
          finish()
          return
        }
        apply(order[step])
      })
      return finish
    },
    destroy() {
      for (const stage of stages.values()) {
        if (!scene.isDestroyed()) scene.postProcessStages.remove(stage)
      }
      stages.clear()
    },
  }
}
