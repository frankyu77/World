'use client'

import { forwardRef } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface HoloPanelProps extends HTMLMotionProps<'div'> {
  /** Render animated cyan corner brackets. */
  corners?: boolean
  /** Render the flowing border accent. */
  flow?: boolean
  /** Apply hover lift + glow intensification. */
  interactive?: boolean
  /** Pulse the corner brackets / border to signal an active state. */
  active?: boolean
  children?: React.ReactNode
}

/**
 * The single source of truth for the glassmorphism holographic surface used
 * across every UI panel. Combines blur, layered glow, optional corner
 * brackets, flowing border, and a hover lift — all GPU-friendly.
 */
export const HoloPanel = forwardRef<HTMLDivElement, HoloPanelProps>(
  ({ corners = true, flow = false, interactive = false, active = false, className, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          'holo-panel rounded-lg',
          flow && 'holo-border-flow',
          interactive && 'holo-panel-hover',
          className,
        )}
        style={{
          borderColor: active ? 'var(--glow-cyan-hard)' : undefined,
          ...props.style,
        }}
        {...props}
      >
        {corners && <HoloCorners active={active} />}
        {children}
      </motion.div>
    )
  },
)
HoloPanel.displayName = 'HoloPanel'

/** Four animated cyan corner brackets, absolutely positioned to the parent. */
export function HoloCorners({ active = false }: { active?: boolean }) {
  return (
    <>
      <span className={cn('holo-corner holo-corner-tl', active && 'animate-pulse')} />
      <span className={cn('holo-corner holo-corner-tr', active && 'animate-pulse')} />
      <span className={cn('holo-corner holo-corner-bl', active && 'animate-pulse')} />
      <span className={cn('holo-corner holo-corner-br', active && 'animate-pulse')} />
    </>
  )
}
