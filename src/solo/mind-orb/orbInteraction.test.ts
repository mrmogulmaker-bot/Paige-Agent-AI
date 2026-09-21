import { describe, expect, it } from "vitest";
import {
  focusScale,
  pickRayIndex,
  pickFrontIndex,
  feedVisual,
  reconcileFeedSignal,
  type Vec3,
} from "./orbInteraction";

// §32 headless proof of the three #1303 Codex P2 fixes. The engine needs WebGL, so these pure
// functions ARE the tested seam the engine calls — rendered and pickable behaviour cannot diverge.

// The shader focus scale, expressed independently, to cross-check focusScale():
//   pos *= mix(1.0, mix(0.82, 1.12, isF), uFocusAmt)
function shaderScale(dm: number, uFocus: number, amt: number): number {
  const isF = uFocus >= -0.5 && Math.abs(dm - uFocus) <= 0.5 ? 1 : 0;
  const mixA = 0.82 + isF * (1.12 - 0.82);
  return 1.0 + (mixA - 1.0) * amt;
}
function nrm(v: Vec3): Vec3 {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}
const scaleWorld = (base: Vec3[], domains: number[], uFocus: number, amt: number): Vec3[] =>
  base.map((p, i) => {
    const f = focusScale(domains[i], uFocus, amt);
    return [p[0] * f, p[1] * f, p[2] * f] as Vec3;
  });

describe("orbInteraction — focusScale matches the vertex shader", () => {
  it("is 1.0 with no focus, 1.12 for the focused domain, 0.82 for the rest (full amount)", () => {
    expect(focusScale(2, -1, 0)).toBeCloseTo(1, 10); // no focus
    expect(focusScale(2, 2, 1)).toBeCloseTo(1.12, 10); // focused
    expect(focusScale(3, 2, 1)).toBeCloseTo(0.82, 10); // not focused
  });
  it("interpolates by uFocusAmt and equals the shader formula across a sweep", () => {
    for (const dm of [0, 1, 5]) {
      for (const uFocus of [-1, 0, 1, 5]) {
        for (const amt of [0, 0.25, 0.5, 0.75, 1]) {
          expect(focusScale(dm, uFocus, amt)).toBeCloseTo(shaderScale(dm, uFocus, amt), 10);
        }
      }
    }
  });
});

describe("orbInteraction — pointer pick honors focus (pickRayIndex, #1303 P2)", () => {
  const base: Vec3[] = [
    [3, 0, 0], // A, domain 0
    [-3, 0, 0], // B, domain 1
    [0, 3, 0], // C, domain 2
  ];
  const domains = [0, 1, 2];
  const cam: Vec3 = [0, 0, 5];

  it("under focus, a ray aimed at the RENDERED node selects it — and would MISS at the pre-focus position", () => {
    const eff = scaleWorld(base, domains, /*uFocus*/ 0, /*amt*/ 1); // focus domain 0 → A scales to (3.36,0,0)
    const target = eff[0]; // where A actually renders
    const dir = nrm([target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]]);

    // FIX: picking against effective positions lands on A.
    expect(pickRayIndex(eff, cam, dir, 0.12)).toBe(0);
    // BUG (old behaviour): the same ray against the pre-focus base positions misses A entirely.
    expect(pickRayIndex(base, cam, dir, 0.12)).toBe(-1);
  });

  it("returns -1 when the ray points away from every node", () => {
    expect(pickRayIndex(base, cam, nrm([0, 0, 1]), 0.12)).toBe(-1); // ray goes behind the field
  });
});

describe("orbInteraction — keyboard Enter pick honors focus (pickFrontIndex, #1303 P2)", () => {
  const base: Vec3[] = [
    [0, 0, 3], // A, domain 0 — nearer the camera at rest
    [0, 0, 2.7], // B, domain 1
  ];
  const domains = [0, 1];
  const cam: Vec3 = [0, 0, 5];

  it("front-most follows the focus scale: focusing B makes B the rendered front, not A", () => {
    const eff = scaleWorld(base, domains, /*uFocus*/ 1, /*amt*/ 1); // focus domain 1 → B out to (0,0,3.024)
    // FIX: the focused node B is now front-most, matching what is drawn.
    expect(pickFrontIndex(eff, cam)).toBe(1);
    // BUG (old behaviour): scanning the pre-focus base positions returns A.
    expect(pickFrontIndex(base, cam)).toBe(0);
  });
});

describe("orbInteraction — reduced-motion never animates a feed (feedVisual, #1303 P2)", () => {
  it("reduced-motion returns neither a stream nor a flash, running or paused", () => {
    expect(feedVisual(true, true)).toEqual({ stream: false, flash: false });
    expect(feedVisual(true, false)).toEqual({ stream: false, flash: false });
  });
  it("full motion streams while running and flashes while paused", () => {
    expect(feedVisual(false, true)).toEqual({ stream: true, flash: false });
    expect(feedVisual(false, false)).toEqual({ stream: false, flash: true });
  });
});

describe("orbInteraction — a feed during import is held, not dropped (reconcileFeedSignal, #1303 P2)", () => {
  it("holds a new signal while the handle is not ready WITHOUT marking it seen", () => {
    expect(reconcileFeedSignal(false, 1, undefined)).toEqual({ fire: false, markSeen: false, hold: true });
  });
  it("fires and marks seen once the handle is ready", () => {
    expect(reconcileFeedSignal(true, 1, undefined)).toEqual({ fire: true, markSeen: true, hold: false });
  });
  it("does nothing for an already-seen or absent token", () => {
    expect(reconcileFeedSignal(true, 1, 1)).toEqual({ fire: false, markSeen: false, hold: false });
    expect(reconcileFeedSignal(true, undefined, undefined)).toEqual({ fire: false, markSeen: false, hold: false });
  });
  it("the held-then-flushed sequence fires exactly once (the drop bug is closed)", () => {
    // 1) signal arrives during import → held, not seen
    const held = reconcileFeedSignal(false, 7, undefined);
    expect(held.hold).toBe(true);
    expect(held.markSeen).toBe(false);
    // 2) handle mounts; the same token, still unseen → fires and is marked seen (the mount flush)
    const flushed = reconcileFeedSignal(true, 7, undefined);
    expect(flushed.fire).toBe(true);
    expect(flushed.markSeen).toBe(true);
    // 3) seen now — no double fire
    expect(reconcileFeedSignal(true, 7, 7).fire).toBe(false);
  });
});
