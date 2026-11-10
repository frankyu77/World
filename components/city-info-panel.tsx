'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Clock, Users, Wind, Droplets, Eye, MapPin, Car, Cloud, Sun, CloudRain,
  CloudSnow, CloudLightning, CloudFog, type LucideIcon,
} from 'lucide-react'
import { HoloPanel } from './holo/holo-panel'
import { useCityData } from '@/hooks/use-city-data'
import { intensityColor } from '@/lib/holo'
import type { SelectedCity } from './jarvis-map'

interface CityInfoPanelProps {
  city: SelectedCity | null
  isOpen: boolean
  onClose: () => void
}

function getWeatherIcon(code: number): LucideIcon {
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
      {/* Desktop — right rail */}
      <AnimatePresence>
        {isOpen && city && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 210 }}
            className="fixed right-0 top-0 z-40 hidden h-full w-96 p-3 md:block"
          >
            <HoloPanel active className="flex h-full flex-col overflow-hidden rounded-xl">
              {/* Header */}
              <div className="border-b border-jarvis-cyan/20 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="holo-label text-[9px] text-jarvis-cyan/70">TARGET DOSSIER</span>
                    <h2 className="holo-display mt-1 text-xl font-bold">{city.name}</h2>
                    <p className="mt-1 font-heading text-sm tracking-wide text-muted-foreground">
                      {city.state && `${city.state}, `}
                      {city.country}
                    </p>
                  </div>
                  <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-jarvis-cyan/10">
                    <X className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3 text-jarvis-cyan" />
                  <span>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</span>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {isLoading ? (
                  <LoadingState />
                ) : error ? (
                  <ErrorState />
                ) : data ? (
                  <>
                    <DataSection title="LOCAL TIME" icon={Clock}>
                      <div className="font-mono text-3xl text-jarvis-cyan glow-text">{data.localTime}</div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{data.timezone}</p>
                    </DataSection>

                    <DataSection title="ATMOSPHERIC" icon={getWeatherIcon(data.weather.code)}>
                      <div className="flex items-center gap-4">
                        <div className="font-mono text-4xl text-jarvis-cyan glow-text-strong">
                          {Math.round(data.weather.temperature)}°
                        </div>
                        <div className="font-heading text-sm tracking-wide text-muted-foreground">
                          <p>{data.weather.description}</p>
                          <p>Feels like {Math.round(data.weather.feelsLike)}°C</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <WeatherStat icon={Wind} label="Wind" value={`${data.weather.windSpeed}`} unit="km/h" />
                        <WeatherStat icon={Droplets} label="Humidity" value={`${data.weather.humidity}`} unit="%" />
                        <WeatherStat icon={Eye} label="Visibility" value={`${data.weather.visibility}`} unit="km" />
                      </div>
                    </DataSection>

                    <DataSection title="AIR QUALITY" icon={Wind}>
                      <div className="flex items-center gap-4">
                        <div className={`font-mono text-3xl ${getAqiColor(data.airQuality.aqi)}`}>
                          {data.airQuality.aqi}
                        </div>
                        <div>
                          <p className={`font-heading text-sm font-semibold tracking-wide ${getAqiColor(data.airQuality.aqi)}`}>
                            {getAqiLabel(data.airQuality.aqi)}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">US AQI INDEX</p>
                        </div>
                      </div>
                    </DataSection>

                    <DataSection title="TRAFFIC STATUS · SIMULATED" icon={Car}>
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 animate-pulse rounded-full"
                          style={{ background: intensityColor(data.traffic.level), boxShadow: '0 0 8px currentColor' }}
                        />
                        <span className={`font-heading font-semibold tracking-wide ${getTrafficStatus(data.traffic.level).color}`}>
                          {getTrafficStatus(data.traffic.level).label}
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                        Average delay: {Math.round(data.traffic.delay)} min
                      </p>
                    </DataSection>

                    <DataSection title="POPULATION" icon={Users}>
                      <div className="font-mono text-2xl text-jarvis-cyan glow-text">
                        {data.population?.toLocaleString() || 'N/A'}
                      </div>
                    </DataSection>

                    {data.pois && data.pois.length > 0 && (
                      <DataSection title="POINTS OF INTEREST" icon={MapPin}>
                        <div className="space-y-2">
                          {data.pois.slice(0, 5).map((poi, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <span className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan" style={{ boxShadow: '0 0 4px var(--glow-cyan-mid)' }} />
                              <span className="text-foreground">{poi.name}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">({poi.type})</span>
                            </div>
                          ))}
                        </div>
                      </DataSection>
                    )}
                  </>
                ) : null}
              </div>

              {/* Footer */}
              <div className="border-t border-jarvis-cyan/20 p-4">
                <p className="holo-label text-center text-[9px]">LIVE FEED · REFRESH 30S</p>
              </div>
            </HoloPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile — bottom sheet */}
      <AnimatePresence>
        {isOpen && city && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 210 }}
            className="fixed bottom-0 left-0 right-0 z-40 max-h-[72vh] md:hidden"
          >
            <HoloPanel corners={false} className="overflow-hidden rounded-t-2xl">
              <div className="flex justify-center py-3">
                <div className="h-1 w-12 rounded-full bg-jarvis-cyan/40" />
              </div>
              <div className="flex items-start justify-between border-b border-jarvis-cyan/20 px-4 pb-4">
                <div>
                  <h2 className="holo-display text-lg font-bold">{city.name}</h2>
                  <p className="font-heading text-sm tracking-wide text-muted-foreground">
                    {city.state && `${city.state}, `}
                    {city.country}
                  </p>
                </div>
                <button onClick={onClose} className="p-2">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              <div className="max-h-[52vh] space-y-3 overflow-y-auto p-4">
                {isLoading ? (
                  <LoadingState />
                ) : data ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <MiniStat label="LOCAL TIME" value={data.localTime} />
                      <MiniStat label="TEMP" value={`${Math.round(data.weather.temperature)}°C`} />
                      <MiniStat label="AIR QUALITY" value={String(data.airQuality.aqi)} valueClass={getAqiColor(data.airQuality.aqi)} />
                      <MiniStat label="POPULATION" value={data.population?.toLocaleString() || 'N/A'} />
                    </div>
                  </>
                ) : null}
              </div>
            </HoloPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function MiniStat({ label, value, valueClass = 'text-jarvis-cyan' }: { label: string; value: string; valueClass?: string }) {
  return (
    <HoloPanel corners={false} className="p-3">
      <p className="holo-label text-[9px]">{label}</p>
      <p className={`mt-1 font-mono text-lg glow-text ${valueClass}`}>{value}</p>
    </HoloPanel>
  )
}

function DataSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-jarvis-cyan" />
        <h3 className="holo-label text-[10px]">{title}</h3>
        <span className="h-px flex-1 bg-gradient-to-r from-jarvis-cyan/30 to-transparent" />
      </div>
      {children}
    </div>
  )
}

function WeatherStat({ icon: Icon, label, value, unit }: { icon: LucideIcon; label: string; value: string; unit: string }) {
  return (
    <div className="text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-jarvis-cyan" />
      <p className="font-heading text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-sm text-foreground">
        {value}
        <span className="text-[9px] text-muted-foreground"> {unit}</span>
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse">
          <div className="mb-2 h-3 w-24 rounded bg-jarvis-cyan/10" />
          <div className="h-8 w-32 rounded bg-jarvis-cyan/10" />
        </div>
      ))}
    </div>
  )
}

function ErrorState() {
  return (
    <div className="py-8 text-center">
      <p className="font-heading tracking-wide text-muted-foreground">Signal lost — unable to load dossier</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">Re-acquire target</p>
    </div>
  )
}
