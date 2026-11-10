'use client'

import { useEffect, useRef } from 'react'
import type { Viewer } from 'cesium'
import { loadCesium } from '@/lib/globe/cesium-env'
import { createViewer, setFlatLighting, startIdleRotation, updateSkyAtmosphere } from '@/lib/globe/scene'
import { applyNightProfile, fadeNightLights, setupImagery, type ImageryResult } from '@/lib/globe/imagery'
import { nightProfileFor } from '@/lib/globe/sensors/modes'
import { warmUpShaders } from '@/lib/globe/warmup'
import { prefetchDestinationTiles } from '@/lib/globe/prefetch'
import { createSensorController } from '@/lib/globe/sensors/controller'
import { LayerManager, type LiveStats } from '@/lib/globe/layers/manager'
import { flyHome, flyLevel, flyToCity, readCameraState, readViewBounds } from '@/lib/globe/camera'
import type { CameraState, FrameListener, GlobeHandle, ImageryMode, ScreenPoint, ViewBounds } from '@/lib/globe/types'

export interface GlobeViewerProps {
  onReady: (handle: GlobeHandle) => void
  /** Throttled camera readout for the HUD (about 10 Hz while moving). */
  onCameraChange: (state: CameraState) => void
  /** Fired when the camera comes to rest, with the visible ground bounds. */
  onViewSettled: (bounds: ViewBounds | null, state: CameraState) => void
  onImageryReady: (mode: ImageryMode) => void
  /** A click on the globe that did not land on any interactive object. */
  onBackgroundClick: () => void
  /** True while the boot overlay hides the globe; used to compile shaders invisibly. */
  concealed: boolean
  /** Live-layer counts, data age and availability, ~2 Hz. */
  onLiveStats: (stats: LiveStats) => void
}

interface AegisPerfProbe {
  frameTimes: number[]
  cpuMs: number[]
  viewer: Viewer
  liveStats?: LiveStats
  layers?: LayerManager
}

declare global {
  interface Window {
    __aegisPerf?: AegisPerfProbe
  }
}

const HIDDEN: ScreenPoint = { x: 0, y: 0, visible: false }
const CAMERA_EMIT_MS = 100
const SETTLED_THROTTLE_MS = 1500
const SETTLED_DEBOUNCE_MS = 250
/** After a city flight lands, wait at most this long for sharp tiles before opening the panel. */
const ARRIVAL_TILE_WAIT_MS = 2000

/**
 * Client-only Cesium host. Loaded through next/dynamic with ssr:false: Cesium touches
 * window and WebGL at import time, so it must never be evaluated on the server.
 */
