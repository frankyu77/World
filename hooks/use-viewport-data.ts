'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { boundsContain, zoomThresholds } from '@/lib/globe/camera'

interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

interface CityData {
  id: string
  name: string
  displayName: string
  latitude: number
  longitude: number
  country?: string
  weather?: {
    temperature: number
    code: number
    description: string
  }
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

// Major world cities for display at low zoom levels
const majorCities: CityData[] = [
  { id: 'nyc', name: 'New York', displayName: 'New York, USA', latitude: 40.7128, longitude: -74.0060, country: 'USA' },
  { id: 'london', name: 'London', displayName: 'London, UK', latitude: 51.5074, longitude: -0.1278, country: 'UK' },
  { id: 'tokyo', name: 'Tokyo', displayName: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, country: 'Japan' },
  { id: 'paris', name: 'Paris', displayName: 'Paris, France', latitude: 48.8566, longitude: 2.3522, country: 'France' },
  { id: 'sydney', name: 'Sydney', displayName: 'Sydney, Australia', latitude: -33.8688, longitude: 151.2093, country: 'Australia' },
  { id: 'dubai', name: 'Dubai', displayName: 'Dubai, UAE', latitude: 25.2048, longitude: 55.2708, country: 'UAE' },
  { id: 'singapore', name: 'Singapore', displayName: 'Singapore', latitude: 1.3521, longitude: 103.8198, country: 'Singapore' },
  { id: 'shanghai', name: 'Shanghai', displayName: 'Shanghai, China', latitude: 31.2304, longitude: 121.4737, country: 'China' },
  { id: 'mumbai', name: 'Mumbai', displayName: 'Mumbai, India', latitude: 19.0760, longitude: 72.8777, country: 'India' },
  { id: 'berlin', name: 'Berlin', displayName: 'Berlin, Germany', latitude: 52.5200, longitude: 13.4050, country: 'Germany' },
  { id: 'moscow', name: 'Moscow', displayName: 'Moscow, Russia', latitude: 55.7558, longitude: 37.6173, country: 'Russia' },
  { id: 'rio', name: 'Rio de Janeiro', displayName: 'Rio de Janeiro, Brazil', latitude: -22.9068, longitude: -43.1729, country: 'Brazil' },
  { id: 'la', name: 'Los Angeles', displayName: 'Los Angeles, USA', latitude: 34.0522, longitude: -118.2437, country: 'USA' },
  { id: 'toronto', name: 'Toronto', displayName: 'Toronto, Canada', latitude: 43.6532, longitude: -79.3832, country: 'Canada' },
  { id: 'seoul', name: 'Seoul', displayName: 'Seoul, South Korea', latitude: 37.5665, longitude: 126.9780, country: 'South Korea' },
]

export function useViewportData(bounds: Bounds | null, zoom: number) {
  const [cities, setCities] = useState<CityData[]>([])
  const [isLoadingCities] = useState(false)
  const prevVisibleIdsRef = useRef<string>('')

  // Filter cities in viewport - memoize with primitive dependency
  const boundsKey = bounds ? `${bounds.north.toFixed(2)},${bounds.south.toFixed(2)},${bounds.east.toFixed(2)},${bounds.west.toFixed(2)}` : ''
  
  const visibleCityIds = useMemo(() => {
    if (!bounds || zoom < zoomThresholds.noFetch) return ''
    
    // boundsContain handles views that cross the antimeridian (west > east).
    const visible = majorCities.filter(city => boundsContain(bounds, city))
    return visible.map(c => c.id).join(',')
  }, [boundsKey, zoom, bounds])

  // Get the actual city objects based on IDs
  const visibleCities = useMemo(() => {
    if (!visibleCityIds) return []
    const ids = visibleCityIds.split(',')
    return majorCities.filter(c => ids.includes(c.id))
  }, [visibleCityIds])

  // Fetch weather for visible cities
  const cityCoords = visibleCities.map(c => `${c.latitude},${c.longitude}`).join('|')
  
  const { data: weatherData } = useSWR(
    zoom >= zoomThresholds.majorCities && cityCoords 
      ? `/api/weather/batch?coords=${encodeURIComponent(cityCoords)}`
      : null,
    fetcher,
    { 
      refreshInterval: 60000, // Refresh every minute
      revalidateOnFocus: false,
    }
  )

  // Merge weather data with cities - only update when IDs change or weather data changes
  useEffect(() => {
    // Skip if the visible cities haven't changed (prevents infinite loop)
    if (visibleCityIds === prevVisibleIdsRef.current && !weatherData) {
      return
    }
    prevVisibleIdsRef.current = visibleCityIds

    if (weatherData && Array.isArray(weatherData)) {
      const citiesWithWeather = visibleCities.map((city, idx) => ({
        ...city,
        weather: weatherData[idx] || undefined,
      }))
      setCities(citiesWithWeather)
    } else if (visibleCities.length > 0) {
      setCities(visibleCities)
    } else {
      setCities([])
    }
  }, [weatherData, visibleCityIds, visibleCities])

  return {
    cities,
    isLoadingCities,
  }
}
