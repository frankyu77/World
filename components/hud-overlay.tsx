'use client'

import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface HudOverlayProps {
  zoom: number
  latitude: number
  longitude: number
  isLoading: boolean
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

export function HudOverlay({ zoom, latitude, longitude, isLoading }: HudOverlayProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const currentTime = now ? formatTime(now) : ''
  const currentDate = now ? formatDate(now) : ''

  return (
    <>
      {/* Top Left - System Info */}
      <div className="fixed top-4 left-4 z-20 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="jarvis-panel rounded-lg p-3 md:p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2 w-2 rounded-full ${isLoading ? 'bg-jarvis-amber animate-pulse' : 'bg-jarvis-green'}`} />
            <span className="text-xs font-mono text-muted-foreground">
              {isLoading ? 'SYNCING...' : 'SYSTEM ACTIVE'}
            </span>
          </div>
          <div className="text-xl md:text-2xl font-mono jarvis-text tabular-nums">
            {currentTime}
          </div>
          <div className="text-xs font-mono text-muted-foreground mt-1">
            {currentDate}
          </div>
        </motion.div>
      </div>

      {/* Bottom Left - Coordinates */}
      <div className="fixed bottom-20 left-4 z-20 pointer-events-none hidden md:block">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="jarvis-panel rounded-lg px-4 py-3"
        >
          <div className="text-xs font-mono text-muted-foreground mb-1">COORDINATES</div>
          <div className="font-mono text-sm jarvis-text tabular-nums">
            <div>LAT: {latitude.toFixed(4)}°</div>
            <div>LNG: {longitude.toFixed(4)}°</div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Center - Zoom Level */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="jarvis-panel rounded-full px-4 md:px-6 py-2 flex items-center gap-2 md:gap-4"
        >
          <div className="text-xs font-mono text-muted-foreground">ZOOM</div>
          <div className="font-mono jarvis-text tabular-nums">{zoom.toFixed(1)}x</div>
          <div className="h-4 w-px bg-border" />
          <div className="text-xs font-mono text-muted-foreground hidden sm:block">
            {zoom < 5 ? 'GLOBAL VIEW' : 
             zoom < 8 ? 'CONTINENTAL' : 
             zoom < 12 ? 'REGIONAL' : 
             zoom < 15 ? 'CITY LEVEL' : 'STREET LEVEL'}
          </div>
          <div className="text-xs font-mono text-muted-foreground sm:hidden">
            {zoom < 5 ? 'GLOBAL' : 
             zoom < 8 ? 'CONT.' : 
             zoom < 12 ? 'REGION' : 
             zoom < 15 ? 'CITY' : 'STREET'}
          </div>
        </motion.div>
      </div>

      {/* Top Right - Status Indicators (behind search on mobile) */}
      <div className="fixed top-4 right-20 md:right-4 z-20 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <StatusIndicator label="DATA" status="online" />
          <StatusIndicator label="GPS" status="active" />
        </motion.div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-jarvis-bg/50 backdrop-blur-sm pointer-events-none">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="jarvis-panel rounded-xl p-8 flex flex-col items-center"
          >
            <Loader2 className="h-10 w-10 text-jarvis-cyan animate-spin" />
            <p className="mt-4 font-mono text-sm text-muted-foreground">ACQUIRING TARGET...</p>
          </motion.div>
        </div>
      )}

      {/* Corner Decorations */}
      <HudCornerDecoration position="top-left" />
      <HudCornerDecoration position="top-right" />
      <HudCornerDecoration position="bottom-left" />
      <HudCornerDecoration position="bottom-right" />
    </>
  )
}

function StatusIndicator({ label, status }: { label: string; status: 'online' | 'offline' | 'active' }) {
  const colors = {
    online: 'bg-jarvis-green',
    offline: 'bg-jarvis-red',
    active: 'bg-jarvis-cyan',
  }

  return (
    <div className="jarvis-panel rounded-md px-3 py-1.5 flex items-center gap-2">
      <div className={`h-1.5 w-1.5 rounded-full ${colors[status]} animate-pulse`} />
      <span className="text-xs font-mono text-muted-foreground">{label}</span>
    </div>
  )
}

function HudCornerDecoration({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const positionClasses = {
    'top-left': 'top-0 left-0',
    'top-right': 'top-0 right-0 rotate-90',
    'bottom-left': 'bottom-0 left-0 -rotate-90',
    'bottom-right': 'bottom-0 right-0 rotate-180',
  }

  return (
    <div className={`fixed ${positionClasses[position]} pointer-events-none z-10 opacity-30`}>
      <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
        <path
          d="M0 0 L30 0 L30 3 L3 3 L3 30 L0 30 Z"
          fill="currentColor"
          className="text-jarvis-cyan"
        />
        <path
          d="M0 0 L15 0 L15 1 L1 1 L1 15 L0 15 Z"
          fill="currentColor"
          className="text-jarvis-cyan"
        />
      </svg>
    </div>
  )
}
