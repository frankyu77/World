import type { Scene } from 'cesium'
import type { CesiumModule } from '../cesium-env'
import { bboxContains, bboxRadiusKm, formatBbox, REGIONAL_RADIUS_KM, snapBbox, type Bbox } from '../../feeds/bbox'
import type { FiresResponse, FlightSource, FlightsResponse, QuakesResponse, SatellitesResponse, SatelliteSet } from '../../feeds/types'
import { FlightsLayer } from './flights'
import { SatellitesLayer } from './satellites'
import { EarthquakesLayer, FiresLayer } from './points'
import { createPoller, type Poller } from './poller'
import { VisibilityProbe, type LayerId } from './shared'

export interface LiveStats {
  /** Live objects on screen across enabled layers (frustum + globe occlusion). */
  activeNodes: number
  /** Moving tracks on screen: aircraft + satellites. */
  tracking: number
  counts: Record<LayerId, number>
  flights: { snapshotAt: number; source: FlightSource; authenticated: boolean | null } | null
  /** null until the server says whether FIRMS_MAP_KEY is configured. */
  firesAvailable: boolean | null
  satelliteSet: SatelliteSet
  /** Worker SGP4 time for the last satellite sample (ms). */
  sgp4Ms: number
  /** Main-thread time this stats pass took (ms), for profiling. */
  statsMs: number
}

const STATS_INTERVAL_MS = 500

/**
 * The area actually requested: the view padded by half its size on each side and snapped to a
 * grid, so small moves (idle rotation, panning) stay inside it and don't refetch. A
 * whole-planet view pads out to the full world, which then never changes.
 */
function fetchArea(view: Bbox): Bbox {
  const lonSpan = view.west <= view.east ? view.east - view.west : view.east + 360 - view.west
  const latSpan = view.north - view.south
  if (lonSpan >= 120 || latSpan >= 90 || view.west > view.east) {
    return { west: -180, south: -90, east: 180, north: 90 }
  }
  const step = lonSpan > 30 ? 5 : lonSpan > 5 ? 1 : 0.25
  const pad = (f: number) =>
    snapBbox(
      {
        west: Math.max(-180, view.west - lonSpan * f),
        east: Math.min(180, view.east + lonSpan * f),
        south: Math.max(-90, view.south - latSpan * f),
        north: Math.min(90, view.north + latSpan * f),
      },
      step,
    )
  // A regional view must stay regional once padded, or the route would switch it to the
  // (older) OpenSky snapshot: pad less, down to none, until it fits.
  if (bboxRadiusKm(view) <= REGIONAL_RADIUS_KM) {
    for (const f of [0.5, 0.25, 0.1]) {
      const area = pad(f)
      if (bboxRadiusKm(area) <= REGIONAL_RADIUS_KM) return area
    }
    return view
  }
  return pad(0.5)
}

function covers(area: Bbox, view: Bbox): boolean {
  return (
    bboxContains(area, view.south, view.west) &&
    bboxContains(area, view.south, view.east) &&
    bboxContains(area, view.north, view.west) &&
    bboxContains(area, view.north, view.east)
  )
}

export class LayerManager {
  readonly flights: FlightsLayer
  readonly satellites: SatellitesLayer
  readonly earthquakes: EarthquakesLayer
  readonly fires: FiresLayer
  private readonly enabled: Record<LayerId, boolean> = { flights: false, satellites: false, earthquakes: false, fires: false }
  private readonly pollers: Record<LayerId, Poller>
  /** Area being fetched (padded view); null until the globe is in view. */
  private bounds: Bbox | null = null
  private viewRadiusKm = Number.POSITIVE_INFINITY
  private satSet: SatelliteSet = 'curated'
  /**
   * While an aircraft is tracked, flights follow it instead of the view: a regional box around
   * its current position, so it stays on fresh adsb.lol data even when the user orbits out to a
   * wide view (which would otherwise switch to the older OpenSky snapshot and make the tracked
   * position jump).
   */
  private flightFocus: (() => { lat: number; lon: number } | null) | null = null
  private firesAvailable: boolean | null = null
  private readonly probe: VisibilityProbe
  private readonly statsTimer: ReturnType<typeof setInterval>

