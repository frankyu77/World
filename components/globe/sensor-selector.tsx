'use client'

import { motion } from 'framer-motion'
import { ScanEye } from 'lucide-react'
import { HoloPanel } from '../holo/holo-panel'
import { motionPresets } from '@/lib/holo'
import { cn } from '@/lib/utils'
import { SENSOR_MODES, type SensorMode } from '@/lib/globe/sensors/modes'

interface SensorSelectorProps {
  mode: SensorMode
  onChange: (mode: SensorMode) => void
  /** Slides out with the rest of the right column while the city panel is open. */
  hidden?: boolean
}

/**
 * SENSOR panel in the right column, under INTELLIGENCE. Same HoloPanel surface and active
 * styling as the LAYERS buttons; keys 1-6 switch modes (see jarvis-map).
 */
export function SensorSelector({ mode, onChange, hidden = false }: SensorSelectorProps) {
  const active = SENSOR_MODES.find((m) => m.id === mode)
  return (
    <motion.div
      animate={hidden ? { x: 48, opacity: 0 } : { x: 0, opacity: 1 }}
      transition={motionPresets.fadeRight.transition}
      className={cn('fixed right-6 top-[180px] z-20 hidden md:block', hidden && 'pointer-events-none')}
    >
      <HoloPanel {...motionPresets.fadeRight} className="w-[196px] p-4">
        <div className="flex items-center gap-2">
          <ScanEye className="h-3.5 w-3.5 text-jarvis-cyan" />
          <span className="holo-label text-[10px]">SENSOR</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Sensor mode">
          {SENSOR_MODES.map((m) => {
            const isActive = m.id === mode
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={isActive}
                title={`${m.label} — ${m.description} (${m.key})`}
                onClick={() => onChange(m.id)}
                className={cn(
                  'group flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-all',
                  isActive
                    ? 'bg-jarvis-cyan/12 text-jarvis-cyan'
                    : 'text-muted-foreground hover:bg-jarvis-cyan/8 hover:text-foreground',
                )}
              >
                <span className={cn('font-mono text-[9px] tabular-nums', isActive ? 'opacity-90' : 'opacity-50')}>{m.key}</span>
                <span
                  className="holo-label text-[9px]"
                  style={isActive ? { textShadow: '0 0 6px var(--glow-cyan-hard)' } : undefined}
                >
                  {m.label}
                </span>
                <span
                  className={cn(
                    'ml-auto h-1 w-1 rounded-full transition-all',
                    isActive ? 'bg-jarvis-cyan animate-pulse' : 'bg-muted-foreground/30',
                  )}
                />
              </button>
            )
          })}
        </div>
        <div className="holo-label mt-2.5 truncate text-[8px] opacity-60">{active?.description}</div>
      </HoloPanel>
    </motion.div>
  )
}
