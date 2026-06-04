import type { StyleSpecification } from 'maplibre-gl'

// Jarvis-themed dark map style for MapLibre GL
// Uses OpenStreetMap tiles with custom dark styling
export const jarvisMapStyle: StyleSpecification = {
  version: 8,
  name: 'Jarvis Dark',
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles-layer',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 22,
      paint: {
        'raster-saturation': -0.8,
        'raster-brightness-min': 0.05,
        'raster-brightness-max': 0.4,
        'raster-contrast': 0.3,
        'raster-hue-rotate': 180,
      },
    },
  ],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
}

// Vector tile style for more detailed Jarvis look (when zoomed in)
export const jarvisVectorStyle: StyleSpecification = {
  version: 8,
  name: 'Jarvis Vector',
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=get_your_own_key',
    },
  },
  sprite: 'https://openmaptiles.github.io/osm-bright-gl-style/sprite',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#0a0a0f',
      },
    },
  ],
}

// Color palette for the Jarvis theme
export const jarvisColors = {
  primary: '#00d4ff',
  secondary: '#0a84ff',
  warning: '#ff9500',
  danger: '#ff3b30',
  success: '#30d158',
  background: '#0a0a0f',
  panel: 'rgba(0, 20, 40, 0.85)',
  border: 'rgba(0, 212, 255, 0.3)',
  glow: 'rgba(0, 212, 255, 0.5)',
  text: '#e0f7ff',
  textMuted: 'rgba(224, 247, 255, 0.6)',
}

// Traffic colors
export const trafficColors = {
  free: '#30d158',      // Green - free flow
  moderate: '#ff9500',  // Yellow/amber - moderate
  heavy: '#ff3b30',     // Red - heavy traffic
  blocked: '#8b0000',   // Dark red - road blocked
}

// Zoom level thresholds for data fetching
export const zoomThresholds = {
  noFetch: 5,           // Below this: no data fetching
  majorCities: 8,       // 5-8: major cities only
  allCities: 12,        // 8-12: all visible cities
  streetLevel: 14,      // Above 12: full detail with POIs
}
