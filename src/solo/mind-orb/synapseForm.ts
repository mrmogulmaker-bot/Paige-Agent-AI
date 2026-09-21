// synapseForm — the PURE math of the owner-approved "Synapse" Mind form (no three, no DOM).
//
// §18 ONE HOME + §32: the crash-prone runtime logic of the orb is this generator math (a seeded RNG,
// a Gaussian that takes Math.log, and the lobe/gyri/base/stem transform). Keeping it dependency-free
// makes it headless-smoke-testable (synapseForm.test.ts exercises thousands of points and asserts they
// are finite and bounded) BEFORE the GPU ever runs — the cheapest way to catch "compiles but crashes"
// (§32). The engine imports these and only adds the WebGL/rendering layer on top.

export type Vec3 = [number, number, number];

/** A domain region on the form — key + az/el hub direction (structural subset of the engine's type). */
export interface FormDomain {
  key: string;
  az: number;
  el: number;
}

/** mulberry-style deterministic RNG so the field is stable across renders (ported from the reference). */
export function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. `u = 1 - r()` keeps the argument of Math.log in (0, 1] — never 0,
 * so the result is always finite (§32: the one arithmetic trap in the generator, guarded). */
export function gauss(r: () => number): number {
  const u = 1 - r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v);
}

export function nrm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function rdir(r: () => number): Vec3 {
  const z = r() * 2 - 1;
  const a = r() * 6.2831853;
  const rr = Math.sqrt(Math.max(0, 1 - z * z));
  return [rr * Math.cos(a), z, rr * Math.sin(a)];
}

/** Domain-region centre from az/el (ported from mindDomains.sph). */
export function domainCenter(d: FormDomain): Vec3 {
  const ce = Math.cos(d.el);
  return nrm([ce * Math.sin(d.az), Math.sin(d.el), ce * Math.cos(d.az)]);
}

/** A direction biased toward a domain centre by weight k (ported from the reference `biased`). */
export function biased(center: Vec3, k: number, r: () => number): Vec3 {
  const rd = rdir(r);
  const w = k * r();
  return nrm([rd[0] + center[0] * w, rd[1] + center[1] * w, rd[2] + center[2] * w]);
}

/**
 * The Synapse form generator — TWO LOBES + a GYRI RIDGE + a FLATTENED BASE + a STEM. Ported verbatim
 * from the approved reference's P[1] shape math. `allowStem` lets the structural dust use the stem
 * (~5%) while data nodes stay on the readable surface. Returns a point in orb space.
 */
export function synapsePoint(center: Vec3, r: () => number, allowStem: boolean): Vec3 {
  if (allowStem && r() < 0.05) {
    return [gauss(r) * 0.05, -0.72 - r() * 0.42, -0.18 + gauss(r) * 0.05];
  }
  const dir = biased(center, 1.1, r);
  const side = dir[0] < 0 ? -1 : 1;
  const g =
    1 + 0.075 * Math.sin(11 * dir[1] + 3 * Math.sin(6 * dir[2])) + 0.04 * Math.sin(17 * dir[2] + 2 * dir[1]);
  const m = r() < 0.84 ? 1 + gauss(r) * 0.01 : Math.pow(r(), 0.6);
  let yy = dir[1] * 0.8;
  if (yy < -0.42) yy = -0.42 + (yy + 0.42) * 0.35; // flattened base
  return [(Math.abs(dir[0]) * 0.66 + 0.07) * side * g * m, yy * g * m, dir[2] * 1.02 * g * m];
}

/** Stable 32-bit hash of a string → a seed (so a record's node sits in a consistent place). */
export function hashSeed(value: string): number {
  let out = 2166136261;
  for (let i = 0; i < value.length; i += 1) out = Math.imul(out ^ value.charCodeAt(i), 16777619);
  return out >>> 0;
}
