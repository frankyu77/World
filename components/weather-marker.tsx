'use client'

import { motion } from 'framer-motion'
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, CloudFog } from 'lucide-react'
import { HoloBeacon } from './holo/holo-beacon'

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

interface WeatherMarkerProps {
  city: CityData
  onClick: () => void
}

function getWeatherIcon(code: number) {
  if (code === 0) return Sun
  if (code >= 1 && code <= 3) return Cloud
  if (code >= 45 && code <= 48) return CloudFog
  if (code >= 51 && code <= 67) return CloudRain
  if (code >= 71 && code <= 77) return CloudSnow
  if (code >= 80 && code <= 82) return CloudRain
  if (code >= 95) return CloudLightning
  return Cloud
}

/**
 * Intelligence node marker: a live holographic beacon (pulsing core + signal
 * rings) with a tactical telemetry chip that reveals weather + designation on
 * hover.
 */
export function WeatherMarker({ city, onClick }: WeatherMarkerProps) {
  const Icon = city.weather ? getWeatherIcon(city.weather.code) : Cloud
  const temp = city.weather?.temperature

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.94 }}
      className="group relative flex flex-col items-center"
      aria-label={`Intelligence node: ${city.name}`}
    >
      {/* Live beacon */}
      <HoloBeacon size={10} rings={3} />

      {/* Telemetry chip */}
      <div
        className="holo-panel mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-0.5
                   opacity-0 transition-all duration-300 group-hover:opacity-100"
        style={{ borderRadius: 6 }}
      >
        <Icon className="h-3.5 w-3.5 text-jarvis-cyan" />
        {temp !== undefined && (
          <span className="holo-value text-[11px]">{Math.round(temp)}°</span>
        )}
      </div>

      {/* Designation tooltip */}
      <div
        className="holo-panel absolute top-full mt-7 whitespace-nowrap rounded px-2 py-0.5
                   opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ borderRadius: 6 }}
      >
        <span className="holo-label text-[9px] text-jarvis-cyan">{city.name}</span>
      </div>
    </motion.button>
  )
}
