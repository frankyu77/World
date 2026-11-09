/**
 * Cesium is served, not bundled. scripts/copy-cesium-assets.mjs copies Cesium's prebuilt,
 * already-minified browser build (Build/Cesium/Cesium.js) plus its Workers/Assets/ThirdParty/
 * Widgets to public/cesium, and this module loads it with a <script> tag.
 *
 * Why not `import('cesium')`: Turbopack's production minifier rewrites a WebAssembly
 * binary that Cesium inlines as a string into a template literal containing `\0<digit>`,
 * an illegal octal escape, so the production chunk fails to parse and the globe never
 * loads (dev builds aren't minified, so it only shows in production). The prebuilt file
 * is Cesium's own release artifact and parses cleanly; serving it also keeps a ~5 MB
 * library out of every Turbopack compile. Types still come from the `cesium` package
 * via `import type`, so call sites are fully typed.
 */
declare global {
  interface Window {
    CESIUM_BASE_URL?: string
    Cesium?: CesiumModule
  }
}

export type CesiumModule = typeof import('cesium')

export const CESIUM_BASE_URL = '/cesium/'

let cesiumPromise: Promise<CesiumModule> | null = null

function loadStylesheet(href: string): void {
  if (document.querySelector(`link[data-cesium-css]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.cesiumCss = ''
  document.head.appendChild(link)
}

/** Loads Cesium once. CESIUM_BASE_URL must be set before the script evaluates. */
export function loadCesium(): Promise<CesiumModule> {
  if (cesiumPromise) return cesiumPromise
  window.CESIUM_BASE_URL = CESIUM_BASE_URL
  loadStylesheet(`${CESIUM_BASE_URL}Widgets/widgets.css`)
  cesiumPromise = new Promise<CesiumModule>((resolve, reject) => {
    if (window.Cesium) {
      resolve(window.Cesium)
      return
    }
    const script = document.createElement('script')
    script.src = `${CESIUM_BASE_URL}Cesium.js`
    script.async = true
    script.onload = () => {
      if (window.Cesium) resolve(window.Cesium)
      else reject(new Error('Cesium.js loaded but did not define window.Cesium'))
    }
    script.onerror = () => reject(new Error(`Failed to load ${script.src}`))
    document.head.appendChild(script)
  })
  // Allow a retry after a failed load (e.g. a transient network error).
  cesiumPromise.catch(() => {
    cesiumPromise = null
  })
  return cesiumPromise
}
