'use client'

import { useRef, useCallback, useState, useMemo } from 'react'
import Map, {
  MapRef,
  NavigationControl,
  GeolocateControl,
  Marker,
  Source,
  Layer
} from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { jarvisMapStyle, zoomThresholds } from '@/lib/map-style'
import { SearchBar } from './search-bar'
import { CityInfoPanel } from './city-info-panel'
import { MapControls } from './map-controls'
import { HudOverlay } from './hud-overlay'
import { WeatherMarker } from './weather-marker'
import { BootSequence } from './boot-sequence'
import { HoloBeacon } from './holo/holo-beacon'
import { MapProjectionFX, AtmosphereFX } from './holographic-overlays'
import { useViewportData } from '@/hooks/use-viewport-data'

interface ViewState {
  longitude: number
  latitude: number
  zoom: number
  pitch: number
  bearing: number
}

export interface SelectedCity {
  name: string
  displayName: string
  latitude: number
  longitude: number
  country?: string
  state?: string
}

interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

export function JarvisMap() {
  const mapRef = useRef<MapRef>(null)
  const [viewState, setViewState] = useState<ViewState>({
    longitude: 0,
    latitude: 20,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  })
  const [selectedCity, setSelectedCity] = useState<SelectedCity | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [showTraffic, setShowTraffic] = useState(true)
  const [showWeather, setShowWeather] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isBooted, setIsBooted] = useState(false)
  // Viewport bounds live in state and are refreshed only when the map settles,
  // not on every render. Reading getBounds() during render returns a new object
  // each time, which would churn effect dependencies and re-renders.
  const [bounds, setBounds] = useState<Bounds | null>(null)

  // Snapshot bounds from the map after it loads / finishes moving. Skips the
  // update when the rounded viewport hasn't actually changed.
  const lastBoundsKey = useRef<string>('')
  const refreshBounds = useCallback((map: MapLibreMap | undefined) => {
    const b = map?.getBounds()
    if (!b) return
    const next: Bounds = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
    const key = `${next.north.toFixed(3)},${next.south.toFixed(3)},${next.east.toFixed(3)},${next.west.toFixed(3)}`
    if (key === lastBoundsKey.current) return
    lastBoundsKey.current = key
    setBounds(next)
  }, [])

  const { cities, isLoadingCities } = useViewportData(bounds, viewState.zoom)

  // Handle city selection from search
  const handleCitySelect = useCallback((city: SelectedCity) => {
    setIsLoading(true)
    setSelectedCity(city)
    
    // Diagonal fly-to animation
    mapRef.current?.flyTo({
      center: [city.longitude, city.latitude],
      zoom: 12,
      pitch: 45,
      bearing: -30,
      duration: 2500,
      essential: true,
    })

    setTimeout(() => {
      setIsPanelOpen(true)
      setIsLoading(false)
    }, 2000)
  }, [])

  // Handle map click
  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    // If clicking away from markers, close panel
    if (!event.features?.length) {
      setIsPanelOpen(false)
      setSelectedCity(null)
    }
  }, [])

  // Close panel handler
  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false)
    setSelectedCity(null)
    
    // Reset view
    mapRef.current?.flyTo({
      pitch: 0,
      bearing: 0,
      duration: 1000,
    })
  }, [])

  // Handle view state change
  const handleMove = useCallback((evt: { viewState: ViewState }) => {
    setViewState(evt.viewState)
  }, [])

  // Traffic layer data (simulated)
  const trafficData = useTrafficData(viewState.zoom, bounds)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-jarvis-bg">
      {/* Boot Sequence */}
      {!isBooted && <BootSequence onComplete={() => setIsBooted(true)} />}

      {/* Main Map */}
      <Map
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onMoveEnd={(e) => refreshBounds(e.target)}
        onLoad={(e) => refreshBounds(e.target)}
        onClick={handleMapClick}
        mapStyle={jarvisMapStyle}
        style={{ width: '100%', height: '100%' }}
        maxZoom={18}
        minZoom={1}
        attributionControl={false}
        touchZoomRotate={true}
        touchPitch={true}
        dragRotate={true}
      >
        {/* Navigation Controls (kept minimal; scale bar removed for a cleaner HUD) */}
        <NavigationControl position="bottom-right" showCompass={true} />
        <GeolocateControl position="bottom-right" />

        {/* Traffic Layer */}
        {showTraffic && viewState.zoom >= zoomThresholds.majorCities && trafficData && (
          <Source id="traffic" type="geojson" data={trafficData}>
            <Layer
              id="traffic-layer"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  10, 2,
                  15, 6
                ],
                'line-opacity': 0.85,
                'line-blur': 1.5,
              }}
            />
          </Source>
        )}

        {/* Weather Markers */}
        {showWeather && cities.map((city) => (
          <Marker
            key={city.id}
            longitude={city.longitude}
            latitude={city.latitude}
            anchor="bottom"
          >
            <WeatherMarker 
              city={city}
              onClick={() => handleCitySelect({
                name: city.name,
                displayName: city.displayName,
                latitude: city.latitude,
                longitude: city.longitude,
                country: city.country,
              })}
            />
          </Marker>
        ))}

        {/* Selected City Marker */}
        {selectedCity && (
          <Marker
            longitude={selectedCity.longitude}
            latitude={selectedCity.latitude}
            anchor="center"
          >
            <HoloBeacon size={18} rings={4} />
          </Marker>
        )}
      </Map>

      {/* Holographic projection effects cast over the map */}
      <MapProjectionFX />

      {/* HUD Overlay */}
      <HudOverlay
        zoom={viewState.zoom}
        latitude={viewState.latitude}
        longitude={viewState.longitude}
        isLoading={isLoading || isLoadingCities}
        nodeCount={cities.length}
      />

      {/* Search Bar */}
      <SearchBar 
        onCitySelect={handleCitySelect}
        isLoading={isLoading}
      />

      {/* Map Controls */}
      <MapControls
        showTraffic={showTraffic}
        showWeather={showWeather}
        onToggleTraffic={() => setShowTraffic(!showTraffic)}
        onToggleWeather={() => setShowWeather(!showWeather)}
        onResetView={() => {
          mapRef.current?.flyTo({
            center: [0, 20],
            zoom: 2,
            pitch: 0,
            bearing: 0,
            duration: 1500,
          })
          setSelectedCity(null)
          setIsPanelOpen(false)
        }}
      />

      {/* City Info Panel */}
      <CityInfoPanel
        city={selectedCity}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
      />

      {/* Top-most ambiance: gentle vignette + soft cyan glow */}
      <AtmosphereFX />
    </div>
  )
}

