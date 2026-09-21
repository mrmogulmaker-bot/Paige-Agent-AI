import { describe, expect, it } from "vitest";
import { makeRng, gauss, domainCenter, synapsePoint, hashSeed, type FormDomain } from "./synapseForm";

// §32 headless smoke: prove the crash-prone generator math RUNS and produces finite, bounded output
// against real inputs BEFORE the GPU ever touches it. A green build proves nothing about this.

const DOMAINS: FormDomain[] = [
  { key: "identity", az: -0.55, el: 0.62 },
  { key: "people", az: -2.4, el: 0.05 },
  { key: "goals", az: -1.5, el: -0.75 },
  { key: "systems", az: 1.1, el: 0.35 },
  { key: "knowledge", az: 2.2, el: -0.25 },
  { key: "offers", az: 0.2, el: -0.95 },
];

describe("synapseForm — pure generators (§32 headless smoke)", () => {
  it("makeRng is deterministic and stays in [0,1)", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 200 }, () => a());
    const seqB = Array.from({ length: 200 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("gauss is ALWAYS finite — never Math.log(0) (the one arithmetic trap)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 5000; i++) expect(Number.isFinite(gauss(r))).toBe(true);
  });

  it("domainCenter returns a unit vector for every domain", () => {
    for (const d of DOMAINS) {
      const c = domainCenter(d);
      expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 6);
    }
  });

  it("synapsePoint produces finite, bounded points for dust AND nodes across every domain", () => {
    const r = makeRng(20260920);
    for (const d of DOMAINS) {
      const c = domainCenter(d);
      for (let i = 0; i < 3000; i++) {
        const dust = synapsePoint(c, r, true); // dust (may use the stem)
        expect(dust.every((v) => Number.isFinite(v))).toBe(true);
        expect(dust.every((v) => Math.abs(v) < 4)).toBe(true); // well within the camera frustum
        const node = synapsePoint(c, r, false); // node (readable surface only, no stem)
        expect(node.every((v) => Number.isFinite(v))).toBe(true);
        expect(node[1]).toBeGreaterThan(-2.5); // nodes never fall down the stem
      }
    }
  });

  it("hashSeed is stable, distinct, and 32-bit unsigned", () => {
    expect(hashSeed("knowledge:doc1")).toBe(hashSeed("knowledge:doc1"));
    expect(hashSeed("decision:a1")).not.toBe(hashSeed("systems:n8n-api"));
    expect(hashSeed("x")).toBe(hashSeed("x") >>> 0);
  });
});
