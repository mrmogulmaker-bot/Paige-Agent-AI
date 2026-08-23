import { describe, expect, it } from "vitest";
import { effectiveGrantIndex, tallyGrants } from "@/operator/data/usePlatformTrust";

/**
 * The compass arithmetic is the pack's, and it is load-bearing: it decides what the operator is
 * told about a GOVERNANCE GATE. An off-by-one here does not misdraw a chart — it reports that
 * Paige may act where she may not, or the reverse. So the pack's own table is asserted directly
 * rather than the shipped numbers, which change with the catalogue.
 *
 * `v3.dc.html` L4457 `CAP_ON_TRUST = [4, 2, 1]`, L4471–L4479 `effAutonomy`.
 */
describe("effectiveGrantIndex — the pack's ceiling arithmetic", () => {
  it("holds every grant at Observe, because a zero ceiling caps everything to 0", () => {
    expect(effectiveGrantIndex(0, 0)).toBe(3);
    expect(effectiveGrantIndex(1, 0)).toBe(3);
    expect(effectiveGrantIndex(2, 0)).toBe(3);
  });

  it("lets a grant reach autonomous only at the top rung", () => {
    // Autonomous own-grant maps to 4 on the trust scale; only a ceiling of 4 leaves it there.
    expect(effectiveGrantIndex(0, 4)).toBe(0);
    expect(effectiveGrantIndex(0, 3)).toBe(1);
    expect(effectiveGrantIndex(0, 2)).toBe(1);
  });

  it("never raises a capability above its OWN grant, however high the ceiling", () => {
    // Draft-only sits at 1 on the trust scale; a ceiling of 4 does not promote it.
    expect(effectiveGrantIndex(2, 4)).toBe(2);
    expect(effectiveGrantIndex(1, 4)).toBe(1);
  });

  it("clamps downward as the ceiling drops", () => {
    expect(effectiveGrantIndex(1, 2)).toBe(1);
    expect(effectiveGrantIndex(1, 1)).toBe(2);
    expect(effectiveGrantIndex(1, 0)).toBe(3);
  });
});

describe("tallyGrants", () => {
  it("reproduces the pack's own worked example at the Ask-first ceiling", () => {
    // The pack's `IA.CAPS` at ceiling 2: seven capabilities land on ask-first and three on
    // draft-only. Grants, in the pack's order: web 0 · query 0 · sweep 0 · email 1 · sequence 1
    // · connect 1 · enter 1 · sandbox 2 · browse 2 · rule 2.
    const grants = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2] as const;
    expect(tallyGrants(grants, 2)).toEqual([0, 7, 3, 0]);
  });

  it("moves the whole tally into Held when the ceiling is Observe", () => {
    expect(tallyGrants([0, 1, 2], 0)).toEqual([0, 0, 0, 3]);
  });

  it("counts nothing from an empty catalogue rather than inventing a lane", () => {
    expect(tallyGrants([], 2)).toEqual([0, 0, 0, 0]);
  });
});
