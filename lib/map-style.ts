import type { StyleSpecification } from 'maplibre-gl'

// AEGIS holographic tactical map style for MapLibre GL.
// Uses CARTO dark raster tiles, recolored toward a deep cyan command-display
// look: near-black landmass, high-contrast glowing coastlines/borders.
export const jarvisMapStyle: StyleSpecification = {
  version: 8,
  name: 'AEGIS Tactical',
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
    // Deep space base so gaps read black, not gray.
    {
      id: 'aegis-bg',
      type: 'background',
      paint: { 'background-color': '#00060e' },
    },
    {
      id: 'osm-tiles-layer',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 22,
      paint: {
        // GIS-first: oceans stay deep while land, coastlines, boundaries and
        // roads are pushed forward as the visual focus. Higher contrast makes
        // the bright line features (borders / roads / labels) read crisply; a
        // restrained hue-rotate gives a cool steel-cyan cast while keeping
        // labels legible.
        'raster-saturation': -0.1,
        'raster-brightness-min': 0.03,
        'raster-brightness-max': 1,
        'raster-contrast': 0.28,
        'raster-hue-rotate': 150,
        'raster-opacity': 1,
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

// Color palette for the AEGIS holographic theme
export const jarvisColors = {
  primary: '#2ff5ff',
  secondary: '#2b9bff',
  warning: '#ffb020',
  danger: '#ff4d5e',
  success: '#34f5a0',
  background: '#00060e',
  panel: 'rgba(0, 15, 30, 0.4)',
  border: 'rgba(47, 245, 255, 0.25)',
  glow: 'rgba(47, 245, 255, 0.55)',
  text: '#d6fbff',
  textMuted: 'rgba(150, 220, 235, 0.65)',
}

// Traffic colors
export const trafficColors = {
  free: '#34f5a0',      // Green - free flow
  moderate: '#ffb020',  // Amber - moderate
  heavy: '#ff4d5e',     // Red - heavy traffic
  blocked: '#8b0000',   // Dark red - road blocked
}

// Zoom level thresholds for data fetching
export const zoomThresholds = {
  noFetch: 5,           // Below this: no data fetching
  majorCities: 8,       // 5-8: major cities only
  allCities: 12,        // 8-12: all visible cities
  streetLevel: 14,      // Above 12: full detail with POIs
}
