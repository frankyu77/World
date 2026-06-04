'use client'

import useSWR from 'swr'
import type { SelectedCity } from '@/components/jarvis-map'

interface WeatherData {
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  visibility: number
  code: number
  description: string
}

interface AirQualityData {
  aqi: number
  pm25: number
  pm10: number
}

interface TrafficData {
  level: number  // 0-1, higher = more traffic
  delay: number  // average delay in minutes
}

interface POI {
  name: string
  type: string
  distance: number
}

interface CityDataResponse {
  localTime: string
  timezone: string
  weather: WeatherData
  airQuality: AirQualityData
  traffic: TrafficData
  population: number | null
  pois: POI[]
}

const fetcher = async (url: string): Promise<CityDataResponse> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch city data')
  return res.json()
}

export function useCityData(city: SelectedCity | null) {
  const { data, error, isLoading, mutate } = useSWR<CityDataResponse>(
    city ? `/api/city?lat=${city.latitude}&lng=${city.longitude}&name=${encodeURIComponent(city.name)}` : null,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds for real-time feel
      revalidateOnFocus: true,
      dedupingInterval: 10000,
    }
  )

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  }
}
