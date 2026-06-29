'use client'

import { motion } from 'framer-motion'
import { CloudSun, Car, RotateCcw, type LucideIcon } from 'lucide-react'
import { HoloPanel } from './holo/holo-panel'
import { cn } from '@/lib/utils'

interface MapControlsProps {
  showTraffic: boolean
  showWeather: boolean
  onToggleTraffic: () => void
  onToggleWeather: () => void
  onResetView: () => void
}

/** Bottom-left layer controls: traffic + weather toggles and recenter. */
export function MapControls({
  showTraffic,
  showWeather,
  onToggleTraffic,
  onToggleWeather,
  onResetView,
}: MapControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 left-6 z-30"
    >
      <HoloPanel corners={false} className="p-4">
        <span className="holo-label text-[10px]">LAYERS</span>
        <div className="mt-3 space-y-2">
          <ControlButton icon={Car} label="Traffic" isActive={showTraffic} onClick={onToggleTraffic} />
          <ControlButton icon={CloudSun} label="Weather" isActive={showWeather} onClick={onToggleWeather} />
        </div>
        <div className="my-3 h-px w-full bg-jarvis-cyan/15" />
        <ControlButton icon={RotateCcw} label="Recenter" isActive={false} onClick={onResetView} />
      </HoloPanel>
    </motion.div>
  )
}

function ControlButton({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: LucideIcon
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-3 py-2 transition-all',
        isActive
          ? 'bg-jarvis-cyan/12 text-jarvis-cyan'
          : 'text-muted-foreground hover:bg-jarvis-cyan/8 hover:text-foreground',
      )}
    >
      <Icon
        className="h-4 w-4 transition-transform group-hover:scale-110"
        style={isActive ? { filter: 'drop-shadow(0 0 4px var(--glow-cyan-hard))' } : undefined}
      />
      <span className="holo-label text-[10px]">{label}</span>
      <span
        className={cn(
          'ml-auto h-1.5 w-1.5 rounded-full transition-all',
          isActive ? 'bg-jarvis-cyan animate-pulse' : 'bg-muted-foreground/30',
        )}
      />
    </button>
  )
}
