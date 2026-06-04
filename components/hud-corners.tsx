'use client'

import { motion } from 'framer-motion'

interface HudCornersProps {
  children: React.ReactNode
  isActive?: boolean
  className?: string
}

export function HudCorners({ children, isActive = false, className = '' }: HudCornersProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Corner Brackets */}
      <Corner position="top-left" isActive={isActive} />
      <Corner position="top-right" isActive={isActive} />
      <Corner position="bottom-left" isActive={isActive} />
      <Corner position="bottom-right" isActive={isActive} />
      
      {/* Content */}
      {children}
    </div>
  )
}

function Corner({ position, isActive }: { position: string; isActive: boolean }) {
  const positionClasses: Record<string, string> = {
    'top-left': '-top-1 -left-1',
    'top-right': '-top-1 -right-1 rotate-90',
    'bottom-left': '-bottom-1 -left-1 -rotate-90',
    'bottom-right': '-bottom-1 -right-1 rotate-180',
  }

  return (
    <motion.div
      className={`absolute ${positionClasses[position]} pointer-events-none z-10`}
      initial={false}
      animate={{
        opacity: isActive ? 1 : 0.5,
        scale: isActive ? 1.1 : 1,
      }}
      transition={{ duration: 0.2 }}
    >
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 16 16" 
        fill="none"
        className={isActive ? 'text-jarvis-cyan' : 'text-jarvis-border'}
      >
        <path
          d="M0 0 L12 0 L12 2 L2 2 L2 12 L0 12 Z"
          fill="currentColor"
        />
      </svg>
    </motion.div>
  )
}
