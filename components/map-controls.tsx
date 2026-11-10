'use client'

import { motion } from 'framer-motion'
import { RotateCcw, type LucideIcon } from 'lucide-react'
import { HoloPanel } from './holo/holo-panel'
import { cn } from '@/lib/utils'

export interface LayerToggle {
  id: string
  label: string
  icon: LucideIcon
  active: boolean
  /** Unavailable (e.g. no API key); shown dimmed with `tag`. */
  disabled?: boolean
  /** Short status in place of the dot, e.g. "NO KEY". */
  tag?: string
  /** Objects of this layer currently on screen. */
  count?: number
}

export interface SubOption<T extends string> {
  value: T
  label: string
}

interface MapControlsProps {
  toggles: LayerToggle[]
  onToggle: (id: string) => void
  /** Optional second row under one toggle (e.g. satellite set), shown while that layer is on. */
  sub?: { forId: string; value: string; options: SubOption<string>[]; onChange: (value: string) => void }
  onResetView: () => void
}

/** Bottom-left layer controls: data-driven layer toggles and recenter. */
export function MapControls({ toggles, onToggle, sub, onResetView }: MapControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 left-6 z-30"
    >
      <HoloPanel corners={false} className="w-[196px] p-4">
        <span className="holo-label text-[10px]">LAYERS</span>
        <div className="mt-3 space-y-1.5">
          {toggles.map((t) => (
            <div key={t.id}>
              <ControlButton toggle={t} onClick={() => onToggle(t.id)} />
              {sub && sub.forId === t.id && t.active && (
                <div className="ml-7 mt-1 flex gap-1" role="radiogroup" aria-label={`${t.label} set`}>
                  {sub.options.map((o) => {
                    const on = o.value === sub.value
                    return (
                      <button
                        key={o.value}
                        role="radio"
                        aria-checked={on}
                        onClick={() => sub.onChange(o.value)}
                        className={cn(
                          'holo-label rounded px-1.5 py-0.5 text-[8px] transition-colors',
                          on ? 'bg-jarvis-cyan/12 text-jarvis-cyan' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="my-3 h-px w-full bg-jarvis-cyan/15" />
        <ControlButton toggle={{ id: 'recenter', label: 'Recenter', icon: RotateCcw, active: false }} onClick={onResetView} />
      </HoloPanel>
    </motion.div>
  )
}

function ControlButton({ toggle, onClick }: { toggle: LayerToggle; onClick: () => void }) {
  const { icon: Icon, label, active, disabled, tag, count } = toggle
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled && tag ? `${label}: ${tag}` : label}
      aria-pressed={toggle.id === 'recenter' ? undefined : active}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-3 py-2 transition-all',
        disabled
          ? 'cursor-not-allowed text-muted-foreground/40'
          : active
            ? 'bg-jarvis-cyan/12 text-jarvis-cyan'
            : 'text-muted-foreground hover:bg-jarvis-cyan/8 hover:text-foreground',
      )}
    >
      <Icon
        className="h-4 w-4 transition-transform group-hover:scale-110"
        style={active && !disabled ? { filter: 'drop-shadow(0 0 4px var(--glow-cyan-hard))' } : undefined}
      />
      <span className="holo-label text-[10px]">{label}</span>
      {tag ? (
        <span className="holo-label ml-auto text-[8px] text-jarvis-amber/80">{tag}</span>
      ) : (
        <span className="ml-auto flex items-center gap-1.5">
          {active && count !== undefined && (
            <span className="font-mono text-[9px] tabular-nums opacity-70">{count.toLocaleString('en-US')}</span>
          )}
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-all',
              active ? 'bg-jarvis-cyan animate-pulse' : 'bg-muted-foreground/30',
            )}
          />
        </span>
      )}
    </button>
  )
}
