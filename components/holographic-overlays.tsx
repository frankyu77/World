'use client'

/**
 * Restrained map ambiance — professional GIS, not a sci-fi HUD.
 *
 *  - <MapProjectionFX/>  over the map (below UI): a single, very faint static
 *    coordinate grid (<10% opacity). No radar sweeps, arcs, satellites, or
 *    floating nodes — nothing that competes with the geographic data.
 *
 *  - <AtmosphereFX/>     above everything: a gentle focusing vignette and a
 *    soft cyan bloom. No scanlines, no noise, no moving elements.
 *
 * Everything here is pointer-events:none and static, so the map and its real
 * data (boundaries, roads, traffic, markers) remain the focal point.
 */

export function MapProjectionFX() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="fx-grid" />
    </div>
  )
}

export function AtmosphereFX() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <div className="fx-atmosphere" />
      <div className="fx-vignette" />
    </div>
  )
}
