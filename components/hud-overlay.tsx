'use client'

import { motion } from 'framer-motion'
import { Crosshair, Activity, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HoloPanel } from './holo/holo-panel'
import { motionPresets, statusColor } from '@/lib/holo'

interface HudOverlayProps {
  zoom: number
  latitude: number
  longitude: number
  isLoading: boolean
  /** Live objects currently on screen across enabled layers. */
  activeNodes: number
  /** Moving tracks (aircraft + satellites) currently on screen. */
  tracking: number
  /** The city panel occupies the right edge: slide the right-column panels out of its way. */
  rightColumnHidden?: boolean
  /** Newest flight snapshot (null when the flights layer is off or hasn't loaded). */
  flightFeed?: { snapshotAt: number; source: 'adsb.lol' | 'opensky' } | null
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function zoomTier(zoom: number) {
  if (zoom < 5) return 'GLOBAL VIEW'
  if (zoom < 8) return 'CONTINENTAL'
  if (zoom < 12) return 'REGIONAL'
  if (zoom < 15) return 'CITY GRID'
  return 'STREET LEVEL'
}

/**
 * Minimal, intentional HUD — six zones, lots of breathing room, nothing that
 * obscures the map:
 *   top-center  → search (rendered separately)
 *   top-left    → system status + coordinates
 *   top-right   → intelligence metrics
 *   bottom-left → layer controls (rendered separately)
 *   bottom-center → zoom / global view
 *   bottom-right → signal strength
 */
export function HudOverlay({ zoom, latitude, longitude, isLoading, activeNodes, tracking, rightColumnHidden = false, flightFeed = null }: HudOverlayProps) {
  // Same easing as the panels' own fadeRight entrance.
  const rightColumn = {
    animate: rightColumnHidden ? { x: 48, opacity: 0 } : { x: 0, opacity: 1 },
    transition: motionPresets.fadeRight.transition,
  }

  const [now, setNow] = useState<Date | null>(null)
  const [signal, setSignal] = useState(96)

  useEffect(() => {
    setNow(new Date())
    const clock = setInterval(() => setNow(new Date()), 1000)
    const telem = setInterval(() => setSignal(92 + Math.round(Math.random() * 7)), 3000)
    return () => {
      clearInterval(clock)
      clearInterval(telem)
    }
  }, [])

  const currentTime = now ? formatTime(now) : '--:--:--'

  return (
    <>
      {/* ── TOP-LEFT · System status ───────────────────────────────── */}
      <div className="fixed left-6 top-6 z-20 pointer-events-none">
        <HoloPanel {...motionPresets.fadeDown} className="w-[208px] p-4">
          <div className="flex items-center justify-between">
            <span className="holo-display text-base font-bold">AEGIS</span>
            <span className="holo-label text-[9px] opacity-60">CMD</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isLoading ? statusColor.syncing : statusColor.online} animate-pulse`} />
            <span className="holo-label text-[10px]">{isLoading ? 'SYNCHRONIZING' : 'SYSTEM ACTIVE'}</span>
          </div>

          <div className="clock-glow mt-2 font-mono text-2xl font-bold tabular-nums text-jarvis-cyan">
            {currentTime}
          </div>

          <div className="mt-3 space-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <div className="flex justify-between"><span className="opacity-50">LAT</span><span className="text-jarvis-cyan/90">{latitude.toFixed(4)}°</span></div>
            <div className="flex justify-between"><span className="opacity-50">LNG</span><span className="text-jarvis-cyan/90">{longitude.toFixed(4)}°</span></div>
          </div>
        </HoloPanel>
      </div>

      {/* ── TOP-RIGHT · Intelligence metrics ───────────────────────── */}
      <motion.div {...rightColumn} className="fixed right-6 top-6 z-20 pointer-events-none hidden md:block">
        <HoloPanel {...motionPresets.fadeRight} className="w-[196px] p-4">
          <div className="flex items-center gap-2">
            <Crosshair className="h-3.5 w-3.5 text-jarvis-cyan" />
            <span className="holo-label text-[10px]">INTELLIGENCE</span>
          </div>
          <div className="mt-3 space-y-3">
            <Metric label="Active Nodes" value={activeNodes} />
            <Metric label="Tracking" value={tracking} sub="targets" />
            <DataAge feed={flightFeed} now={now} />
          </div>
        </HoloPanel>
      </motion.div>

      {/* ── BOTTOM-CENTER · Zoom / global view ─────────────────────── */}
      <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 pointer-events-none">
        <HoloPanel {...motionPresets.fadeUp} corners={false} className="flex items-center gap-4 rounded-full px-6 py-2.5">
          <span className="holo-label text-[10px]">{zoomTier(zoom)}</span>
          <span className="h-3.5 w-px bg-jarvis-cyan/25" />
          <span className="holo-value text-sm font-semibold">{zoom.toFixed(1)}×</span>
        </HoloPanel>
      </div>

      {/* ── BOTTOM-RIGHT · Signal strength ─────────────────────────── */}
      <motion.div {...rightColumn} className="fixed bottom-36 right-6 z-20 pointer-events-none hidden lg:block">
        <HoloPanel {...motionPresets.fadeRight} className="w-[168px] p-4">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-jarvis-cyan" />
            <span className="holo-label text-[10px]">SIGNAL</span>
            <span className="holo-value ml-auto text-sm">{signal}%</span>
          </div>
          <div className="mt-2.5 flex items-end gap-1">
            {[40, 60, 75, 88, 96].map((threshold, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-colors duration-500"
                style={{
                  height: 8 + i * 5,
                  background: signal >= threshold ? 'var(--color-jarvis-cyan)' : 'rgba(0,255,255,0.12)',
                  boxShadow: signal >= threshold ? '0 0 6px var(--glow-cyan-mid)' : 'none',
                }}
              />
            ))}
          </div>
        </HoloPanel>
      </motion.div>

      {/* Targeting overlay while acquiring */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-jarvis-bg/30 backdrop-blur-[2px] pointer-events-none">
          <HoloPanel initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center p-8">
            <Crosshair className="h-10 w-10 animate-spin text-jarvis-cyan" style={{ animationDuration: '4s' }} />
            <p className="holo-label mt-4 text-[11px] text-jarvis-cyan">ACQUIRING TARGET</p>
          </HoloPanel>
        </div>
      )}

      {/* Faint screen-edge corner brackets */}
      <EdgeBracket position="top-left" />
      <EdgeBracket position="top-right" />
      <EdgeBracket position="bottom-left" />
      <EdgeBracket position="bottom-right" />
    </>
  )
}

/** Five-digit counts would overflow the panel: 16383 -> 16.4K. */
function formatCount(n: number): string {
  if (n < 10_000) return String(n)
  return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}K`
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex items-end justify-between">
      <span className="holo-label whitespace-nowrap text-[10px]">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="holo-value text-xl font-semibold leading-none flex items-center gap-1.5">
          <Activity className="h-3 w-3 opacity-70" />
          {formatCount(value)}
        </span>
        {sub && <span className="holo-label text-[8px] opacity-60">{sub}</span>}
      </span>
    </div>
  )
}

