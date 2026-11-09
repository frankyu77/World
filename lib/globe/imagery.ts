import type { ImageryLayer, ImageryProvider, Viewer } from 'cesium'
import type { CesiumModule } from './cesium-env'
import type { ImageryMode } from './types'

const ESRI_WORLD_IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'

/** NASA GIBS VIIRS Black Marble (keyless WMTS, web-mercator, max level 8). */
const GIBS_BLACK_MARBLE =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'

const ION_BING_AERIAL_ASSET = 2
const ION_BLACK_MARBLE_ASSET = 3812

export interface ImageryResult {
  mode: ImageryMode
  /** City-lights layer, faded by camera height (see fadeNightLights). Absent for Google 3D. */
  nightLayer: ImageryLayer | null
  /** Why higher-priority sources were skipped, for the console. Never contains key material. */
  skipped: string[]
}

function readEnv(value: string | undefined): string {
  return (value ?? '').trim()
}

/** Night-side city lights: hidden on the day side, full strength at night. */
function addNightLights(viewer: Viewer, layer: ImageryLayer): ImageryLayer {
  layer.dayAlpha = 0
  layer.nightAlpha = 1
  // Cesium's day/night shading still dims the night side (~0.3×), so lights need real gain.
  layer.brightness = 3.6
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

/** Darken and cool the daytime base so the HUD stays the focal point. */
function styleBaseLayer(layer: ImageryLayer): void {
  layer.brightness = 0.78
  layer.contrast = 1.12
  layer.saturation = 0.7
  layer.gamma = 1.05
  layer.nightAlpha = 0.12
}

async function useIon(Cesium: CesiumModule, viewer: Viewer, token: string): Promise<ImageryLayer> {
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
  return addNightLights(viewer, new Cesium.ImageryLayer(night))
}

async function useGoogle3d(Cesium: CesiumModule, viewer: Viewer, key: string): Promise<void> {
  const tileset = await Cesium.createGooglePhotorealistic3DTileset({ key })
  // The photorealistic mesh covers the whole planet; the ellipsoid underneath would z-fight it.
  viewer.scene.globe.show = false
  viewer.scene.primitives.add(tileset)
}

async function useEsri(Cesium: CesiumModule, viewer: Viewer): Promise<ImageryLayer> {
  const base: ImageryProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI_WORLD_IMAGERY, {
    enablePickFeatures: false,
  })
  const baseLayer = new Cesium.ImageryLayer(base)
  styleBaseLayer(baseLayer)
  viewer.imageryLayers.add(baseLayer)

  const night = new Cesium.UrlTemplateImageryProvider({
    url: GIBS_BLACK_MARBLE,
    maximumLevel: 8,
    credit: new Cesium.Credit('NASA GIBS · VIIRS Black Marble'),
  })
  return addNightLights(viewer, new Cesium.ImageryLayer(night))
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
      const nightLayer = await useIon(Cesium, viewer, ionToken)
      return { mode: 'ion', nightLayer, skipped }
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
      return { mode: 'google3d', nightLayer: null, skipped }
    } catch (error) {
      viewer.scene.globe.show = true
      skipped.push(`google3d: ${describeError(error)}`)
    }
  } else {
    skipped.push('google3d: no NEXT_PUBLIC_GOOGLE_MAPS_KEY')
  }

  const nightLayer = await useEsri(Cesium, viewer)
  return { mode: 'esri', nightLayer, skipped }
}

/** Error text without URLs, which for keyed sources can carry the key in a query string. */
function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/https?:\/\/\S+/g, '<url>').slice(0, 160)
}
