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
import { TargetCard } from './globe/target-card'
import { TargetReticle } from './globe/target-reticle'
import type { TargetInfo } from '@/lib/globe/tracking'
import { useViewportData } from '@/hooks/use-viewport-data'
import { CloudSun, Flame, Plane, Satellite, Waves } from 'lucide-react'
import { buildCredits, isImageryCredit, type CreditKey } from '@/lib/globe/credits'
import type { CameraState, GlobeHandle, ImageryMode, LayerId, SatelliteSet, ViewBounds } from '@/lib/globe/types'
import type { LiveStats } from '@/lib/globe/layers/manager'
import type { LayerToggle } from './map-controls'
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
  /** OSM object from the search result (e.g. "R1543125"), for exact population lookup. */
  osmRef?: string
}

const SENSOR_STORAGE_KEY = 'aegis.sensorMode'

/** True when a key press should go to a text field, not a global shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

const LIVE_LAYERS: ReadonlyArray<{ id: LayerId; label: string; icon: LayerToggle['icon'] }> = [
  { id: 'flights', label: 'Flights', icon: Plane },
  { id: 'satellites', label: 'Satellites', icon: Satellite },
  { id: 'earthquakes', label: 'Quakes', icon: Waves },
  { id: 'fires', label: 'Fires', icon: Flame },
]

const SATELLITE_SETS: Array<{ value: SatelliteSet; label: string }> = [
  { value: 'curated', label: 'CURATED' },
  { value: 'active', label: 'ALL ACTIVE' },
]

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
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({ flights: true, satellites: true, earthquakes: true, fires: true })
  const [satelliteSet, setSatelliteSet] = useState<SatelliteSet>('curated')
  const [live, setLive] = useState<LiveStats | null>(null)
  const [target, setTarget] = useState<TargetInfo | null>(null)

  const releaseTarget = useCallback(() => {
    globe?.releaseTarget()
    setTarget(null)
  }, [globe])

  // Esc releases the tracked target (unless the user is typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTypingTarget(e.target)) releaseTarget()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [releaseTarget])

  // Push layer state to the globe (enabling a layer starts its polling).
  useEffect(() => {
    if (!globe) return
    for (const { id } of LIVE_LAYERS) globe.setLayerEnabled(id, layers[id])
  }, [globe, layers])

  useEffect(() => {
    globe?.setSatelliteSet(satelliteSet)
  }, [globe, satelliteSet])

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

  const firesAvailable = live?.firesAvailable ?? null
  const flightSource = live?.flights?.source ?? null
  // Credit exactly what is on screen: the flight source that served this view, plus each live layer.
  const credits = useMemo(() => {
    const keys: CreditKey[] = []
    if (layers.flights && flightSource) keys.push(flightSource === 'opensky' ? 'flights:opensky' : 'flights:adsb.lol')
    if (layers.satellites) keys.push('satellites')
    if (layers.earthquakes) keys.push('earthquakes')
    if (layers.fires && firesAvailable) keys.push('fires')
    return buildCredits(imagery, keys)
  }, [imagery, layers, flightSource, firesAvailable])

  // Full list in Cesium's "Data attribution" popup (the on-screen line truncates).
  useEffect(() => {
    globe?.setAttribution(credits.filter((c) => !isImageryCredit(c)))
  }, [globe, credits])

  const toggles = useMemo<LayerToggle[]>(() => {
    const list: LayerToggle[] = LIVE_LAYERS.map(({ id, label, icon }) => {
      const noKey = id === 'fires' && firesAvailable === false
      return {
        id,
        label,
        icon,
        active: layers[id] && !noKey,
        disabled: noKey,
        tag: noKey ? 'NO KEY' : undefined,
        count: live?.counts[id],
      }
    })
    list.push({ id: 'weather', label: 'Weather', icon: CloudSun, active: showWeather, count: showWeather ? cities.length : undefined })
    return list
  }, [layers, firesAvailable, live, showWeather, cities.length])

  const handleToggle = useCallback((id: string) => {
    if (id === 'weather') {
      setShowWeather((v) => !v)
      return
    }
    setLayers((prev) => {
      const key = id as LayerId
      return key in prev ? { ...prev, [key]: !prev[key] } : prev
    })
  }, [])

  const weatherNodes = showWeather ? cities.length : 0

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
        onLiveStats={setLive}
        onTargetInfo={setTarget}
      />

      <ScreenAnchors globe={globe} items={anchors} />

      <TargetReticle
        globe={globe}
        active={target?.kind === 'aircraft' || target?.kind === 'satellite'}
        rangeKm={target && (target.kind === 'aircraft' || target.kind === 'satellite') ? target.rangeKm : null}
      />

      {/* Holographic projection effects cast over the globe */}
      <MapProjectionFX />

      <HudOverlay
        zoom={camera.zoom}
        latitude={camera.latitude}
        longitude={camera.longitude}
        isLoading={isLoading || isLoadingCities}
        activeNodes={(live?.activeNodes ?? 0) + weatherNodes}
        tracking={live?.tracking ?? 0}
        rightColumnHidden={isPanelOpen}
        flightFeed={live?.flights ?? null}
      />

      <SensorSelector mode={sensor} onChange={setSensor} hidden={isPanelOpen} />

      <SearchBar onCitySelect={handleCitySelect} isLoading={isLoading} />

      <MapControls
        toggles={toggles}
        onToggle={handleToggle}
        sub={{
          forId: 'satellites',
          value: satelliteSet,
          options: SATELLITE_SETS,
          onChange: (v) => setSatelliteSet(v === 'active' ? 'active' : 'curated'),
        }}
        onResetView={handleResetView}
      />

      <CityInfoPanel city={selectedCity} isOpen={isPanelOpen} onClose={handleClosePanel} />

      <TargetCard info={target} onClose={releaseTarget} />

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
