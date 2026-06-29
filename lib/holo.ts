/**
 * AEGIS holographic design system — shared tokens & utilities.
 *
 * Centralizes colors, glow tiers, status semantics and motion presets so
 * components never hardcode magic values. Pair with the CSS classes defined
 * in app/globals.css (.holo-panel, .glow-*, .holo-display, etc.).
 */

export const holoColors = {
  cyan: '#2ff5ff',
  teal: '#14e0c8',
  blue: '#2b9bff',
  amber: '#ffb020',
  red: '#ff4d5e',
  green: '#34f5a0',
  bg: '#00060e',
} as const

export type GlowTier = 'sm' | 'md' | 'lg'

/** Tailwind/utility class for a shared glow tier. */
export const glow = (tier: GlowTier = 'md') => `glow-${tier}`

export type StatusKind = 'online' | 'active' | 'syncing' | 'offline' | 'warning'

/** Semantic status -> dot color + label class. */
export const statusColor: Record<StatusKind, string> = {
  online: 'bg-jarvis-green',
  active: 'bg-jarvis-cyan',
  syncing: 'bg-jarvis-amber',
  warning: 'bg-jarvis-amber',
  offline: 'bg-jarvis-red',
}

/** Shared framer-motion entrance presets for HUD elements. */
export const motionPresets = {
  fadeDown: {
    initial: { opacity: 0, y: -16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
  fadeUp: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
  fadeLeft: {
    initial: { opacity: 0, x: -16 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
  fadeRight: {
    initial: { opacity: 0, x: 16 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
} as const

/** Map a 0..1 intensity to a tactical green/amber/red color. */
export function intensityColor(level: number): string {
  if (level < 0.4) return holoColors.green
  if (level < 0.7) return holoColors.amber
  return holoColors.red
}
