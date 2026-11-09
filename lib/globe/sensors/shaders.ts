import type { SensorMode } from './modes'

/**
 * Post-process fragment shaders for the sensor modes. Each is a single full-screen pass
 * over Cesium's rendered scene (`colorTexture`), written for this app. Shared notes:
 *  - `czm_viewport.zw` is the viewport size in pixels (Cesium built-in).
 *  - `time` (seconds) drives animated noise; it is a uniform function on the stage.
 *  - Tap counts are kept small (≤ 9 texture reads) to hold the 60 fps budget.
 * The modes are original; the general techniques (P43 phosphor ramp, ironbow thermal ramp,
 * barrel distortion, aperture-grille mask) are standard imaging/CRT emulation.
 */

const COMMON = /* glsl */ `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Hash for per-pixel noise (no texture lookups).
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Aspect-corrected distance from screen center (1.0 ≈ half the screen height).
float centerDistance(vec2 uv) {
  vec2 d = (uv - 0.5) * 2.0;
  d.x *= czm_viewport.z / czm_viewport.w;
  return length(d);
}
`

/**
 * Depth helpers. Space and the skybox keep the cleared depth (1.0); anything on the globe is
 * nearer. That separates "globe" from "space" without any extra pass, so the night lift only
 * touches land/ocean and the silhouette rim works whatever side the sun is on.
 */
const DEPTH = /* glsl */ `
uniform sampler2D depthTexture;
float isGlobe(vec2 uv) { return step(czm_readDepth(depthTexture, uv), 0.99999); }

// Fraction of globe pixels on two rings (4 px, 10 px) around a space pixel: a soft halo just
// outside the silhouette. 16 depth taps; zero on the globe itself.
float silhouetteRim(vec2 uv) {
  if (isGlobe(uv) > 0.5) return 0.0;
  vec2 px = 1.0 / czm_viewport.zw;
  float near = 0.0;
  float far = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.78539816;
    vec2 d = vec2(cos(a), sin(a));
    near += isGlobe(uv + d * px * 4.0);
    far += isGlobe(uv + d * px * 10.0);
  }
  return near / 8.0 * 0.65 + far / 8.0 * 0.35;
}

// Night-side lift for globe pixels: gains the darkest tones and pushes them toward deep blue,
// so the night hemisphere reads as dark land rather than a void. Daylit tones pass unchanged.
vec3 liftNight(vec3 c, float globe, vec3 tint, float gain) {
  float dark = 1.0 - smoothstep(0.0, 0.25, luma(c));
  return c + globe * dark * (c * gain + tint);
}
`

/**
 * AEGIS: the default command grade. Subtle darken, slight desaturation, cool cyan tint,
 * a faint teal lift in the blacks so space matches the HUD background (#00060e), light vignette.
 */
const AEGIS = /* glsl */ `
${COMMON}
${DEPTH}
void main() {
  vec2 uv = v_textureCoordinates;
  vec3 c = texture(colorTexture, uv).rgb;
  float globe = isGlobe(uv);
  c = liftNight(c, globe, vec3(0.014, 0.050, 0.115), 2.6);  // night side -> dark blue land
  float l = luma(c);
  c = mix(vec3(l), c, 0.74);                 // slight desaturation
  c *= 0.86;                                 // subtle darken
  c *= vec3(0.90, 1.0, 1.07);                // cool cyan balance
  c += vec3(0.0, 0.022, 0.05) * (1.0 - l);   // teal lift in shadows (space -> HUD bg)
  c += vec3(0.10, 0.62, 0.78) * silhouetteRim(uv) * 0.55;   // faint cyan atmosphere rim
  float vig = smoothstep(1.7, 0.6, centerDistance(uv));
  c *= mix(0.80, 1.0, vig);                  // light vignette
  out_FragColor = vec4(c, 1.0);
}
`

/** NVG: image-intensifier emulation. P43 green phosphor, auto-gain, halo bloom, scintillation, tube vignette. */
const NVG = /* glsl */ `
${COMMON}
uniform float time;
void main() {
  vec2 uv = v_textureCoordinates;
  vec2 px = 1.0 / czm_viewport.zw;
  vec3 c = texture(colorTexture, uv).rgb;
  // 8-tap ring for the halo that bright sources get in an intensifier tube.
  vec3 halo = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.78539816;
    halo += texture(colorTexture, uv + vec2(cos(a), sin(a)) * px * 3.5).rgb;
  }
  halo /= 8.0;
  // Wide ring: bright point sources (city lights) bloom the way they do through an intensifier.
  vec3 wide = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.78539816 + 0.39269908;
    wide += texture(colorTexture, uv + vec2(cos(a), sin(a)) * px * 11.0).rgb;
  }
  wide /= 8.0;
  float l = luma(c);
  float lh = max(luma(halo), luma(wide) * 0.8);
  // Intensifier gain curve: lifts faint detail, compresses highlights. Gain 2.0 keeps daylight
  // scenes from saturating to flat green (3.2 blew out a sunlit city); the S-curve restores
  // local contrast the compression takes away.
  float g = 1.0 - exp(-(l * 2.0 + max(lh - 0.22, 0.0) * 2.6));
  g = smoothstep(0.02, 0.95, g);
  // Scintillation: per-pixel noise re-rolled every frame, stronger in the dark.
  float n = hash12(floor(uv * czm_viewport.zw) + floor(time * 60.0) * vec2(37.0, 17.0)) - 0.5;
  g = clamp(g + n * mix(0.16, 0.05, g), 0.0, 1.0);
  vec3 phosphor = mix(vec3(0.02, 0.08, 0.03), vec3(0.62, 1.0, 0.55), g);
  phosphor *= 0.97 + 0.03 * sin(uv.y * czm_viewport.w * 1.5708);   // faint fiber-optic banding
  float tube = smoothstep(1.55, 0.95, centerDistance(uv));          // soft round tube
  out_FragColor = vec4(phosphor * tube, 1.0);
}
`

