'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { SearchBar } from './search-bar'
import { CityInfoPanel } from './city-info-panel'
import { MapControls } from './map-controls'
import { HudOverlay } from './hud-overlay'
import { WeatherMarker } from './weather-marker'
import { BootSequence } from './boot-sequence'
import { HoloBeacon } from './holo/holo-beacon'
import { MapProjectionFX, AtmosphereFX } from './holographic-overlays'
import { ScreenAnchors, type ScreenAnchorItem } from './globe/screen-anchors'
import { CreditsLine } from './globe/credits-line'
import { SensorSelector } from './globe/sensor-selector'
import { useViewportData } from '@/hooks/use-viewport-data'
import { buildCredits } from '@/lib/globe/credits'
import type { CameraState, GlobeHandle, ImageryMode, ViewBounds } from '@/lib/globe/types'
import { DEFAULT_SENSOR_MODE, isSensorMode, sensorModeForKey, type SensorMode } from '@/lib/globe/sensors/modes'

// Cesium touches window/WebGL at import time: client-only, never server-rendered.
const GlobeViewer = dynamic(() => import('./globe/globe-viewer'), { ssr: false })

export interface SelectedCity {
  name: string
  displayName: string
  latitude: number
  longitude: number
  country?: string
  state?: string
}

const SENSOR_STORAGE_KEY = 'aegis.sensorMode'

/** True when a key press should go to a text field, not a global shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

const INITIAL_CAMERA: CameraState = { latitude: 20, longitude: 0, height: 20_000_000, zoom: 2.8 }

export function JarvisMap() {
  const [globe, setGlobe] = useState<GlobeHandle | null>(null)
  const [camera, setCamera] = useState<CameraState>(INITIAL_CAMERA)
  const [bounds, setBounds] = useState<ViewBounds | null>(null)
  const [settledZoom, setSettledZoom] = useState(INITIAL_CAMERA.zoom)
  const [imagery, setImagery] = useState<ImageryMode | null>(null)
  const [selectedCity, setSelectedCity] = useState<SelectedCity | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [showWeather, setShowWeather] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isBooted, setIsBooted] = useState(false)
  const [sensor, setSensor] = useState<SensorMode>(DEFAULT_SENSOR_MODE)

  // Restore the last sensor mode after mount (localStorage isn't available during SSR, and
  // reading it in the initial state would mismatch hydration). Storage can throw: ignore.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SENSOR_STORAGE_KEY)
      if (isSensorMode(saved)) setSensor(saved)
    } catch {
      // Private mode / blocked storage: keep the default.
    }
  }, [])

  useEffect(() => {
    globe?.setSensor(sensor)
    try {
      window.localStorage.setItem(SENSOR_STORAGE_KEY, sensor)
    } catch {
      // Not persisted; the mode still applies for this session.
    }
  }, [globe, sensor])

  // Keys 1-6 pick a sensor mode, except while typing or with modifiers held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      const mode = sensorModeForKey(e.key)
      if (mode) setSensor(mode)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Bounds refresh only when the camera settles, so viewport data doesn't churn mid-flight.
  const handleViewSettled = useCallback((next: ViewBounds | null, state: CameraState) => {
    setBounds((prev) => (sameBounds(prev, next) ? prev : next))
    setSettledZoom(state.zoom)
  }, [])

  const { cities, isLoadingCities } = useViewportData(bounds, settledZoom)

  const handleCitySelect = useCallback(
    (city: SelectedCity) => {
      if (!globe) return
      setIsLoading(true)
      setSelectedCity(city)
      setIsPanelOpen(false)
      // Cinematic flight that ends pitched toward the city; the panel opens on arrival.
      globe.flyToCity(city, () => {
        setIsPanelOpen(true)
        setIsLoading(false)
      })
    },
    [globe],
  )

  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false)
    setSelectedCity(null)
    globe?.levelView()
  }, [globe])

  const handleBackgroundClick = useCallback(() => {
    setIsPanelOpen(false)
    setSelectedCity(null)
  }, [])

  // Must be stable: BootSequence restarts its timers when onComplete changes, and the
  // idle-rotating globe re-renders this component ~10×/s.
  const handleBootComplete = useCallback(() => setIsBooted(true), [])

  const handleResetView = useCallback(() => {
    globe?.resetView()
    setSelectedCity(null)
    setIsPanelOpen(false)
  }, [globe])

  const anchors = useMemo<ScreenAnchorItem[]>(() => {
    const items: ScreenAnchorItem[] = []
    if (showWeather) {
      for (const city of cities) {
        items.push({
          id: `weather:${city.id}`,
          point: city,
          anchor: 'bottom',
          node: (
            <WeatherMarker
              city={city}
              onClick={() =>
                handleCitySelect({
                  name: city.name,
                  displayName: city.displayName,
                  latitude: city.latitude,
                  longitude: city.longitude,
                  country: city.country,
                })
              }
            />
          ),
        })
      }
    }
    if (selectedCity) {
      items.push({
        id: 'selected-city',
        point: selectedCity,
        anchor: 'center',
        node: <HoloBeacon size={18} rings={4} />,
      })
    }
    return items
  }, [showWeather, cities, selectedCity, handleCitySelect])

  const credits = useMemo(() => buildCredits(imagery, []), [imagery])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-jarvis-bg">
      {/* Boot sequence stays opaque; the globe mounts and rotates underneath and is revealed on fade. */}
      {!isBooted && <BootSequence onComplete={handleBootComplete} />}

      <GlobeViewer
        onReady={setGlobe}
        onCameraChange={setCamera}
        onViewSettled={handleViewSettled}
        onImageryReady={setImagery}
        onBackgroundClick={handleBackgroundClick}
        concealed={!isBooted}
      />

      <ScreenAnchors globe={globe} items={anchors} />

      {/* Holographic projection effects cast over the globe */}
      <MapProjectionFX />

      <HudOverlay
        zoom={camera.zoom}
        latitude={camera.latitude}
        longitude={camera.longitude}
        isLoading={isLoading || isLoadingCities}
        activeNodes={showWeather ? cities.length : 0}
        tracking={0}
        rightColumnHidden={isPanelOpen}
      />

      <SensorSelector mode={sensor} onChange={setSensor} hidden={isPanelOpen} />

      <SearchBar onCitySelect={handleCitySelect} isLoading={isLoading} />

      <MapControls
        showWeather={showWeather}
        onToggleWeather={() => setShowWeather((v) => !v)}
        onResetView={handleResetView}
      />

      <CityInfoPanel city={selectedCity} isOpen={isPanelOpen} onClose={handleClosePanel} />

      <CreditsLine credits={credits} />

      {/* Top-most ambiance: gentle vignette + soft cyan glow */}
      <AtmosphereFX />
    </div>
  )
}

function sameBounds(a: ViewBounds | null, b: ViewBounds | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const k = (v: ViewBounds) => `${v.north.toFixed(3)},${v.south.toFixed(3)},${v.east.toFixed(3)},${v.west.toFixed(3)}`
  return k(a) === k(b)
}
