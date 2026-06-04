'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BootSequenceProps {
  onComplete: () => void
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [phase, setPhase] = useState(0)
  const [showBoot, setShowBoot] = useState(true)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1300),
      setTimeout(() => setPhase(4), 1800),
      setTimeout(() => {
        setShowBoot(false)
        onComplete()
      }, 2500),
    ]

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  if (!showBoot) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-jarvis-bg flex items-center justify-center"
      >
        <div className="text-center">
          {/* Logo / Title */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-4xl md:text-6xl font-mono font-bold jarvis-text tracking-wider">
              J.A.R.V.I.S
            </h1>
            <p className="text-sm md:text-base text-muted-foreground font-mono mt-2">
              Global Intelligence Mapping System
            </p>
          </motion.div>

          {/* Boot Messages */}
          <div className="mt-8 space-y-2 text-left max-w-md mx-auto px-4">
            <BootMessage show={phase >= 1} text="Initializing map interface..." />
            <BootMessage show={phase >= 2} text="Loading satellite imagery..." />
            <BootMessage show={phase >= 3} text="Connecting to data streams..." />
            <BootMessage show={phase >= 4} text="System ready." isSuccess />
          </div>

          {/* Loading Bar */}
          <div className="mt-8 w-64 mx-auto">
            <div className="h-1 bg-jarvis-border rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-jarvis-cyan"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(phase * 25, 100)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Version */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 ? 0.5 : 0 }}
            className="mt-6 text-xs font-mono text-muted-foreground"
          >
            v3.0.1 | Global Coverage Active
          </motion.p>
        </div>

        {/* Scan Effect */}
        <motion.div
          initial={{ top: 0 }}
          animate={{ top: '100%' }}
          transition={{ duration: 2, repeat: 0, ease: 'linear' }}
          className="absolute left-0 right-0 h-1 bg-gradient-to-b from-transparent via-jarvis-cyan/30 to-transparent pointer-events-none"
        />
      </motion.div>
    </AnimatePresence>
  )
}

function BootMessage({ 
  show, 
  text, 
  isSuccess = false 
}: { 
  show: boolean
  text: string
  isSuccess?: boolean 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: show ? 1 : 0, x: show ? 0 : -20 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-2 font-mono text-sm"
    >
      <span className={isSuccess ? 'text-jarvis-green' : 'text-jarvis-cyan'}>
        {isSuccess ? '[OK]' : '[...]'}
      </span>
      <span className={isSuccess ? 'text-jarvis-green' : 'text-muted-foreground'}>
        {text}
      </span>
    </motion.div>
  )
}
