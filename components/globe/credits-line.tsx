'use client'

import type { CreditEntry } from '@/lib/globe/types'

/**
 * One-line attribution for every active source, styled like the holo labels. It never wraps:
 * it truncates with an ellipsis before reaching Cesium's logo (both sides kept clear so it
 * stays centered), the full list is in the title tooltip, and the same entries are added to
 * Cesium's "Data attribution" popup (see GlobeHandle.setAttribution).
 */
export function CreditsLine({ credits }: { credits: CreditEntry[] }) {
  if (credits.length === 0) return null
  return (
    <div
      title={credits.map((c) => c.label).join(' · ')}
      className="pointer-events-auto fixed bottom-1.5 left-1/2 z-20 w-max max-w-[max(40vw,calc(100vw-680px))] -translate-x-1/2 truncate whitespace-nowrap text-center font-mono text-[9px] tracking-wide text-muted-foreground/70"
    >
      <span className="opacity-60">DATA · </span>
      {credits.map((credit, i) => (
        <span key={credit.id}>
          {i > 0 && <span className="opacity-40"> · </span>}
          {credit.href ? (
            <a href={credit.href} target="_blank" rel="noopener noreferrer" className="hover:text-jarvis-cyan">
              {credit.label}
            </a>
          ) : (
            credit.label
          )}
        </span>
      ))}
    </div>
  )
}