  constructor(
    Cesium: CesiumModule,
    scene: Scene,
    private readonly onStats: (stats: LiveStats) => void,
  ) {
    this.flights = new FlightsLayer(Cesium, scene)
    this.satellites = new SatellitesLayer(Cesium, scene)
    this.earthquakes = new EarthquakesLayer(Cesium, scene)
    this.fires = new FiresLayer(Cesium, scene)
    this.probe = new VisibilityProbe(Cesium, scene.camera)

    const bboxParam = () => (this.bounds ? formatBbox(this.bounds) : null)
    this.pollers = {
      flights: createPoller<FlightsResponse>({
        url: () => {
          const focus = this.flightFocus?.()
          if (focus) {
            const dLat = 1.5
            const dLon = Math.min(10, 1.5 / Math.max(0.2, Math.cos((focus.lat * Math.PI) / 180)))
            const box: Bbox = {
              west: Math.max(-180, focus.lon - dLon),
              east: Math.min(180, focus.lon + dLon),
              south: Math.max(-90, focus.lat - dLat),
              north: Math.min(90, focus.lat + dLat),
            }
            return `/api/feeds/flights?bbox=${formatBbox(box)}`
          }
          const b = bboxParam()
          return b ? `/api/feeds/flights?bbox=${b}` : null
        },
        // Regional views (and a tracked aircraft) are served by adsb.lol (10 s data); wide views
        // by the shared OpenSky snapshot.
        intervalMs: () => (this.flightFocus || this.viewRadiusKm <= REGIONAL_RADIUS_KM ? 10_000 : 30_000),
        onData: (d) => this.flights.ingest(d),
      }),
      satellites: createPoller<SatellitesResponse>({
        url: () => `/api/feeds/satellites?set=${this.satSet}`,
        intervalMs: () => 6 * 3600_000,
        onData: (d) => {
          if (d.set === this.satSet) this.satellites.ingest(d)
        },
      }),
      earthquakes: createPoller<QuakesResponse>({
        url: () => {
          const b = bboxParam()
          return b ? `/api/feeds/earthquakes?bbox=${b}` : null
        },
        intervalMs: () => 60_000,
        onData: (d) => this.earthquakes.ingest(d.quakes),
      }),
      fires: createPoller<FiresResponse>({
        url: () => {
          const b = bboxParam()
          return b && this.firesAvailable ? `/api/feeds/fires?bbox=${b}` : null
        },
        intervalMs: () => 10 * 60_000,
        onData: (d) => {
          if (!d.disabled) this.fires.ingest(d.fires)
        },
      }),
    }

    void this.probeFires()
    this.statsTimer = setInterval(() => this.emitStats(), STATS_INTERVAL_MS)
  }

  private async probeFires(): Promise<void> {
    try {
      const res = await fetch('/api/feeds/fires?probe=1')
      const body = (await res.json()) as FiresResponse
      this.firesAvailable = !body.disabled
    } catch {
      this.firesAvailable = false
    }
    if (this.firesAvailable && this.enabled.fires) this.pollers.fires.start()
    this.emitStats()
  }

  setEnabled(id: LayerId, on: boolean): void {
    if (this.enabled[id] === on) return
    this.enabled[id] = on
    this.layer(id).setEnabled(on)
    if (id === 'fires' && !this.firesAvailable) return
    if (on) this.pollers[id].start()
    else this.pollers[id].stop()
    this.emitStats()
  }

  setSatelliteSet(set: SatelliteSet): void {
    if (set === this.satSet) return
    this.satSet = set
    if (this.enabled.satellites) {
      this.pollers.satellites.stop()
      this.pollers.satellites.start()
    }
  }

  /** Follow a tracked aircraft with the flights feed (null to go back to following the view). */
  setFlightFocus(focus: (() => { lat: number; lon: number } | null) | null): void {
    this.flightFocus = focus
    this.pollers.flights.refresh()
  }

  /**
   * The view settled. Refetch only when it leaves the area last requested, or crosses between
   * regional and wide (which changes the flight source); otherwise the pollers' intervals do.
   */
  setView(view: Bbox | null): void {
    if (!view) return
    if (this.flightFocus) {
      // Flights follow the tracked aircraft; only the other bbox layers follow the view.
      this.bounds = fetchArea(view)
      this.pollers.earthquakes.refresh()
      this.pollers.fires.refresh()
      return
    }
    const radius = bboxRadiusKm(view)
    const wasRegional = this.viewRadiusKm <= REGIONAL_RADIUS_KM
    this.viewRadiusKm = radius
    const sourceChanged = wasRegional !== radius <= REGIONAL_RADIUS_KM
    if (this.bounds && covers(this.bounds, view) && !sourceChanged) return
    this.bounds = fetchArea(view)
    this.pollers.flights.refresh()
    this.pollers.earthquakes.refresh()
    this.pollers.fires.refresh()
  }

  /** Per-frame motion. */
  frame(now: number): void {
    this.flights.update(now)
    this.satellites.update(now)
  }

  private layer(id: LayerId) {
    return id === 'flights' ? this.flights : id === 'satellites' ? this.satellites : id === 'earthquakes' ? this.earthquakes : this.fires
  }

  private emitStats(): void {
    const started = performance.now()
    this.probe.begin()
    const counts: Record<LayerId, number> = {
      flights: this.flights.countVisible(this.probe),
      satellites: this.satellites.countVisible(this.probe),
      earthquakes: this.earthquakes.countVisible(this.probe),
      fires: this.fires.countVisible(this.probe),
    }
    const f = this.flights
    this.onStats({
      activeNodes: counts.flights + counts.satellites + counts.earthquakes + counts.fires,
      tracking: counts.flights + counts.satellites,
      counts,
      flights:
        this.enabled.flights && f.snapshotAt !== null && f.source !== null
          ? { snapshotAt: f.snapshotAt, source: f.source, authenticated: f.authenticated }
          : null,
      firesAvailable: this.firesAvailable,
      satelliteSet: this.satSet,
      sgp4Ms: this.satellites.lastPropagateMs,
      statsMs: performance.now() - started,
    })
  }

  destroy(): void {
    clearInterval(this.statsTimer)
    for (const p of Object.values(this.pollers)) p.stop()
    this.flights.destroy()
    this.satellites.destroy()
    this.earthquakes.destroy()
    this.fires.destroy()
  }
}
