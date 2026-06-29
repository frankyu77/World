'use client'

import { cn } from '@/lib/utils'

interface HoloBeaconProps {
  /** Diameter of the solid core in px. */
  size?: number
  /** Number of expanding signal rings. */
  rings?: number
  color?: string
  className?: string
}

/**
 * A living holographic beacon: a glowing pulsing core that continuously emits
 * expanding signal rings. Pure CSS animation (transform/opacity) so it stays
 * cheap even with many on screen.
 */
export function HoloBeacon({ size = 12, rings = 3, color, className }: HoloBeaconProps) {
  const style = color
    ? ({ '--beacon-color': color } as React.CSSProperties)
    : undefined

  return (
    <div
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size, ...style }}
    >
      {Array.from({ length: rings }).map((_, i) => (
        <span
          key={i}
          className="beacon-ring"
          style={{
            animationDelay: `${(i * 2.6) / rings}s`,
            borderColor: color ?? undefined,
          }}
        />
      ))}
      <span
        className="beacon-core"
        style={{
          width: size,
          height: size,
          background: color
            ? `radial-gradient(circle, #fff 0%, ${color} 45%, transparent 100%)`
            : undefined,
        }}
      />
    </div>
  )
}