/** FLIR: luminance-as-temperature on an ironbow ramp, softened like a low-res microbolometer, with sensor noise. */
const FLIR = /* glsl */ `
${COMMON}
uniform float time;
vec3 ironbow(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.00, 0.00, 0.04);
  vec3 c1 = vec3(0.22, 0.02, 0.42);
  vec3 c2 = vec3(0.62, 0.05, 0.48);
  vec3 c3 = vec3(0.93, 0.27, 0.12);
  vec3 c4 = vec3(1.00, 0.66, 0.05);
  vec3 c5 = vec3(1.00, 0.97, 0.75);
  float s = t * 5.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  if (s < 4.0) return mix(c3, c4, s - 3.0);
  return mix(c4, c5, s - 4.0);
}
void main() {
  vec2 uv = v_textureCoordinates;
  vec2 px = 1.5 / czm_viewport.zw;
  // 3x3 tent blur: thermal sensors resolve far less detail than visible-light cameras.
  float l = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
      l += luma(texture(colorTexture, uv + vec2(float(x), float(y)) * px).rgb) * w;
    }
  }
  l /= 16.0;
  // Wide range so typical ground sits cool-to-mid (purple/magenta) and only genuinely bright
  // surfaces read hot; a narrow range turned whole cities orange.
  float t = pow(clamp((l - 0.05) / 0.85, 0.0, 1.0), 1.15);
  t += (hash12(floor(uv * czm_viewport.zw * 0.5) + floor(time * 30.0)) - 0.5) * 0.035;
  vec3 c = ironbow(t);
  c *= mix(0.82, 1.0, smoothstep(1.8, 0.7, centerDistance(uv)));
  out_FragColor = vec4(c, 1.0);
}
`

/** CRT: barrel curvature, RGB convergence error, scanlines, aperture-grille mask, flicker. */
const CRT = /* glsl */ `
${COMMON}
${DEPTH}
uniform float time;
vec2 barrel(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  vec2 off = abs(c.yx) / vec2(5.5, 4.5);
  c += c * off * off;
  return c * 0.5 + 0.5;
}
void main() {
  vec2 uv = barrel(v_textureCoordinates);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  // Convergence error grows toward the edges.
  vec2 fromCenter = uv - 0.5;
  vec2 ca = fromCenter * length(fromCenter) * 0.012;   // radial, ~4 px at the corners
  vec3 c;
  c.r = texture(colorTexture, uv + ca).r;
  c.g = texture(colorTexture, uv).g;
  c.b = texture(colorTexture, uv - ca).b;
  c = liftNight(c, isGlobe(uv), vec3(0.016, 0.045, 0.085), 2.6);
  c += vec3(0.20, 0.55, 0.60) * silhouetteRim(uv) * 0.45;
  float scan = 0.72 + 0.28 * pow(sin(uv.y * czm_viewport.w * 1.5708), 2.0);   // one line per 2 px
  float col = mod(gl_FragCoord.x, 3.0);
  vec3 mask = vec3(col < 1.0 ? 1.0 : 0.78, (col >= 1.0 && col < 2.0) ? 1.0 : 0.78, col >= 2.0 ? 1.0 : 0.78);
  float flicker = 1.0 + 0.012 * sin(time * 120.0);
  c = c * scan * mask * flicker * 1.32;
  // Rounded-corner bezel falloff.
  vec2 e = smoothstep(vec2(0.0), vec2(0.012), uv) * smoothstep(vec2(0.0), vec2(0.012), 1.0 - uv);
  c *= e.x * e.y * mix(0.75, 1.0, smoothstep(1.6, 0.5, centerDistance(uv)));
  out_FragColor = vec4(c, 1.0);
}
`

/** NOIR: high-contrast monochrome with a cool cast, film grain and a heavy vignette. */
const NOIR = /* glsl */ `
${COMMON}
${DEPTH}
uniform float time;
void main() {
  vec2 uv = v_textureCoordinates;
  vec3 src = liftNight(texture(colorTexture, uv).rgb, isGlobe(uv), vec3(0.06), 3.2);
  float l = luma(src);
  // Contrast S-curve; its toe starts below zero so the lifted night tones aren't crushed back to black.
  l = smoothstep(-0.04, 0.85, l);
  l += silhouetteRim(uv) * 0.22;
  l += (hash12(floor(uv * czm_viewport.zw) + floor(time * 24.0) * vec2(11.0, 23.0)) - 0.5) * 0.07;
  l *= mix(0.55, 1.0, smoothstep(1.5, 0.45, centerDistance(uv)));
  out_FragColor = vec4(vec3(l) * vec3(0.95, 0.98, 1.03), 1.0);
}
`

/** Fragment shader per mode. RAW has none: no stage runs and the imagery is untouched. */
export const SENSOR_SHADERS: Readonly<Record<Exclude<SensorMode, 'raw'>, { source: string; animated: boolean }>> = {
  aegis: { source: AEGIS, animated: false },
  nvg: { source: NVG, animated: true },
  flir: { source: FLIR, animated: true },
  crt: { source: CRT, animated: true },
  noir: { source: NOIR, animated: true },
}
