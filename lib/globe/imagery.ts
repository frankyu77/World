import type { ImageryLayer, ImageryProvider, Viewer } from 'cesium'
import type { CesiumModule } from './cesium-env'
import type { ImageryMode } from './types'

/**
 * Esri World Imagery tiles. Esri serves these over HTTP/1.1, where the browser allows
 * only 6 connections per host; the same tiles are on two hostnames, so rotating between
 * them doubles throughput. Cesium picks `subdomains[(x + y + level) % n]`, which
 * prefetch.ts mirrors so prefetched URLs hit the browser cache (Esri sends max-age=86400).
 */
export const ESRI_TILE_TEMPLATE = 'https://{s}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const ESRI_SUBDOMAINS = ['services', 'server'] as const
const ESRI_MAX_LEVEL = 19

/** NASA GIBS VIIRS Black Marble (keyless WMTS, web-mercator, max level 8). */
const GIBS_BLACK_MARBLE =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'

const ION_BING_AERIAL_ASSET = 2
const ION_BLACK_MARBLE_ASSET = 3812

interface ImageryLayers {
  baseLayer: ImageryLayer
  nightLayer: ImageryLayer
}

export interface ImageryResult {
  mode: ImageryMode
  /** City-lights layer, faded by camera height (see fadeNightLights). Absent for Google 3D. */
  nightLayer: ImageryLayer | null
  /** Daytime imagery layer; its night-side alpha is set per sensor mode. Absent for Google 3D. */
  baseLayer: ImageryLayer | null
  /** Why higher-priority sources were skipped, for the console. Never contains key material. */
  skipped: string[]
}

function readEnv(value: string | undefined): string {
  return (value ?? '').trim()
}

/**
 * Night-side city lights: hidden on the day side, full strength at night. Black Marble tiles
 * are opaque, so their dark land would cover the base imagery on the whole night side (the
 * "crescent" look); colorToAlpha drops the near-black so only the lights composite over the
 * land. Brightness is set per sensor mode (applyNightProfile).
 */
function addNightLights(Cesium: CesiumModule, viewer: Viewer, layer: ImageryLayer): ImageryLayer {
  layer.dayAlpha = 0
  layer.nightAlpha = 1
  layer.colorToAlpha = Cesium.Color.BLACK
  layer.colorToAlphaThreshold = 0.09
  // Cesium's day/night shading still dims the night side (~0.3×), so lights need real gain.
  layer.brightness = NIGHT_PROFILES.natural.lightsBrightness
  layer.contrast = 1.4
  layer.gamma = 0.85
  viewer.imageryLayers.add(layer)
  return layer
}

/**
 * City lights are an orbital effect. Close in, Cesium fades globe lighting out, so the
 * day/night split stops applying and a magnified Black Marble tile (max level 8) would
 * wash the whole view out. Fade the layer from 0 at 800 km to full at 2,500 km.
 */
const NIGHT_FADE_START = 800_000
const NIGHT_FADE_END = 2_500_000

export function fadeNightLights(layer: ImageryLayer, cameraHeight: number): void {
  const t = Math.min(1, Math.max(0, (cameraHeight - NIGHT_FADE_START) / (NIGHT_FADE_END - NIGHT_FADE_START)))
  const eased = t * t * (3 - 2 * t)
  // Keep alpha strictly inside (0, 1) and never toggle `show`: Cesium compiles a different
  // globe shader variant when a layer's alpha reaches exactly 1 or the layer count changes,
  // and on Metal that compile stalled frames by 100-180 ms mid-flight. 0.001 is invisible.
  layer.alpha = 0.001 + eased * 0.998
}

/**
 * The base layer stays untouched so the RAW sensor mode shows true imagery; the HUD look
 * comes from the AEGIS post-process grade instead (lib/globe/sensors). Only the night side
 * is set: a faint trace of the day imagery under the city lights.
 */
function styleBaseLayer(layer: ImageryLayer): void {
  layer.nightAlpha = NIGHT_PROFILES.natural.baseNightAlpha
}

/**
 * How the night side renders, per sensor mode:
 *  - natural: Cesium's lighting as-is (RAW).
 *  - lifted:  base imagery stays visible at night and city lights are boosted, so the night
 *             side reads as dark land instead of a void (AEGIS, CRT, NOIR).
 *  - flat:    no day/night falloff at all; the full disc is lit while city lights still
 *             appear on the night side (NVG, FLIR).
 * Values stay strictly off 1.0: a layer value of exactly 1 drops a Cesium shader define and
 * forces a globe shader recompile on mode switch.
 */
