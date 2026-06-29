'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HoloPanel } from './holo-panel'

interface HudWidgetProps {
  label: string
  value: string | number
  unit?: string
  icon?: LucideIcon
  /** Optional sub-line beneath the value. */
  sub?: string
  /** Color of the value text (defaults to cyan). */
  accent?: string
  className?: string
  /** Compact spacing for dense telemetry strips. */
  dense?: boolean
}

/**
 * A small holographic readout widget for telemetry: a label, a large
 * monospace value, and an optional icon / sub-line. Used for the floating
 * intelligence stats (active nodes, signal strength, coverage, …).
 */
export function HudWidget({
  label,
  value,
  unit,
  icon: Icon,
  sub,
  accent,
  className,
  dense = false,
}: HudWidgetProps) {
  return (
    <HoloPanel className={cn(dense ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5', className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-jarvis-cyan shrink-0" style={{ color: accent }} />}
        <span className={cn('holo-label', dense ? 'text-[9px]' : 'text-[10px]')}>{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={cn('holo-value font-semibold leading-none', dense ? 'text-base' : 'text-xl')}
          style={accent ? { color: accent, textShadow: `0 0 8px ${accent}66` } : undefined}
        >
          {value}
        </span>
        {unit && <span className="holo-label text-[9px] opacity-70">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/70">{sub}</div>}
    </HoloPanel>
  )
}
