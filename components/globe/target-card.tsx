'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Flame, Plane, Satellite, Waves, X, type LucideIcon } from 'lucide-react'
import { HoloPanel } from '../holo/holo-panel'
import { motionPresets } from '@/lib/holo'
import type { TargetInfo } from '@/lib/globe/tracking'

const M_TO_FT = 3.28084
const MS_TO_KT = 1.943844
const MS_TO_FPM = 196.8504

interface TargetCardProps {
  info: TargetInfo | null
  onClose: () => void
}

/**
 * Metadata for the tracked (or inspected) object, bottom-center above the zoom pill, in the
 * same HoloPanel style and label/value typography as the INTELLIGENCE panel. Updated ~4 Hz.
 */
export function TargetCard({ info, onClose }: TargetCardProps) {
  return (
    <AnimatePresence>
      {info && (
        // The keyed motion element is AnimatePresence's direct child, so it owns the exit and
        // the card is reliably removed on release (a plain wrapper left it on screen).
        <motion.div
          key="target-card"
          initial={motionPresets.fadeUp.initial}
          animate={motionPresets.fadeUp.animate}
          exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }}
          transition={motionPresets.fadeUp.transition}
          className="fixed bottom-[76px] left-1/2 z-30 -translate-x-1/2"
        >
          <HoloPanel active className="w-[360px] p-4">
            <Header info={info} onClose={onClose} />
            <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2.5">
              {rows(info).map(([label, value, unit]) => (
                <Field key={label} label={label} value={value} unit={unit} />
              ))}
            </div>
          </HoloPanel>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Header({ info, onClose }: { info: TargetInfo; onClose: () => void }) {
  const { icon, kicker, title, sub } = heading(info)
  const Icon = icon
  const locked = info.kind === 'aircraft' || info.kind === 'satellite'
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-jarvis-cyan" style={{ filter: 'drop-shadow(0 0 4px var(--glow-cyan-hard))' }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="holo-label text-[9px] text-jarvis-cyan/70">{kicker}</span>
          <span className={`holo-label rounded px-1 text-[8px] ${locked ? 'bg-jarvis-cyan/12 text-jarvis-cyan' : 'text-muted-foreground'}`}>
            {locked ? 'LOCK' : 'INSPECT'}
          </span>
        </div>
        <h3 className="holo-display mt-0.5 truncate text-lg font-bold">{title}</h3>
        {sub && <p className="truncate font-mono text-[10px] text-muted-foreground">{sub}</p>}
      </div>
      <button onClick={onClose} title="Release (Esc)" className="rounded-md p-1.5 transition-colors hover:bg-jarvis-cyan/10">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  )
}

function Field({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <p className="holo-label truncate text-[8px]">{label}</p>
      <p className="holo-value truncate text-sm font-semibold tabular-nums leading-tight">
        {value}
        {unit && <span className="holo-label ml-1 text-[8px] opacity-60">{unit}</span>}
      </p>
    </div>
  )
}

function heading(info: TargetInfo): { icon: LucideIcon; kicker: string; title: string; sub: string | null } {
  switch (info.kind) {
    case 'aircraft':
      return {
        icon: Plane,
        kicker: 'AIRCRAFT',
        title: info.callsign || info.icao24.toUpperCase(),
        sub: [info.typeCode, `ICAO ${info.icao24.toUpperCase()}`].filter(Boolean).join(' · '),
      }
    case 'satellite':
      return { icon: Satellite, kicker: 'SATELLITE', title: info.name, sub: `NORAD ${info.noradId} · ${groupLabel(info.group)}` }
    case 'earthquake':
      return { icon: Waves, kicker: 'EARTHQUAKE · USGS', title: `M ${info.magnitude.toFixed(1)}`, sub: info.place }
    case 'fire':
      return { icon: Flame, kicker: 'ACTIVE FIRE · NASA FIRMS', title: `${info.frpMW.toFixed(1)} MW`, sub: `Confidence ${info.confidence || '—'}` }
  }
}

function groupLabel(g: string): string {
  return g === 'gps-ops' ? 'GPS' : g === 'active' ? 'ACTIVE' : g.toUpperCase()
}

function fmt(n: number | null, digits = 0): string {
  return n === null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
}

function rows(info: TargetInfo): Array<[string, string, string?]> {
  switch (info.kind) {
    case 'aircraft':
      return [
        ['Altitude', info.onGround ? 'GND' : fmt(info.altitudeM === null ? null : info.altitudeM * M_TO_FT), info.onGround ? undefined : 'ft'],
        ['Speed', fmt(info.groundSpeedMs === null ? null : info.groundSpeedMs * MS_TO_KT), 'kt'],
        ['Heading', info.trackDeg === null ? '—' : `${String(Math.round(info.trackDeg) % 360).padStart(3, '0')}°`],
        ['Vert Rate', fmt(info.verticalRateMs === null ? null : info.verticalRateMs * MS_TO_FPM), 'fpm'],
        ['Squawk', info.squawk ?? '—'],
        ['Range', fmt(info.rangeKm, 1), 'km'],
        ['Type', info.typeCode ?? '—'],
        ['Data Age', info.dataAgeS === null ? '—' : `${info.dataAgeS}s`],
        ['Source', info.source === 'opensky' ? 'OPENSKY' : info.source === 'adsb.lol' ? 'ADSB.LOL' : '—'],
      ]
    case 'satellite':
      return [
        ['Altitude', fmt(info.altitudeKm), 'km'],
        ['Speed', fmt(info.speedKms, 2), 'km/s'],
        ['Inclination', fmt(info.inclinationDeg, 1), '°'],
        ['Period', fmt(info.periodMin, 1), 'min'],
        ['Apogee', fmt(info.apogeeKm), 'km'],
        ['Perigee', fmt(info.perigeeKm), 'km'],
        ['Range', fmt(info.rangeKm), 'km'],
        ['NORAD', String(info.noradId)],
        ['Orbit', info.periodMin < 128 ? 'LEO' : info.periodMin < 1400 ? 'MEO' : info.periodMin < 1460 ? 'GEO' : 'HEO'],
      ]
    case 'earthquake':
      return [
        ['Magnitude', info.magnitude.toFixed(1)],
        ['Depth', fmt(info.depthKm, 1), 'km'],
        ['Time', ago(info.timeMs)],
      ]
    case 'fire':
      return [
        ['FRP', fmt(info.frpMW, 1), 'MW'],
        ['Brightness', fmt(info.brightnessK, 0), 'K'],
        ['Detected', info.acquiredMs ? ago(info.acquiredMs) : '—'],
      ]
  }
}