export default function GlobeViewer({
  onReady,
  onCameraChange,
  onViewSettled,
  onImageryReady,
  onBackgroundClick,
  concealed,
  onLiveStats,
}: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const creditRef = useRef<HTMLDivElement>(null)
  // Latest callbacks, so the Cesium setup effect runs once.
  const callbacks = useRef({ onReady, onCameraChange, onViewSettled, onImageryReady, onBackgroundClick, onLiveStats })
  callbacks.current = { onReady, onCameraChange, onViewSettled, onImageryReady, onBackgroundClick, onLiveStats }
  const concealedRef = useRef(concealed)
  concealedRef.current = concealed
  // Cancels a running shader warm-up (restoring the start view); set while one runs.
  const cancelWarmUp = useRef<(() => void) | null>(null)

  // Boot ended before the warm-up finished: stop it so the globe is revealed at the start view.
  useEffect(() => {
    if (!concealed) cancelWarmUp.current?.()
  }, [concealed])

  useEffect(() => {
    let cancelled = false
    let viewer: Viewer | null = null
    const teardown: Array<() => void> = []

    void (async () => {
      const Cesium = await loadCesium()
      const container = containerRef.current
      const creditContainer = creditRef.current
      if (cancelled || !container || !creditContainer) return

      const v = createViewer(Cesium, container, creditContainer)
      viewer = v
      const { scene, camera } = v
      const rotation = startIdleRotation(Cesium, v)
      teardown.push(() => rotation.destroy())
      // Per-mode scene side: night profile on the imagery, flat lighting for NVG/FLIR. The
      // imagery layers arrive later (setupImagery); the current mode is re-applied then.
      let imageryLayers: Pick<ImageryResult, 'baseLayer' | 'nightLayer'> | null = null
      const sensors = createSensorController(Cesium, scene, (mode) => {
        const profile = nightProfileFor(mode)
        setFlatLighting(scene, profile === 'flat')
        if (imageryLayers) applyNightProfile(imageryLayers, profile)
      })
      const layers = new LayerManager(Cesium, scene, (stats) => {
        if (window.__aegisPerf) window.__aegisPerf.liveStats = stats
        callbacks.current.onLiveStats(stats)
      })
      teardown.push(() => layers.destroy())
      teardown.push(scene.preUpdate.addEventListener(() => layers.frame(Date.now())))
      updateSkyAtmosphere(scene, camera.positionCartographic.height)
      teardown.push(scene.preUpdate.addEventListener(() => updateSkyAtmosphere(scene, camera.positionCartographic.height)))
      teardown.push(() => sensors.destroy())

      // Camera readouts: throttled while moving, plus a settled event with bounds.
      let lastEmit = 0
      let warming = false
      camera.percentageChanged = 0.001
      teardown.push(
        camera.changed.addEventListener(() => {
          if (warming) return
          const now = performance.now()
          if (now - lastEmit < CAMERA_EMIT_MS) return
          lastEmit = now
          callbacks.current.onCameraChange(readCameraState(Cesium, scene))
        }),
      )
      let lastSettled = 0
      const emitSettled = () => {
        if (warming) return
        lastSettled = performance.now()
        const state = readCameraState(Cesium, scene)
        callbacks.current.onCameraChange(state)
        const bounds = readViewBounds(Cesium, scene)
        layers.setView(bounds)
        callbacks.current.onViewSettled(bounds, state)
      }
      teardown.push(camera.moveEnd.addEventListener(emitSettled))
      // moveEnd alone isn't reliable: a camera that never stops (idle rotation, a long drag)
      // never raises it, and it was observed not firing after scripted flights. So also:
      //  - throttle: refresh at most every SETTLED_THROTTLE_MS while the camera keeps moving;
      //  - trailing debounce: refresh once the camera has been still for SETTLED_DEBOUNCE_MS.
      let settleTimer: ReturnType<typeof setTimeout> | undefined
      teardown.push(
        camera.changed.addEventListener(() => {
          if (performance.now() - lastSettled >= SETTLED_THROTTLE_MS) emitSettled()
          clearTimeout(settleTimer)
          settleTimer = setTimeout(emitSettled, SETTLED_DEBOUNCE_MS)
        }),
        () => clearTimeout(settleTimer),
      )

      // Frame listeners for DOM overlays pinned to world positions.
      const frameListeners = new Set<FrameListener>()
      teardown.push(
        scene.postRender.addEventListener(() => {
          for (const listener of frameListeners) listener()
        }),
      )

      // Perf probe for the profiling harness: rendered-frame timestamps and main-thread CPU
      // time per frame (preRender → postRender, excludes GPU). Always on in dev; in production
      // only with ?perf in the URL.
      if (process.env.NODE_ENV !== 'production' || new URLSearchParams(window.location.search).has('perf')) {
        const perf: AegisPerfProbe = { frameTimes: [], cpuMs: [], viewer: v, layers }
        window.__aegisPerf = perf
        let frameStart = 0
        teardown.push(
          scene.preRender.addEventListener(() => {
            frameStart = performance.now()
          }),
          scene.postRender.addEventListener(() => {
            const now = performance.now()
            perf.frameTimes.push(now)
            perf.cpuMs.push(now - frameStart)
            if (perf.frameTimes.length > 4000) {
              perf.frameTimes.splice(0, 2000)
              perf.cpuMs.splice(0, 2000)
            }
          }),
          () => {
            delete window.__aegisPerf
          },
        )
      }

      const occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, camera.positionWC)
      const scratch = new Cesium.Cartesian3()
      const scratchWindow = new Cesium.Cartesian2()

      let imageryMode: ImageryMode | null = null
      let prefetch: AbortController | null = null
      teardown.push(() => prefetch?.abort())

      /** Resolves once the globe has every visible tile, or after `capMs`. */
      const whenTilesLoaded = (capMs: number, done: () => void) => {
        const started = performance.now()
        let finished = false
        const finish = () => {
          if (finished) return
          finished = true
          remove()
          done()
        }
        const remove = scene.postRender.addEventListener(() => {
          if (scene.globe.tilesLoaded || performance.now() - started >= capMs) finish()
        })
        // postRender stops if the tab is hidden; the cap still has to hold.
        setTimeout(finish, capMs + 100)
      }

      let flightSeq = 0
      const handle: GlobeHandle = {
        flyToCity(point, onArrive) {
          const seq = ++flightSeq
          rotation.setFlightActive(true)
          prefetch?.abort()
          prefetch = imageryMode === 'esri' ? prefetchDestinationTiles(point) : null
          flyToCity(Cesium, camera, point, () => {
            rotation.setFlightActive(false)
            emitSettled()
            // Hold the panel until the destination is sharp (capped), so it opens on crisp imagery.
            whenTilesLoaded(ARRIVAL_TILE_WAIT_MS, () => {
              if (seq === flightSeq) onArrive()
            })
          })
        },
        resetView() {
          rotation.setFlightActive(true)
          flyHome(Cesium, camera, readCameraState(Cesium, scene).longitude, () => {
            rotation.setFlightActive(false)
            emitSettled()
          })
        },
        levelView() {
          rotation.setFlightActive(true)
          flyLevel(Cesium, scene, () => {
            rotation.setFlightActive(false)
            emitSettled()
          })
        },
        project(point, heightMeters = 0) {
          const world = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, heightMeters, undefined, scratch)
          occluder.cameraPosition = camera.positionWC
          if (scene.globe.show && !occluder.isPointVisible(world)) return HIDDEN
          const win = Cesium.SceneTransforms.worldToWindowCoordinates(scene, world, scratchWindow)
          if (!win) return HIDDEN
          const visible = win.x >= -50 && win.y >= -50 && win.x <= scene.canvas.clientWidth + 50 && win.y <= scene.canvas.clientHeight + 50
          return { x: win.x, y: win.y, visible }
        },
        setSensor(mode) {
          sensors.setMode(mode)
        },
        setLayerEnabled(layer, enabled) {
          layers.setEnabled(layer, enabled)
        },
        setSatelliteSet(set) {
          layers.setSatelliteSet(set)
        },
        onFrame(listener) {
          frameListeners.add(listener)
          return () => frameListeners.delete(listener)
        },
      }

      // Clicks on empty globe (no picked object) dismiss the city panel, like the old map.
      const clicks = new Cesium.ScreenSpaceEventHandler(scene.canvas)
      clicks.setInputAction((event: { position: InstanceType<typeof Cesium.Cartesian2> }) => {
        if (!scene.pick(event.position)) callbacks.current.onBackgroundClick()
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      teardown.push(() => clicks.destroy())

      callbacks.current.onReady(handle)
      emitSettled()

      const imagery = await setupImagery(Cesium, v)
      if (cancelled) return
      if (imagery.skipped.length > 0) console.info('[globe] imagery fallback:', imagery.skipped.join('; '))
      const nightLayer = imagery.nightLayer
      if (nightLayer) {
        fadeNightLights(nightLayer, camera.positionCartographic.height)
        teardown.push(
          scene.preUpdate.addEventListener(() => fadeNightLights(nightLayer, camera.positionCartographic.height)),
        )
      }
      imageryMode = imagery.mode
      imageryLayers = imagery
      sensors.setMode(sensors.mode)
      callbacks.current.onImageryReady(imagery.mode)

      if (concealedRef.current) {
        warming = true
        rotation.setFlightActive(true)
        const done = () => {
          warming = false
          cancelWarmUp.current = null
          rotation.setFlightActive(false, false)
          emitSettled()
        }
        // Height sweep (globe variants), then each sensor stage, all behind the boot overlay.
        let cancelSensors: (() => void) | null = null
        const cancelSweep = warmUpShaders(Cesium, v, () => {
          if (!concealedRef.current) {
            done()
            return
          }
          cancelSensors = sensors.warmUp(done)
        })
        const cancelAll = () => {
          cancelSweep()
          cancelSensors?.()
        }
        cancelWarmUp.current = cancelAll
        teardown.push(cancelAll)
      }
    })()

    return () => {
      cancelled = true
      for (const fn of teardown.splice(0)) fn()
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {/* Cesium's credit container stays mounted: it carries logos some providers require. */}
      <div ref={creditRef} className="aegis-cesium-credits pointer-events-auto fixed bottom-1.5 right-3 z-20" />
    </>
  )
}
