import type { CreditEntry, ImageryMode } from './types'

/**
 * Attribution for every source the app is currently showing. The HUD credits
 * line renders this list; Cesium's own credit container (which carries the
 * logos some providers require) stays mounted beside it.
 */
const IMAGERY_CREDITS: Record<ImageryMode, CreditEntry[]> = {
  esri: [
    { id: 'esri', label: 'Esri, Maxar, Earthstar Geographics', href: 'https://www.esri.com' },
    { id: 'gibs', label: 'NASA GIBS / Black Marble', href: 'https://earthdata.nasa.gov/gibs' },
  ],
  ion: [
    { id: 'ion', label: 'Cesium ion', href: 'https://cesium.com/ion' },
    { id: 'bing', label: 'Microsoft Bing', href: 'https://www.microsoft.com/maps' },
    { id: 'blackmarble', label: 'NASA Black Marble', href: 'https://earthobservatory.nasa.gov/features/NightLights' },
  ],
  google3d: [{ id: 'google', label: 'Google', href: 'https://www.google.com/maps' }],
}

/** Always-on sources behind search, city intel and weather markers. */
const BASE_CREDITS: CreditEntry[] = [
  { id: 'osm', label: '© OpenStreetMap contributors (ODbL)', href: 'https://www.openstreetmap.org/copyright' },
  { id: 'open-meteo', label: 'Open-Meteo (CC BY 4.0)', href: 'https://open-meteo.com' },
]

/**
 * Feed credits, keyed by what is actually showing: flights credit the source that served the
 * current view (adsb.lol for regional views, OpenSky for wide ones), not both.
 */
export type CreditKey = 'flights:adsb.lol' | 'flights:opensky' | 'satellites' | 'earthquakes' | 'fires'

export const LAYER_CREDITS: Record<CreditKey, CreditEntry[]> = {
  'flights:adsb.lol': [{ id: 'adsb-lol', label: 'adsb.lol (ODbL)', href: 'https://adsb.lol' }],
  'flights:opensky': [{ id: 'opensky', label: 'The OpenSky Network', href: 'https://opensky-network.org' }],
  satellites: [{ id: 'celestrak', label: 'CelesTrak', href: 'https://celestrak.org' }],
  earthquakes: [{ id: 'usgs', label: 'USGS', href: 'https://earthquake.usgs.gov' }],
  fires: [{ id: 'firms', label: 'NASA FIRMS', href: 'https://firms.modaps.eosdis.nasa.gov' }],
}

export function buildCredits(imagery: ImageryMode | null, activeLayers: readonly CreditKey[]): CreditEntry[] {
  const list: CreditEntry[] = []
  if (imagery) list.push(...IMAGERY_CREDITS[imagery])
  list.push(...BASE_CREDITS)
  for (const layer of activeLayers) list.push(...LAYER_CREDITS[layer])
  return list
}
