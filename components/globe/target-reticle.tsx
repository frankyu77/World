'use client'

import { useEffect, useRef } from 'react'
import type { GlobeHandle } from '@/lib/globe/types'

interface TargetReticleProps {
  globe: GlobeHandle | null
  /** Show while an aircraft or satellite is locked. */
  active: boolean
  /** Range readout under the brackets (km). */
  rangeKm: number | null
}

const SIZE = 64

/**
 * Corner-bracket reticle around the tracked target, drawn like the HUD's EdgeBrackets. Its
 * position is written straight to the element's transform every rendered frame (no React
 * state), and it hides when the target is behind the globe or off-screen.
 */
export function TargetReticle({ globe, active, rangeKm }: TargetReticleProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!globe || !active) return
    const place = () => {
      const el = ref.current
      if (!el) return
      const p = globe.targetScreen()
      if (!p.visible) {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
        return
      }
      el.style.transform = `translate3d(${(p.x - SIZE / 2).toFixed(1)}px, ${(p.y - SIZE / 2).toFixed(1)}px, 0)`
      if (el.style.visibility !== 'visible') el.style.visibility = 'visible'
    }
    place()
    return globe.onFrame(place)
  }, [globe, active])

  if (!active) return null
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[16] will-change-transform"
      style={{ width: SIZE, height: SIZE, visibility: 'hidden' }}
      aria-hidden
    >
      <svg width={SIZE} height={SIZE} viewBox="0 0 64 64" fill="none" className="text-jarvis-cyan" style={{ filter: 'drop-shadow(0 0 4px var(--glow-cyan-hard))' }}>
        {/* Corner brackets */}
        <path d="M2 16 L2 2 L16 2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M48 2 L62 2 L62 16" stroke="currentColor" strokeWidth="1.5" />
        <path d="M62 48 L62 62 L48 62" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 62 L2 62 L2 48" stroke="currentColor" strokeWidth="1.5" />
        {/* Center pip */}
        <circle cx="32" cy="32" r="1.5" fill="currentColor" />
        <path d="M32 22 L32 26 M32 38 L32 42 M22 32 L26 32 M38 32 L42 32" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      </svg>
      <div className="holo-label absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[8px] text-jarvis-cyan">
        LOCK{rangeKm !== null ? ` · ${rangeKm < 100 ? rangeKm.toFixed(1) : Math.round(rangeKm).toLocaleString('en-US')} km` : ''}
      </div>
    </div>
  )
}