export type NightProfile = 'natural' | 'lifted' | 'flat'
export const NIGHT_PROFILES: Record<NightProfile, { baseNightAlpha: number; lightsBrightness: number; flatten: boolean }> = {
  natural: { baseNightAlpha: 0.12, lightsBrightness: 3.6, flatten: false },
  lifted: { baseNightAlpha: 0.75, lightsBrightness: 7, flatten: false },
  flat: { baseNightAlpha: 0.999, lightsBrightness: 4.5, flatten: true },
}

export function applyNightProfile(
  imagery: Pick<ImageryResult, 'baseLayer' | 'nightLayer'>,
  profile: NightProfile,
): void {
  const p = NIGHT_PROFILES[profile]
  if (imagery.baseLayer) imagery.baseLayer.nightAlpha = p.baseNightAlpha
  if (imagery.nightLayer) imagery.nightLayer.brightness = p.lightsBrightness
}

async function useIon(Cesium: CesiumModule, viewer: Viewer, token: string): Promise<ImageryLayers> {
  Cesium.Ion.defaultAccessToken = token
  // Awaiting the providers surfaces a bad token here, so the chain can fall through.
  const [base, night, terrain] = await Promise.all([
    Cesium.IonImageryProvider.fromAssetId(ION_BING_AERIAL_ASSET),
    Cesium.IonImageryProvider.fromAssetId(ION_BLACK_MARBLE_ASSET),
    Cesium.createWorldTerrainAsync(),
  ])
  const baseLayer = new Cesium.ImageryLayer(base)
  styleBaseLayer(baseLayer)
  viewer.imageryLayers.add(baseLayer)
  viewer.terrainProvider = terrain
  return { baseLayer, nightLayer: addNightLights(Cesium, viewer, new Cesium.ImageryLayer(night)) }
}

async function useGoogle3d(Cesium: CesiumModule, viewer: Viewer, key: string): Promise<void> {
  const tileset = await Cesium.createGooglePhotorealistic3DTileset({ key })
  // The photorealistic mesh covers the whole planet; the ellipsoid underneath would z-fight it.
  viewer.scene.globe.show = false
  viewer.scene.primitives.add(tileset)
}

function useEsri(Cesium: CesiumModule, viewer: Viewer): ImageryLayers {
  const base: ImageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: ESRI_TILE_TEMPLATE,
    subdomains: [...ESRI_SUBDOMAINS],
    maximumLevel: ESRI_MAX_LEVEL,
    credit: new Cesium.Credit('Powered by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
  })
  const baseLayer = new Cesium.ImageryLayer(base)
  styleBaseLayer(baseLayer)
  viewer.imageryLayers.add(baseLayer)

  const night = new Cesium.UrlTemplateImageryProvider({
    url: GIBS_BLACK_MARBLE,
    maximumLevel: 8,
    credit: new Cesium.Credit('NASA GIBS · VIIRS Black Marble'),
  })
  return { baseLayer, nightLayer: addNightLights(Cesium, viewer, new Cesium.ImageryLayer(night)) }
}

/**
 * Imagery fallback chain: Cesium ion → Google Photorealistic 3D Tiles → Esri (keyless).
 * A missing key skips a source; a failing one (bad token, 401/403, network) falls through too.
 */
export async function setupImagery(Cesium: CesiumModule, viewer: Viewer): Promise<ImageryResult> {
  const skipped: string[] = []
  const ionToken = readEnv(process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN)
  const googleKey = readEnv(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY)

  if (ionToken) {
    try {
      const layers = await useIon(Cesium, viewer, ionToken)
      return { mode: 'ion', ...layers, skipped }
    } catch (error) {
      viewer.imageryLayers.removeAll()
      skipped.push(`ion: ${describeError(error)}`)
    }
  } else {
    skipped.push('ion: no NEXT_PUBLIC_CESIUM_ION_TOKEN')
  }

  if (googleKey) {
    try {
      await useGoogle3d(Cesium, viewer, googleKey)
      return { mode: 'google3d', nightLayer: null, baseLayer: null, skipped }
    } catch (error) {
      viewer.scene.globe.show = true
      skipped.push(`google3d: ${describeError(error)}`)
    }
  } else {
    skipped.push('google3d: no NEXT_PUBLIC_GOOGLE_MAPS_KEY')
  }

  const layers = useEsri(Cesium, viewer)
  return { mode: 'esri', ...layers, skipped }
}

/** Error text without URLs, which for keyed sources can carry the key in a query string. */
function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/https?:\/\/\S+/g, '<url>').slice(0, 160)
}