/** Age of the newest flight snapshot: amber past 60 s, red past 5 min, so stale data is obvious. */
function DataAge({ feed, now }: { feed: HudOverlayProps['flightFeed']; now: Date | null }) {
  const ageS = feed && now ? Math.max(0, Math.round((now.getTime() - feed.snapshotAt) / 1000)) : null
  const tone = ageS === null ? 'text-muted-foreground' : ageS > 300 ? 'text-jarvis-red' : ageS > 60 ? 'text-jarvis-amber' : 'text-jarvis-cyan'
  const text = ageS === null ? '--' : ageS < 120 ? `${ageS}s` : `${Math.floor(ageS / 60)}m ${String(ageS % 60).padStart(2, '0')}s`
  return (
    <div className="flex items-end justify-between" title="Age of the newest flight data in view">
      <span className="holo-label text-[10px]">Data Age</span>
      <span className="flex items-baseline gap-1">
        <span className={`font-mono text-sm font-semibold tabular-nums leading-none ${tone}`}>{text}</span>
        {feed && <span className="holo-label text-[8px] opacity-60">{feed.source === 'opensky' ? 'OSKY' : 'ADSB'}</span>}
      </span>
    </div>
  )
}

function EdgeBracket({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const rot = {
    'top-left': '',
    'top-right': 'rotate-90',
    'bottom-right': 'rotate-180',
    'bottom-left': '-rotate-90',
  }[position]
  const pos = {
    'top-left': 'top-2.5 left-2.5',
    'top-right': 'top-2.5 right-2.5',
    'bottom-right': 'bottom-2.5 right-2.5',
    'bottom-left': 'bottom-2.5 left-2.5',
  }[position]

  return (
    <div className={`fixed ${pos} z-10 pointer-events-none ${rot} opacity-40`}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-jarvis-cyan">
        <path d="M2 26 L2 6 Q2 2 6 2 L26 2" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="6" cy="6" r="1.25" fill="currentColor" />
      </svg>
    </div>
  )
}
