'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BootSequenceProps {
  onComplete: () => void
}

const BOOT_STEPS = [
  'Initializing holographic projection matrix...',
  'Calibrating geospatial coordinate grid...',
  'Linking orbital satellite array...',
  'Synchronizing intelligence data streams...',
  'Command center online.',
]

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [phase, setPhase] = useState(0)
  const [showBoot, setShowBoot] = useState(true)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 750),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 1650),
      setTimeout(() => setPhase(5), 2050),
      setTimeout(() => {
        setShowBoot(false)
        onComplete()
      }, 2700),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  if (!showBoot) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-jarvis-bg"
      >
        {/* Background holo grid */}
        <div className="fx-grid opacity-40" />
        <div className="fx-atmosphere" />

        {/* Expanding radar rings behind logo */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-jarvis-cyan/30"
              initial={{ width: 80, height: 80, opacity: 0.6 }}
              animate={{ width: 600, height: 600, opacity: 0 }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
            />
          ))}
        </div>

        <div className="relative z-10 text-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
            <h1 className="holo-display text-5xl font-black tracking-[0.3em] md:text-7xl">AEGIS</h1>
            <p className="holo-label mt-3 text-[10px] md:text-xs">Global Intelligence Command Center</p>
          </motion.div>

          <div className="mx-auto mt-10 max-w-md space-y-2 px-4 text-left">
            {BOOT_STEPS.map((text, i) => (
              <BootMessage key={i} show={phase >= i + 1} text={text} isSuccess={i === BOOT_STEPS.length - 1} />
            ))}
          </div>

          <div className="mx-auto mt-8 w-72">
            <div className="h-0.5 overflow-hidden rounded-full bg-jarvis-cyan/15">
              <motion.div
                className="h-full bg-jarvis-cyan"
                style={{ boxShadow: '0 0 10px var(--glow-cyan-hard)' }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(phase * 20, 100)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 ? 0.5 : 0 }}
            className="holo-label mt-6 text-[9px]"
          >
            BUILD v4.2.0 · GLOBAL COVERAGE 94.7%
          </motion.p>
        </div>

        {/* Scan beam */}
        <motion.div
          initial={{ top: '-10%' }}
          animate={{ top: '110%' }}
          transition={{ duration: 2.5, repeat: 0, ease: 'linear' }}
          className="absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-jarvis-cyan/15 to-transparent"
        />
      </motion.div>
    </AnimatePresence>
  )
}

function BootMessage({ show, text, isSuccess = false }: { show: boolean; text: string; isSuccess?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: show ? 1 : 0, x: show ? 0 : -20 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-2 font-mono text-[13px]"
    >
      <span className={isSuccess ? 'text-jarvis-green' : 'text-jarvis-cyan'}>{isSuccess ? '[ OK ]' : '[ .. ]'}</span>
      <span className={isSuccess ? 'text-jarvis-green' : 'text-muted-foreground'}>{text}</span>
    </motion.div>
  )
}
