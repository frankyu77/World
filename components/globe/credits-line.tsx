'use client'

import type { CreditEntry } from '@/lib/globe/types'

/** One-line attribution for every active source, styled like the holo labels. */
export function CreditsLine({ credits }: { credits: CreditEntry[] }) {
  if (credits.length === 0) return null
  return (
    <div className="pointer-events-auto fixed bottom-1.5 left-1/2 z-20 w-max max-w-[min(92vw,900px)] -translate-x-1/2 text-center leading-snug font-mono text-[9px] tracking-wide text-muted-foreground/70">
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
