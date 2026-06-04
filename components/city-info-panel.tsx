'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, Users, Wind, Droplets, Thermometer, Eye, MapPin, Car, Cloud, Sun, CloudRain, CloudSnow, CloudLightning, CloudFog } from 'lucide-react'
import { HudCorners } from './hud-corners'
import { useCityData } from '@/hooks/use-city-data'
import type { SelectedCity } from './jarvis-map'

interface CityInfoPanelProps {
  city: SelectedCity | null
  isOpen: boolean
  onClose: () => void
}

const weatherIcons: Record<string, typeof Sun> = {
  clear: Sun,
  clouds: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  thunderstorm: CloudLightning,
  fog: CloudFog,
  mist: CloudFog,
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

function getAqiColor(aqi: number) {
  if (aqi <= 50) return 'text-jarvis-green'
  if (aqi <= 100) return 'text-chart-4'
  if (aqi <= 150) return 'text-jarvis-amber'
  if (aqi <= 200) return 'text-jarvis-red'
  return 'text-destructive'
}

function getAqiLabel(aqi: number) {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

function getTrafficStatus(level: number) {
  if (level < 0.4) return { label: 'Light Traffic', color: 'text-jarvis-green' }
  if (level < 0.7) return { label: 'Moderate Traffic', color: 'text-jarvis-amber' }
  return { label: 'Heavy Traffic', color: 'text-jarvis-red' }
}

export function CityInfoPanel({ city, isOpen, onClose }: CityInfoPanelProps) {
  const { data, isLoading, error } = useCityData(city)

  return (
    <>
      {/* Desktop Panel - Right Side */}
      <AnimatePresence>
        {isOpen && city && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="hidden md:block fixed right-0 top-0 h-full w-96 z-40"
          >
            <HudCorners isActive className="h-full">
              <div className="jarvis-panel h-full overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-border">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-mono font-bold jarvis-text">{city.name}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {city.state && `${city.state}, `}{city.country}
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-accent rounded-lg transition-colors"
                    >
                      <X className="h-5 w-5 text-muted-foreground" />
                    </button>
                  </div>
                  
                  {/* Coordinates */}
                  <div className="flex items-center gap-2 mt-3 text-xs font-mono text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {isLoading ? (
                    <LoadingState />
                  ) : error ? (
                    <ErrorState />
                  ) : data ? (
                    <>
                      {/* Local Time */}
                      <DataSection title="LOCAL TIME" icon={Clock}>
                        <div className="text-3xl font-mono jarvis-text">
                          {data.localTime}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {data.timezone}
                        </p>
                      </DataSection>

                      {/* Weather */}
                      <DataSection title="WEATHER" icon={getWeatherIcon(data.weather.code)}>
                        <div className="flex items-center gap-4">
                          <div className="text-4xl font-mono jarvis-text">
                            {Math.round(data.weather.temperature)}°C
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>{data.weather.description}</p>
                            <p>Feels like {Math.round(data.weather.feelsLike)}°C</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          <WeatherStat icon={Wind} label="Wind" value={`${data.weather.windSpeed} km/h`} />
                          <WeatherStat icon={Droplets} label="Humidity" value={`${data.weather.humidity}%`} />
                          <WeatherStat icon={Eye} label="Visibility" value={`${data.weather.visibility} km`} />
                        </div>
                      </DataSection>

                      {/* Air Quality */}
                      <DataSection title="AIR QUALITY" icon={Wind}>
                        <div className="flex items-center gap-4">
                          <div className={`text-3xl font-mono ${getAqiColor(data.airQuality.aqi)}`}>
                            {data.airQuality.aqi}
                          </div>
                          <div>
                            <p className={`text-sm font-medium ${getAqiColor(data.airQuality.aqi)}`}>
                              {getAqiLabel(data.airQuality.aqi)}
                            </p>
                            <p className="text-xs text-muted-foreground">US AQI Index</p>
                          </div>
                        </div>
                      </DataSection>

                      {/* Traffic */}
                      <DataSection title="TRAFFIC STATUS" icon={Car}>
                        <div className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full ${
                            data.traffic.level < 0.4 ? 'bg-jarvis-green' :
                            data.traffic.level < 0.7 ? 'bg-jarvis-amber' : 'bg-jarvis-red'
                          } animate-pulse`} />
                          <span className={`font-medium ${getTrafficStatus(data.traffic.level).color}`}>
                            {getTrafficStatus(data.traffic.level).label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Average delay: {Math.round(data.traffic.delay)} min
                        </p>
                      </DataSection>

                      {/* Population */}
                      <DataSection title="POPULATION" icon={Users}>
                        <div className="text-2xl font-mono jarvis-text">
                          {data.population?.toLocaleString() || 'N/A'}
                        </div>
                      </DataSection>

                      {/* Points of Interest */}
                      {data.pois && data.pois.length > 0 && (
                        <DataSection title="POINTS OF INTEREST" icon={MapPin}>
                          <div className="space-y-2">
                            {data.pois.slice(0, 5).map((poi, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <div className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan" />
                                <span className="text-foreground">{poi.name}</span>
                                <span className="text-xs text-muted-foreground">({poi.type})</span>
                              </div>
                            ))}
                          </div>
                        </DataSection>
                      )}
                    </>
                  ) : null}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center font-mono">
                    DATA REFRESHES EVERY 30 SECONDS
                  </p>
                </div>
              </div>
            </HudCorners>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Sheet */}
      <AnimatePresence>
        {isOpen && city && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed bottom-0 left-0 right-0 z-40 max-h-[70vh]"
          >
            <div className="jarvis-panel rounded-t-2xl overflow-hidden">
              {/* Drag Handle */}
              <div className="flex justify-center py-3">
                <div className="h-1 w-12 rounded-full bg-border" />
              </div>

              {/* Header */}
              <div className="px-4 pb-4 border-b border-border flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-mono font-bold jarvis-text">{city.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {city.state && `${city.state}, `}{city.country}
                  </p>
                </div>
                <button onClick={onClose} className="p-2">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto max-h-[50vh] p-4 space-y-4">
                {isLoading ? (
                  <LoadingState />
                ) : data ? (
                  <>
                    {/* Compact Weather & Time Row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="jarvis-panel rounded-lg p-3">
                        <p className="text-xs text-muted-foreground font-mono mb-1">LOCAL TIME</p>
                        <p className="text-xl font-mono jarvis-text">{data.localTime}</p>
                      </div>
                      <div className="jarvis-panel rounded-lg p-3">
                        <p className="text-xs text-muted-foreground font-mono mb-1">TEMPERATURE</p>
                        <p className="text-xl font-mono jarvis-text">{Math.round(data.weather.temperature)}°C</p>
                      </div>
                    </div>

                    {/* AQI & Traffic Row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="jarvis-panel rounded-lg p-3">
                        <p className="text-xs text-muted-foreground font-mono mb-1">AIR QUALITY</p>
                        <p className={`text-xl font-mono ${getAqiColor(data.airQuality.aqi)}`}>
                          {data.airQuality.aqi}
                        </p>
                      </div>
                      <div className="jarvis-panel rounded-lg p-3">
                        <p className="text-xs text-muted-foreground font-mono mb-1">TRAFFIC</p>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${
                            data.traffic.level < 0.4 ? 'bg-jarvis-green' :
                            data.traffic.level < 0.7 ? 'bg-jarvis-amber' : 'bg-jarvis-red'
                          }`} />
                          <span className={`text-sm ${getTrafficStatus(data.traffic.level).color}`}>
                            {getTrafficStatus(data.traffic.level).label.split(' ')[0]}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Population */}
                    <div className="jarvis-panel rounded-lg p-3">
                      <p className="text-xs text-muted-foreground font-mono mb-1">POPULATION</p>
                      <p className="text-lg font-mono jarvis-text">
                        {data.population?.toLocaleString() || 'N/A'}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function DataSection({ 
  title, 
  icon: Icon, 
  children 
}: { 
  title: string
  icon: typeof Clock
  children: React.ReactNode 
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-jarvis-cyan" />
        <h3 className="text-xs font-mono text-muted-foreground tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function WeatherStat({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: typeof Wind
  label: string
  value: string 
}) {
  return (
    <div className="text-center">
      <Icon className="h-4 w-4 text-jarvis-cyan mx-auto mb-1" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono text-foreground">{value}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse">
          <div className="h-3 w-24 bg-accent rounded mb-2" />
          <div className="h-8 w-32 bg-accent rounded" />
        </div>
      ))}
    </div>
  )
}

function ErrorState() {
  return (
    <div className="text-center py-8">
      <p className="text-muted-foreground">Unable to load city data</p>
      <p className="text-xs text-muted-foreground mt-1">Please try again</p>
    </div>
  )
}
