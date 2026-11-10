import type { SkyBox } from 'cesium'
import type { CesiumModule } from './cesium-env'

/**
 * Procedural starfield. Cesium's default Tycho-2 skybox packs so many faint stars
 * that, downsampled to screen size, it reads as static noise behind the HUD. This
 * draws a sparse, deterministic field instead: mostly faint points, a few bright
 * stars with a soft halo, slight blue/amber tints. Canvases go straight to the
 * cube map (no PNG encode), so generation stays cheap during boot.
 */
const FACE_SIZE = 1024
const STARS_PER_FACE = 1400
const FACES = ['positiveX', 'negativeX', 'positiveY', 'negativeY', 'positiveZ', 'negativeZ'] as const

/** Small deterministic PRNG (mulberry32) so the sky is identical every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TINTS = ['255,255,255', '200,225,255', '180,210,255', '255,236,210', '255,214,170']

function drawFace(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = FACE_SIZE
  canvas.height = FACE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE)

  const random = rng(seed)
  for (let i = 0; i < STARS_PER_FACE; i++) {
    const x = random() * FACE_SIZE
    const y = random() * FACE_SIZE
    // Power law: most stars faint, a handful bright.
    const magnitude = Math.pow(random(), 6)
    const tint = TINTS[Math.floor(random() * TINTS.length)]
    // One face texel spans ~2 screen px at the default FOV, so keep radii sub-texel to stay pin-sharp.
    const alpha = 0.3 + magnitude * 0.7
    const radius = 0.3 + magnitude * 0.7
    ctx.fillStyle = `rgba(${tint},${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    // Halo on the brightest, kept off the face edges so it can't clip at a cube seam.
    if (magnitude > 0.7 && x > 8 && y > 8 && x < FACE_SIZE - 8 && y < FACE_SIZE - 8) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 3)
      halo.addColorStop(0, `rgba(${tint},${(alpha * 0.25).toFixed(3)})`)
      halo.addColorStop(1, `rgba(${tint},0)`)
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(x, y, radius * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return canvas
}

export function createStarfield(Cesium: CesiumModule): SkyBox {
  const sources: Record<(typeof FACES)[number], HTMLCanvasElement> = {
    positiveX: drawFace(11),
    negativeX: drawFace(23),
    positiveY: drawFace(37),
    negativeY: drawFace(41),
    positiveZ: drawFace(53),
    negativeZ: drawFace(67),
  }
  return new Cesium.SkyBox({ sources })
}
