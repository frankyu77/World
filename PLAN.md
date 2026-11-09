# AEGIS Globe Rebuild — Plan

Branch: `globe-rebuild`. Each step ends with `pnpm build` passing, a screenshot check of
`localhost:3000`, and one commit.

**Order of work:**
1. Commit this plan.
2. Remove `ignoreBuildErrors` and fix existing type errors, as **their own commit before any Cesium work**.
3. Step 1.
4. **Stop for review** with screenshots and fps numbers before Step 2.

## 0. Reference project and its license

Reference: [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) (Vite + Vue 3 +
CesiumJS 1.124, with a Node proxy layer for its feeds).

**License: MIT, © 2026 Bilawal Sidhu.** The source code can be copied, modified and redistributed, including
commercially, as long as the copyright and permission notice travel with any substantial portion that is copied.
The grant covers **code only**. Its bundled datasets (TeleGeography cables CC BY-NC-SA, OSM extracts ODbL, the
Bhote Koshi imagery CC BY-NC), its 3D models, and all runtime feed data stay under their own terms. Google Maps and
OpenSky in particular restrict commercial use.

**How we use it:** as a design and architecture reference. The shaders and modules here are written fresh in
TypeScript for this app. If a specific snippet is ported closely (for example a color-ramp table), it gets a
comment pointing to the source, and a `THIRD_PARTY_NOTICES.md` entry carries the MIT notice. No data or model
files are taken.

### What the reference does that this plan adopts

| Area | Reference approach | Adopted here |
|---|---|---|
| Viewer | `Cesium.Viewer` with every widget off, `baseLayer: false`, custom credit container, `targetFrameRate = 60` | Same |
| Apple GPUs | `scene.fog.renderable = false` stops Cesium's model-atmosphere shader from failing to **link** on ANGLE/Metal, which otherwise kills the render loop (`src/app/atmosphereCompat.js`) | Same: this machine is an M5 |
| Imagery | Esri `ArcGisMapServerImageryProvider` keyless; ion/Bing with a token; Google 3D via key, ion or tokens | Fallback chain below |
| Sensor styles | One `PostProcessStage` per style, all created at start-up and **disabled**; switched with an `intensity` uniform; one `preRender` hook advances `time` on enabled stages only | Same. No shader compiles mid-session. |
| Flights | `BillboardCollection`; icons drawn a few seconds behind the newest fix and moved by dead reckoning between polls; trail body rebuilt about once a second, plus a cheap per-frame "head" segment | Same idea, simplified |
| Satellites | CelesTrak TLE → `twoline2satrec` in chunks → `PointPrimitiveCollection`; round-robin propagation slices each frame | SGP4 in a **Web Worker** instead (keeps the main thread free) |
| Proxies | Per-feed TTL cache, one refresh at a time, serve stale data on failure, honour `Retry-After` on 429/403 | Same, in Next route handlers |

## 1. Architecture

```
app/page.tsx
└─ components/jarvis-map.tsx        (kept as the orchestrator: state + HUD wiring; MapLibre removed)
   ├─ BootSequence                  (untouched)
   ├─ GlobeViewer  ← next/dynamic({ ssr: false })
   │    owns the Cesium Viewer; exposes a GlobeHandle via ref:
   │    flyToCity, resetView, setSensor, setLayerEnabled, track/untrack
   │    emits: onCameraSettled(bounds, zoom), onCounts({active, tracking}),
   │           onPick(target | null), onFrame (for screen anchors)
   ├─ ScreenAnchors                 DOM layer pinned to world positions; hidden when behind the globe
   │    ├─ WeatherMarker × N        (kept)
   │    ├─ HoloBeacon (selected)    (kept)
   │    └─ TargetReticle            (new: corner-bracket box around the tracked target)
   ├─ MapProjectionFX / AtmosphereFX (kept)
   ├─ HudOverlay                    (kept; real counts plus a slot for the sensor selector)
   ├─ SensorSelector                (new HoloPanel: NORMAL / NVG / FLIR / CRT / NOIR, keys 1–5)
   ├─ TargetCard                    (new HoloPanel: tracked-object metadata)
   ├─ SearchBar                     (kept)
   ├─ MapControls                   (kept look; toggle list becomes data-driven)
   └─ CityInfoPanel                 (kept)
```

