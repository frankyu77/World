// Copies Cesium's prebuilt browser build (Cesium.js) and its runtime static
// files (web workers, imagery/skybox assets, third-party wasm, widget CSS) into
// public/cesium so Next serves them at /cesium/*. Cesium is loaded from there
// rather than bundled; see lib/globe/cesium-env.ts for why.
// Runs from the dev/build scripts; pnpm doesn't run pre* scripts by default.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const cesiumPkg = require.resolve('cesium/package.json', { paths: [root] })
const { version } = JSON.parse(readFileSync(cesiumPkg, 'utf8'))
const src = join(dirname(cesiumPkg), 'Build', 'Cesium')
const dest = join(root, 'public', 'cesium')
const stamp = join(dest, '.version')

if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) {
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const dir of ['Workers', 'Assets', 'ThirdParty', 'Widgets']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true })
}
cpSync(join(src, 'Cesium.js'), join(dest, 'Cesium.js'))
writeFileSync(stamp, version)
console.log(`[cesium] copied static assets for cesium ${version} -> public/cesium`)
