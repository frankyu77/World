'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { GeoPoint, GlobeHandle } from '@/lib/globe/types'

export interface ScreenAnchorItem {
  id: string
  point: GeoPoint
  /** Which part of the element sits on the point: its bottom-center (markers) or center (beacons). */
  anchor: 'bottom' | 'center'
  node: ReactNode
}

interface ScreenAnchorsProps {
  globe: GlobeHandle | null
  items: ScreenAnchorItem[]
}

/**
 * DOM layer pinned to world positions. Positions are written straight to each element's
 * transform from Cesium's postRender, never through React state, so a moving camera costs
 * no re-renders. Elements behind the globe or off-screen are hidden.
 */
export function ScreenAnchors({ globe, items }: ScreenAnchorsProps) {
  const elements = useRef(new Map<string, HTMLDivElement>())
  const latestItems = useRef(items)
  latestItems.current = items

  useEffect(() => {
    if (!globe) return
    const place = () => {
      for (const item of latestItems.current) {
        const el = elements.current.get(item.id)
        if (!el) continue
        const p = globe.project(item.point)
        if (!p.visible) {
          if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
          continue
        }
        const dy = item.anchor === 'bottom' ? '-100%' : '-50%'
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, ${dy})`
        if (el.style.visibility !== 'visible') el.style.visibility = 'visible'
      }
    }
    place()
    return globe.onFrame(place)
  }, [globe])

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {items.map((item) => (
        <div
          key={item.id}
          data-anchor-id={item.id}
          ref={(el) => {
            if (el) elements.current.set(item.id, el)
            else elements.current.delete(item.id)
          }}
          className="pointer-events-auto absolute left-0 top-0 will-change-transform"
          style={{ visibility: 'hidden' }}
        >
          {item.node}
        </div>
      ))}
    </div>
  )
}
