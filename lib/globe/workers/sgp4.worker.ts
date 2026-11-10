/// <reference lib="webworker" />
import { eciToEcf, gstime, propagate, twoline2satrec, type SatRec } from 'satellite.js'

/**
 * SGP4/SDP4 propagation off the main thread. The main thread sends the TLE set once, then
 * asks for positions at a time (~2 Hz, slightly ahead of now). Positions come back as
 * Earth-fixed (ECEF) meters in a transferable Float64Array [x0,y0,z0, x1,...]; a satellite
 * whose propagation fails (decayed, bad elements) is NaN and the layer hides it.
 */
export type Sgp4Request =
  | { type: 'init'; tles: Array<[string, string]> }
  | { type: 'propagate'; seq: number; timeMs: number }

export type Sgp4Response =
  | { type: 'ready'; count: number; failed: number }
  | { type: 'positions'; seq: number; timeMs: number; positions: Float64Array; elapsedMs: number }

const ctx = self as unknown as DedicatedWorkerGlobalScope
let satrecs: Array<SatRec | null> = []

ctx.onmessage = (event: MessageEvent<Sgp4Request>) => {
  const msg = event.data
  if (msg.type === 'init') {
    let failed = 0
    satrecs = msg.tles.map(([l1, l2]) => {
      try {
        return twoline2satrec(l1, l2)
      } catch {
        failed++
        return null
      }
    })
    ctx.postMessage({ type: 'ready', count: satrecs.length, failed } satisfies Sgp4Response)
    return
  }

  const started = performance.now()
  const date = new Date(msg.timeMs)
  const gmst = gstime(date)
  const out = new Float64Array(satrecs.length * 3)
  for (let i = 0; i < satrecs.length; i++) {
    const rec = satrecs[i]
    const pv = rec ? propagate(rec, date) : null
    const eci = pv?.position
    if (!eci || !Number.isFinite(eci.x)) {
      out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = Number.NaN
      continue
    }
    const ecf = eciToEcf(eci, gmst)
    out[i * 3] = ecf.x * 1000
    out[i * 3 + 1] = ecf.y * 1000
    out[i * 3 + 2] = ecf.z * 1000
  }
  const response: Sgp4Response = {
    type: 'positions',
    seq: msg.seq,
    timeMs: msg.timeMs,
    positions: out,
    elapsedMs: performance.now() - started,
  }
  ctx.postMessage(response, [out.buffer])
}