/**
 * Simulated traffic overlay derived purely from the current viewport.
 *
 * This is DERIVED state, so it lives in useMemo — never useState/useEffect.
 * The memo is keyed on primitives only (a rounded bounds string + an integer
 * zoom bucket), so it recomputes only when the viewport meaningfully changes
 * and can never trigger a state update / re-render loop.
 */
function useTrafficData(zoom: number, bounds: Bounds | null) {
  const boundsKey = bounds
    ? `${bounds.north.toFixed(2)},${bounds.south.toFixed(2)},${bounds.east.toFixed(2)},${bounds.west.toFixed(2)}`
    : ''
  const zoomBucket = Math.floor(zoom)

  return useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!bounds || zoomBucket < zoomThresholds.majorCities) return null

    const hour = new Date().getHours()
    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)

    const features: GeoJSON.Feature[] = []
    const numSegments = Math.min(50, zoomBucket * 3)
    const lngRange = bounds.east - bounds.west
    const latRange = bounds.north - bounds.south

    for (let i = 0; i < numSegments; i++) {
      const startLng = bounds.west + Math.random() * lngRange
      const startLat = bounds.south + Math.random() * latRange
      const endLng = startLng + (Math.random() - 0.5) * 0.02
      const endLat = startLat + (Math.random() - 0.5) * 0.02

      const trafficLevel = Math.random() * (isRushHour ? 1.5 : 1)
      let color = '#34f5a0' // green
      if (trafficLevel > 0.7) color = '#ffb020' // amber
      if (trafficLevel > 0.9) color = '#ff4d5e' // red

      features.push({
        type: 'Feature',
        properties: { color, level: trafficLevel },
        geometry: { type: 'LineString', coordinates: [[startLng, startLat], [endLng, endLat]] },
      })
    }

    return { type: 'FeatureCollection', features }
    // Keyed on the primitive boundsKey + zoomBucket; bounds values are constant
    // for a given key, so reading bounds here is safe and intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, zoomBucket])
}
