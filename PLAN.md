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

## 9b. Step 2: what changed from this plan

- **Six modes, not five:** `1 AEGIS`, `2 NVG`, `3 FLIR`, `4 CRT`, `5 NOIR`, `6 RAW`.
  - AEGIS is the default command grade: subtle darken, slight desaturation, cool cyan balance, a faint teal lift in
    the blacks so space matches the HUD background, and a light vignette.
  - RAW runs no stage and shows the imagery untouched. To make that true, the base imagery layer lost its
    brightness/contrast/saturation styling; that look now lives in AEGIS.
- **Shader warm-up.** Every stage is created once and kept disabled. All stages are compiled behind the boot
  overlay, right after the globe height sweep. First-time mode switches measured a worst frame of ≤ 19 ms.
- **Tuning.** NVG intensifier gain was lowered with an S-curve added (gain 3.2 blew sunlit cities out to flat
  green). FLIR's temperature range was widened, so ordinary ground reads cool and only bright surfaces read hot.
- **Shared code.** `time` is a uniform *function* Cesium evaluates per frame, so no `preRender` hook is needed.
  Shaders use `czm_viewport` for pixel size.
- **Selector placement.** It sits in the right column under INTELLIGENCE and slides out with it while the city
  panel is open.
- **Mode handling.** The mode persists in `localStorage` (read after mount, try/catch). Keys are ignored while
  typing, with modifiers held, and on key repeat.
- **Known residual: a 40–57 ms frame around 125 km in city flights.** Cesium compiles about 12 globe-surface
  shader variants there, keyed to how many imagery textures each tile carries. That depends on which tiles have
  loaded, which the boot sweep can't reproduce. It is the same in RAW and AEGIS (interleaved A/B, 12 flights), so
  the post pass isn't the cause.

## 9c. Night hemisphere fix (after Step 2 review)

- **Why the globe shrank to a crescent at night:**
  - Cesium dims the night side to 0.3×.
  - The base imagery fades to 12% at night.
  - The opaque Black Marble layer covered the whole night side with near-black.
- **Night lights:** Black Marble now uses `colorToAlpha` (near-black → transparent), so only the lights composite
  over the land.
- **Per-mode night profiles** (`NIGHT_PROFILES` in imagery.ts):
  - **lifted** (AEGIS, CRT, NOIR): base imagery stays visible at night and city lights are boosted. The
    post-process adds a globe-only dark-blue lift.
  - **flat** (NVG, FLIR): globe lighting fade and night-atmosphere fade are pushed past any camera distance.
    That's uniforms only, so the full disc is lit while the night blend still places city lights. NVG gets a
    wide bloom ring for point lights.
  - **natural** (RAW): unchanged.
  - Layer values never hit exactly 1.0 and `enableLighting` is never toggled, so switching modes compiles nothing.
- **Silhouette rim:** a depth-based rim (globe vs cleared depth) gives a faint cyan halo in AEGIS and
  palette-matched halos in CRT/NOIR, whichever side the sun is on.
- **Dotted limb:** caused by Cesium's sky-atmosphere shell. Skirts, tessellation, MSAA 4 and per-fragment
  atmosphere all kept the dots; hiding the shell removed them. The shell now fades out between 800 and 1,500 km
  and is hidden above that, so the horizon sky remains near the ground.

## 9d. Step 3: what changed from this plan

- **satellite.js 6.0.2, not 7.1.0.** 7.x lazily imports a pthreads WebAssembly build whose
  self-spawning worker made Turbopack's production build hang (bisected: stubbing the worker
  built in 1.6 s; the worker without satellite.js built; with it, it hung). The plain-JS
  propagator is all this app uses; 6.0.2 has the same API.
- **ALL ACTIVE is about 16k satellites, not 10k.** CelesTrak's `active` group is now 15,883.
  The worker propagates all of them in about 10 ms per 0.5 s sample, and the page holds 60 fps.
- **CelesTrak disk cache.** CelesTrak 403s repeat downloads of a group within about 2 h per
  IP, and dev/prod/restarted processes each had their own memory cache. Groups are now
  persisted to `.next/cache/aegis/`, shared across processes, and served stale during a cooldown.
- **Fetch area with hysteresis.** The idle-rotating globe changed the bbox every 1.5 s and
  refetched flights each time (128 requests in about 70 s). Requests now cover a padded,
  grid-snapped area and refetch only when the view leaves it (15 requests in 83 s). Regional
  views pad only as far as stays within `REGIONAL_RADIUS_KM`, shared with the route, so they
  keep the fresh adsb.lol source.
- **Gzip in the route helper.** `next start` did not compress route-handler responses: the
  global flights feed dropped from 690 KB to 280 KB.
- **HUD.** INTELLIGENCE gets a DATA AGE row (amber > 60 s, red > 5 min, plus the source).
  Counts of 10k and over use compact form (16.2K). The right-column panels widen 176 → 196 px
  to match LAYERS.
- **Known residual.** City flights still occasionally stall at the ~125 km Cesium
  globe-shader compile band. The size of the stall varies a lot (40-580 ms observed; most
  flights ≤ 57 ms). Flight ingest costs 14 ms per 30 s global poll and 39 ms on the cold load.

## 9e. Step 4: what changed from this plan

- **Camera lock.** `lookAtTransform(frame)` *without* an offset keeps the camera's world position
  (it only re-expresses it in the new frame), so the camera stayed put while the target flew off:
  the reticle drifted ~390 px in 10 s. Now the tracker anchors once after the lock flight, then
  each frame carries the camera's local offset into the target's new frame
  (`lookAtTransform(newFrame, offset)`). The target stays centred (0 px measured after 10 s and
  after an orbit drag) and the user can still orbit and zoom around it.
- **Per-frame aircraft position.** Billboards update in quarter-fleet slices (15 Hz each), which
  would make a locked camera judder; tracking uses an exact per-frame dead-reckoned position
  (`FlightsLayer.positionAt`).
- **Tracked aircraft keep fresh data.** Orbiting or zooming out to a wide view switched the
  flights feed to the older OpenSky snapshot, which jumped the tracked position and kinked the
  trail. While an aircraft is locked, the flights feed follows the target (a regional box around
  it, so adsb.lol at 10 s) instead of the view. Measured: still ADSB.LOL, 5 s old, after zooming
  out to 27,000 km.
- **Trails.** Aircraft trails start at lock-on (the keyless feeds give no past track) and keep
  3 min at 2 Hz. Satellites show the past 10 min of orbit (solid, fading) and the next 10 min
  (dashed), from SGP4 on the main thread for that one satellite only.
- **Co-located satellites.** A plain pick on the ISS returned Progress MS-34, a docked vehicle
  drawn on top. The click now drill-picks and prefers the lowest NORAD id (the parent station).
- **Quakes and fires.** Inspect only: a card, with no camera lock or reticle.

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
