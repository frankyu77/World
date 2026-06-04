'use client'

import { motion } from 'framer-motion'
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind } from 'lucide-react'

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

export function WeatherMarker({ city, onClick }: WeatherMarkerProps) {
  const Icon = city.weather ? getWeatherIcon(city.weather.code) : Cloud
  const temp = city.weather?.temperature

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="group relative flex flex-col items-center"
    >
      {/* Marker */}
      <div className="jarvis-panel rounded-lg px-2 py-1 flex items-center gap-1.5 jarvis-glow
                    group-hover:border-jarvis-cyan transition-colors">
        <Icon className="h-4 w-4 text-jarvis-cyan" />
        {temp !== undefined && (
          <span className="text-xs font-mono text-foreground">
            {Math.round(temp)}°
          </span>
        )}
      </div>
      
      {/* City Name Tooltip */}
      <div className="absolute top-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity
                    jarvis-panel rounded px-2 py-1 whitespace-nowrap z-10">
        <span className="text-xs font-mono text-foreground">{city.name}</span>
      </div>

      {/* Pulse Ring */}
      <div className="absolute -inset-2 rounded-full border border-jarvis-cyan/30 
                    group-hover:animate-ping pointer-events-none" />
    </motion.button>
  )
}