Per-frame work never goes through React state:
- Screen anchors and the reticle write `style.transform` through refs from Cesium's `postRender`.
- HUD numbers (counts, target metadata) are throttled to 4 Hz before `setState`.

### Files

**Kept as-is:** `boot-sequence.tsx`, `city-info-panel.tsx`, `search-bar.tsx`, `holo/*`, `weather-marker.tsx`,
`holographic-overlays.tsx`, `lib/holo.ts`, `lib/utils.ts`, `components/ui/*`, `app/api/{city,geocode,weather}`,
`hooks/use-city-data.ts`.

**Kept, edited only to integrate:**
- `jarvis-map.tsx`: MapLibre `<Map>` → `<GlobeViewer>`. The `SelectedCity` export stays put, so search-bar,
  city-info-panel and use-city-data are untouched. The simulated `useTrafficData` is **deleted**: random
  segments mean nothing on a globe.
- `hud-overlay.tsx`: props become `counts={{ active, tracking }}`; the fake `nodeCount * 0.4` goes away.
  Same visuals.
- `map-controls.tsx`: same `ControlButton` look. Toggles become Flights / Satellites / Quakes / Fires / Weather.
  - Fires is disabled with a `NO KEY` tag when `FIRMS_MAP_KEY` is not set.
  - Satellites has a sub-toggle, `CURATED` / `ALL ACTIVE`, that defaults to CURATED.
- `hooks/use-viewport-data.ts`: takes bounds from Cesium's `computeViewRectangle()`, handles views that cross
  the antimeridian (`west > east`), and imports `zoomThresholds` from its new home.
- `next.config.mjs`: **remove `typescript.ignoreBuildErrors: true`**. Today `pnpm build` skips type-checking,
  so "build passes" means nothing until this is off. This lands, along with fixes for any existing type errors,
  as a separate commit before the Cesium work.
- `hud-overlay.tsx`: also gains a **DATA AGE** readout for flights (age of the newest snapshot, turning amber
  past 60 s and red past 5 min), so a stale OpenSky snapshot is visible.

**Deleted:** `lib/map-style.ts` (`zoomThresholds` moves to `lib/globe/camera.ts`).

**New:**
```
components/globe/
  globe-viewer.tsx        client-only Cesium host (default export, for next/dynamic)
  screen-anchors.tsx
  target-reticle.tsx
  target-card.tsx
  sensor-selector.tsx
lib/globe/
  types.ts                GlobeHandle, LayerId, SensorMode, TrackTarget, FeedResponse<T>
  cesium-env.ts           sets window.CESIUM_BASE_URL before the first `import('cesium')`
  scene.ts                atmosphere, lighting, starfield, Metal workaround, idle rotation
  imagery.ts              ion → Google 3D → Esri fallback chain
  camera.ts               flyToCity, height ↔ "zoom", view rectangle → bounds, zoomThresholds
  sensors/index.ts        stage registry + switching
  sensors/{nvg,flir,crt,noir}.ts   GLSL as template strings
  layers/{flights,satellites,earthquakes,fires}.ts   imperative layer classes (enable/disable/update/pick)
  tracking.ts             lock-on camera, fading trail, target metadata
  sgp4.worker.ts          satellite.js propagation off the main thread
lib/server/feed-cache.ts  TTL + single-flight + stale-on-error + Retry-After cooldown
app/api/feeds/{flights,satellites,earthquakes,fires}/route.ts
scripts/copy-cesium-assets.mjs
.env.local.example
```

## 2. Plain Cesium or resium

