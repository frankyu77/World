'use client'

import { motion } from 'framer-motion'
import { Layers, CloudSun, Car, RotateCcw } from 'lucide-react'

interface MapControlsProps {
  showTraffic: boolean
  showWeather: boolean
  onToggleTraffic: () => void
  onToggleWeather: () => void
  onResetView: () => void
}

export function MapControls({
  showTraffic,
  showWeather,
  onToggleTraffic,
  onToggleWeather,
  onResetView,
}: MapControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 }}
      className="fixed left-4 top-32 md:top-1/2 md:-translate-y-1/2 z-30 flex flex-col gap-2"
    >
      {/* Layer Controls */}
      <div className="jarvis-panel rounded-lg p-2 space-y-1">
        <ControlButton
          icon={Car}
          label="Traffic"
          isActive={showTraffic}
          onClick={onToggleTraffic}
        />
        <ControlButton
          icon={CloudSun}
          label="Weather"
          isActive={showWeather}
          onClick={onToggleWeather}
        />
      </div>

      {/* Reset View */}
      <div className="jarvis-panel rounded-lg p-2">
        <ControlButton
          icon={RotateCcw}
          label="Reset"
          isActive={false}
          onClick={onResetView}
        />
      </div>

      {/* Legend (mobile hidden) */}
      <div className="hidden lg:block jarvis-panel rounded-lg p-3 mt-2">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-4 w-4 text-jarvis-cyan" />
          <span className="text-xs font-mono text-muted-foreground">LEGEND</span>
        </div>
        <div className="space-y-1.5 text-xs">
          <LegendItem color="bg-jarvis-green" label="Light traffic" />
          <LegendItem color="bg-jarvis-amber" label="Moderate" />
          <LegendItem color="bg-jarvis-red" label="Heavy" />
        </div>
      </div>
    </motion.div>
  )
}

function ControlButton({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: typeof Car
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-md transition-all w-full
        ${isActive 
          ? 'bg-jarvis-cyan/20 text-jarvis-cyan' 
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }
      `}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="text-xs font-mono hidden sm:inline">{label}</span>
    </button>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-4 rounded ${color}`} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
