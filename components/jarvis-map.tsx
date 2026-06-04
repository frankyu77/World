'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import Map, { 
  MapRef, 
  NavigationControl, 
  GeolocateControl,
  ScaleControl,
  Marker,
  Source,
  Layer
} from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { jarvisMapStyle, zoomThresholds } from '@/lib/map-style'
import { SearchBar } from './search-bar'
import { CityInfoPanel } from './city-info-panel'
import { MapControls } from './map-controls'
import { HudOverlay } from './hud-overlay'
import { WeatherMarker } from './weather-marker'
import { BootSequence } from './boot-sequence'
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

  // Get viewport bounds for data fetching
  const bounds = mapRef.current?.getMap()?.getBounds()
  const { cities, isLoadingCities } = useViewportData(
    bounds ? {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    } : null,
    viewState.zoom
  )

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
        {/* Navigation Controls */}
        <NavigationControl position="bottom-right" showCompass={true} />
        <GeolocateControl position="bottom-right" />
        <ScaleControl position="bottom-left" />

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
                'line-opacity': 0.8,
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
            anchor="bottom"
          >
            <div className="relative">
              <div className="h-6 w-6 rounded-full bg-jarvis-cyan animate-ping absolute" />
              <div className="h-6 w-6 rounded-full bg-jarvis-cyan jarvis-glow relative z-10" />
            </div>
          </Marker>
        )}
      </Map>

      {/* HUD Overlay */}
      <HudOverlay 
        zoom={viewState.zoom}
        latitude={viewState.latitude}
        longitude={viewState.longitude}
        isLoading={isLoading || isLoadingCities}
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

      {/* Scan Lines Effect */}
      <div className="scan-lines opacity-30" />
    </div>
  )
}

// Hook for simulated traffic data
function useTrafficData(zoom: number, bounds: LngLatBoundsLike | null | undefined) {
  const [trafficData, setTrafficData] = useState<GeoJSON.FeatureCollection | null>(null)

  useEffect(() => {
    if (zoom < zoomThresholds.majorCities || !bounds) {
      setTrafficData(null)
      return
    }

    // Generate simulated traffic data
    const hour = new Date().getHours()
    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)
    
    // Create some random road segments for demo
    const features: GeoJSON.Feature[] = []
    const numSegments = Math.min(50, Math.floor(zoom * 3))
    
    // Get bounds as array if it's an object
    let boundsArray: [[number, number], [number, number]]
    if (Array.isArray(bounds)) {
      boundsArray = bounds as [[number, number], [number, number]]
    } else if ('_sw' in bounds && '_ne' in bounds) {
      const b = bounds as { _sw: { lng: number; lat: number }; _ne: { lng: number; lat: number } }
      boundsArray = [[b._sw.lng, b._sw.lat], [b._ne.lng, b._ne.lat]]
    } else {
      return
    }

    const [sw, ne] = boundsArray
    const lngRange = ne[0] - sw[0]
    const latRange = ne[1] - sw[1]

    for (let i = 0; i < numSegments; i++) {
      const startLng = sw[0] + Math.random() * lngRange
      const startLat = sw[1] + Math.random() * latRange
      const endLng = startLng + (Math.random() - 0.5) * 0.02
      const endLat = startLat + (Math.random() - 0.5) * 0.02

      // Determine traffic level
      const trafficLevel = Math.random() * (isRushHour ? 1.5 : 1)
      let color = '#30d158' // green
      if (trafficLevel > 0.7) color = '#ff9500' // yellow
      if (trafficLevel > 0.9) color = '#ff3b30' // red

      features.push({
        type: 'Feature',
        properties: { color, level: trafficLevel },
        geometry: {
          type: 'LineString',
          coordinates: [[startLng, startLat], [endLng, endLat]],
        },
      })
    }

    setTrafficData({
      type: 'FeatureCollection',
      features,
    })
  }, [zoom, bounds])

  return trafficData
}