**Plain CesiumJS, with one thin React host component.** Resium's strength is declarative Entities. Almost
everything here is imperative and per-frame:
- `PointPrimitiveCollection` / `BillboardCollection` with thousands of mutating items
- `PostProcessStage` uniforms
- `preRender` / `postRender` hooks and camera transforms

Running those through React reconciliation would add overhead and fight the 60 fps budget. Resium would also be
one more dependency to keep in step with Cesium releases.

## 3. Dependencies

| Add | Version | Why |
|---|---|---|
| `cesium` | **1.146.0** (2026-10-01) | Globe. 1.147.0 is only a week old, so it's skipped for now. |
| `satellite.js` | **7.1.0** (2026-07-23) | SGP4/SDP4 propagation |

| Remove (Step 1, once unused) |
|---|
| `maplibre-gl`, `react-map-gl`, `@types/mapbox-gl` |

`cesium` pulls in `protobufjs`, which has a postinstall script. pnpm will stop on it the same way it did for
`sharp` and `msw`. Plan: add `protobufjs: false` to `allowBuilds` in `pnpm-workspace.yaml` (the script only
checks CLI peer versions; it isn't needed at runtime). I'll confirm at install time and say so if anything
else gets flagged.

## 4. Cesium inside Next.js 16

1. **Client only.** `jarvis-map.tsx` loads `GlobeViewer` with `next/dynamic(() => import('./globe/globe-viewer'),
   { ssr: false })`. Cesium touches `window` and WebGL at import time, so it must never be evaluated on the server.
2. **Static assets.** Cesium needs `Workers/`, `Assets/`, `ThirdParty/` and `Widgets/` served over HTTP.
   `scripts/copy-cesium-assets.mjs` copies `node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}`
   → `public/cesium/`. It runs from the `dev` and `build` scripts directly
   (`node scripts/copy-cesium-assets.mjs && next dev`), because pnpm does not run `pre*` scripts by default.
   `public/cesium/` goes into `.gitignore`.
3. **`CESIUM_BASE_URL`.** `cesium-env.ts` sets `window.CESIUM_BASE_URL = '/cesium/'`. `globe-viewer.tsx` then
   loads Cesium with `await import('cesium')` inside its mount effect, so the base URL is guaranteed to be set
   first. A static import could be hoisted above it.
4. **CSS.** `cesium/Build/Cesium/Widgets/widgets.css` is imported in `globe-viewer.tsx`. It is only needed for
   the credit container.
5. **Bundler.** Next 16 uses Turbopack by default. Cesium's ESM build and `new Worker(new URL(…, import.meta.url))`
   both work under Turbopack. If either doesn't, the fallback is `next dev --webpack` / `next build --webpack`,
   and I'll tell you if that happens.
6. **Resolution.** Keep Cesium's default `useBrowserRecommendedResolution: true`, which renders at CSS pixels
   rather than 2× Retina. On a 3024×1964 display this is the biggest single factor in holding 60 fps.

## 5. Step 1 — Globe foundation

**Imagery chain.** Each step is tried in order; a runtime failure (bad token, 401/403) also falls through to the
next.
1. **Cesium ion** (`NEXT_PUBLIC_CESIUM_ION_TOKEN`): Bing aerial (asset 2), Cesium World Terrain, and Black Marble
   night lights (asset 3812).
2. **Google Photorealistic 3D Tiles** (`NEXT_PUBLIC_GOOGLE_MAPS_KEY`): `createGooglePhotorealistic3DTileset`.
   The globe surface is hidden underneath. Google's attribution must stay visible.
3. **Keyless:** Esri World Imagery, plus NASA GIBS VIIRS Black Marble (keyless WMTS) for night lights.

`NEXT_PUBLIC_*` keys are visible in the browser by design. Restrict them by HTTP referrer in the Google and ion
dashboards.

**`.env.local.example`** lists every key with an empty value:
- `NEXT_PUBLIC_CESIUM_ION_TOKEN=`
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY=`
- `FIRMS_MAP_KEY=`
- `OPENSKY_CLIENT_ID=`
- `OPENSKY_CLIENT_SECRET=`

**Credits.** A single HUD credits line, styled like the holo labels, lists **every active source** and updates as
layers and imagery change:
- Imagery and globe: Esri (+ Maxar, Earthstar Geographics), NASA GIBS / Black Marble, Cesium ion / Bing (when
  active), Google (when active, with its logo as its terms require)
- Map data: OpenStreetMap contributors (ODbL), credited wherever OSM-derived data shows (geocoding/city lookups)
- Feeds: adsb.lol, The OpenSky Network, CelesTrak, USGS, NASA FIRMS

Cesium's own credit container stays mounted, styled to match, so its required credits are never hidden.

**Boot (decided).** The boot overlay stays opaque and unchanged. The globe mounts and starts rotating underneath
it, and is revealed as boot fades out.

**Scene.**
- `skyAtmosphere` darkened (brightness and saturation shifted down)
- `globe.enableLighting = true` with `dynamicAtmosphereLighting`
- Night-lights layer with `dayAlpha = 0`, `nightAlpha = 1`
- Default starfield skybox
- Metal fog workaround
- Idle auto-rotation: about 2°/s of longitude, which stops on the first user input and resumes after 30 s idle

**Boot sequence.** The globe mounts as the boot sequence starts, so it is loaded and already rotating when boot
fades out.

**Search → fly.** `camera.flyTo` runs about 3 s, with an ease-in-out curve and a high arc. It ends about 2.5 km
from the city, pitched −35° with heading −30°, matching today's look. CityInfoPanel opens in the flight's
`complete` callback instead of the current `setTimeout(2000)`.

**HUD zoom.** The HUD's "zoom ×" readout is derived from camera height (`zoom ≈ log2(40 075 km / height) + 1`),
so `zoomTier` and `zoomThresholds` keep working.

## 6. Step 2 — Sensor modes

There are five modes: NORMAL, NVG, FLIR, CRT and NOIR. NORMAL means every stage is disabled. The other four are
`PostProcessStage`s created once and kept disabled until selected:
- **NVG:** green phosphor (P43) ramp, scintillation noise from `time`, round tube vignette, light bloom
- **FLIR:** luminance → temperature mapping, white-hot by default, ironbow ramp optional, 9-tap blur (the
  reference uses 25 taps; cut for budget)
- **CRT:** barrel curvature, RGB chromatic offset, scanlines and shadow mask, slight flicker
- **NOIR:** desaturation, contrast curve, grain, vignette

The reference draws HUD text (digits, crosshairs) inside its shaders. These shaders don't; the HUD here is DOM.

**Controls.**
- Keys `1`–`5`, ignored while typing in an input.
- A `SensorSelector` HoloPanel styled like INTELLIGENCE, placed in the top-right column under it.
- The current mode is remembered in `localStorage` (wrapped in try/catch).

## 7. Step 3 — Live layers

All third-party calls go through `app/api/feeds/*`. The client never calls a provider directly.
`lib/server/feed-cache.ts` gives every feed:
- a TTL
- a single in-flight refresh at a time
- stale data served on upstream errors
- a cooldown that honours `Retry-After` on 429/403 (bounded 30 s – 30 min)
- `Cache-Control: s-maxage` headers
- a descriptive `User-Agent` (`AEGIS/0.1`)

The cache is in-memory per server process. That is right for `next dev` / `next start`; on serverless hosts each
instance would hold its own copy.

| Feed | Upstream | Server TTL | Client poll | Viewport handling | Render |
|---|---|---|---|---|---|
| Flights (regional) | adsb.lol `/v2/lat/{lat}/lon/{lon}/dist/{≤250}` | 10 s | 10 s | Used when the view fits in about 250 nm. Center snapped to a 0.5° grid so nearby views share a cache entry. | `BillboardCollection` (rotated by heading); dead reckoning between polls |
| Flights (wide) | OpenSky `/api/states/all` global snapshot | adaptive | 30 s | Server filters the cached global snapshot to the requested bbox: one upstream call serves every view | same |
| Satellites | CelesTrak `gp.php?GROUP=…&FORMAT=tle`. **Default: curated** groups `stations`, `gps-ops`, `weather`, `visual` (a few hundred, deduplicated by NORAD id). **ALL ACTIVE** (`GROUP=active`, about 10k) only when picked in the layer panel. | 6 h per group | once, then 6 h | The selected set is fetched once (it moves too fast to cull at fetch time). **Culled at render**: worker propagates at 2 Hz; anything behind the globe (EllipsoidalOccluder) gets `show = false` | `PointPrimitiveCollection`, coloured by group; main thread interpolates between worker samples |
| Earthquakes | USGS `summary/all_day.geojson` | 60 s | 60 s | Server filters to bbox | `PointPrimitiveCollection`, sized and coloured by magnitude |
| Fires | NASA FIRMS `area/csv/{KEY}/VIIRS_NOAA20_NRT/{bbox}/1` | 30 min | 5 min | bbox snapped to 5° so the 5k/10-min quota is never close | `PointPrimitiveCollection`. **Skipped with no key**: route returns `{disabled:true}`, toggle shows `NO KEY`. |

**OpenSky: authenticated path.**
- **Auth.** `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` from `.env.local` go through the OAuth2
  client-credentials flow, for 4000 credits/day.
- **Token handling.** The bearer token is cached server-side until shortly before it expires; concurrent callers
  share one refresh.
- **Budget.** A global snapshot costs 4 credits, so the budget allows about one refresh every 90 s. The adaptive
  TTL reads `X-Rate-Limit-Remaining` and stretches the interval if the budget runs low.
- **Without credentials,** it drops to the anonymous 400/day (about every 15 min).

The credentials are **server-only**:
- never sent to the client
- never logged, including in error messages: token-endpoint errors are reduced to a status code
- never committed (`.env*.local` is already gitignored)

The flights response carries `snapshotAt`, which feeds the HUD **DATA AGE** readout.

**Counts.**
- `Active Nodes` = live objects currently on screen, summed across the enabled layers (after culling).
- `Tracking` = moving tracks in view: aircraft + satellites.

## 8. Step 4 — Interaction

- **Pick.** `scene.pick` on click. Each primitive's `id` is `{ layer, key }`. Aircraft and satellites lock on;
  quakes and fires open a small card with no lock. Clicking empty space or pressing `Esc` releases.
- **Camera lock.** Each `preRender`, `camera.lookAtTransform(eastNorthUpToFixedFrame(targetPos), offset)`
  re-centres on the target while keeping the user's orbit offset, so they can still rotate and zoom around it.
  - Aircraft: about 8 km offset.
  - Satellites: about 1,500 km offset, looking down past the satellite at Earth.
- **Trail.** One `Primitive` with a per-vertex-coloured `PolylineGeometry` (alpha 0 at the tail to 1 at the
  head), rebuilt about once a second, plus a per-frame head segment.
  - Aircraft: the last about 120 fixes, seeded from the positions seen so far.
  - Satellites: the past 10 min of orbit from SGP4, plus a dim dashed 10 min ahead.
- **Card.** `TargetCard` HoloPanel, refreshed at 4 Hz.
  - Aircraft: callsign, ICAO24, altitude (ft/m), ground speed (kt), heading, squawk, data age.
  - Satellites: name, NORAD id, altitude, speed (km/s), inclination, period, apogee/perigee.
- **Reticle.** SVG corner brackets matching `EdgeBracket` that follow the target's screen position. The box size
  comes from the projected bounding sphere, clamped to 36–120 px. A small lock tag shows the range.

## 9. Performance: target and how it's measured

Target: **60 fps sustained on this M5 MacBook with every layer on.**

**Budget (expected scale).**
- A few hundred satellites by default (curated); about 10k with ALL ACTIVE, which is also profiled.
- Up to about 10k aircraft billboards in the wide view (only a few hundred within 250 nm).
- Hundreds of quakes; up to a few thousand fires.
- One post-process stage at a time.
- SGP4 runs entirely in the worker. The main thread only does lerps and sets `show`.

**Measurement.** A throwaway puppeteer-core script, kept in the session scratchpad and not added to the repo,
drives the installed Google Chrome with the real GPU (`--use-angle=metal`, not headless SwiftShader). It records
`requestAnimationFrame` intervals for 10 s per scenario and reports mean fps and p95/p99 frame time:
1. Global view, all layers on, NORMAL
2. Same, cycling through each sensor mode
3. Regional view (about 300 km) with an aircraft tracked
4. Satellite tracked from orbit

The same script takes the per-step screenshots of `localhost:3000`, which I open and inspect before committing.
The numbers go into each step's commit message and summary.

## 9a. Step 1: what changed from this plan

- **Cesium is served, not bundled** (replaces §4.3 and §4.5). Turbopack's production minifier turns a WebAssembly
  binary that Cesium inlines as a string into a template literal with an illegal octal escape (`\0` + digit). The
  production chunk failed to parse and the globe never loaded; dev wasn't affected because it isn't minified.
  - The fix loads Cesium's own prebuilt `Build/Cesium/Cesium.js` (plus `widgets.css`) from `/cesium/` with a
    `<script>` tag. The copy script now copies it alongside the other static assets.
  - Code still gets full types through `import type`.
  - Side benefits: production app JS fell to about 0.9 MB, and builds compile in about 1 s.
- **Cesium sub-packages pinned.** `cesium@1.146.0` declares `^` ranges, so `@cesium/engine` floated to the 1.147
  build, which drops exports 1.146 still re-exports. `pnpm-workspace.yaml` pins `@cesium/engine` 26.4.0 and
  `@cesium/widgets` 16.3.0, the set released with 1.146.0. `protobufjs` did not need a build approval.
- **`@types/mapbox-gl` was removed in the type-check commit,** not Step 1. It was the only type error and is unused.
- **Night lights fade with camera height** (fully gone below 800 km). Close in, Cesium fades globe lighting out,
  and a magnified Black Marble tile washed the city view out to white.
- **Procedural starfield** replaces Cesium's default Tycho skybox, which read as static noise behind the HUD.
- **Start view straddles the terminator:** about 70° east of the subsolar point, so the reveal always shows day
  and night.
- **Shader warm-up behind the boot overlay.** Cesium compiles globe shader variants as the camera crosses height
  bands. On Metal that stalled city flights by 100–380 ms around 125 km. While boot covers the globe, the camera
  sweeps 9,000 km → 9 km, one step per frame, then restores the view. Worst flight frame is now about 45 ms
  (Tokyo); the other cities show none.
- **Settled-view events.** `moveEnd` doesn't fire while idle rotation runs and proved unreliable after scripted
  flights. Bounds now also refresh on a 1.5 s throttle while moving and a 250 ms trailing debounce. Home and level
  flights pause rotation like city flights.
- **`?perf` probe.** The viewer exposes frame timestamps and per-frame CPU time on `window.__aegisPerf`; always
  in dev, and in production only with `?perf` in the URL.

## 10. Risks and open questions

1. **Boot sequence (decided).** It stays opaque; the globe rotates underneath and is revealed on fade.
2. **Esri World Imagery terms.** Fine for development and non-commercial use with attribution. Production or
   commercial use may need an ArcGIS account.
3. **Google 3D Tiles and lighting.** With Google tiles active, the night-lights layer and globe lighting don't
   apply (the globe surface is hidden). Sensor modes still work.
4. **Turbopack + Cesium.** See §4.5. The fallback is `--webpack`.
5. **Existing type errors.** Turning off `ignoreBuildErrors` may surface errors in existing files. They get
   fixed in their own commit, with minimal type-only changes, before any Cesium work.
6. **`pnpm-workspace.yaml`.** The `allowBuilds` fix from earlier is uncommitted. It goes in with the plan
   commit.
