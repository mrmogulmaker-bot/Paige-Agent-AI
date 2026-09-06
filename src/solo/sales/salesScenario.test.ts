// The Scenario Lab is a MODEL, not a forecast and not an action. These assertions defend that: it
// refuses the Evidence-supported path without real evidence, computes only from complete inputs,
// labels every figure modeled/unknown, and never returns a number it cannot justify.
import { describe, it, expect } from "vitest";
import { deriveScenario, type ScenarioInput } from "./salesScenario";

function input(over: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    currentPriceMinor: 1_200_000, proposedPriceMinor: 650_000, currency: "usd",
    closeRatePct: 28, closeRateFromEvidence: true, opportunities: 9, opportunitiesFromEvidence: true, ...over,
  };
}

describe("deriveScenario", () => {
  it("computes each path as price × opportunities × close × multiplier", () => {
    const m = deriveScenario(input());
    const evidence = m.paths.find((p) => p.key === "evidence")!;
    // 650000 * 9 * 0.28 * 1.0 = 1,638,000
    expect(evidence.outcomeMinor).toBe(1_638_000);
    expect(evidence.evidence).toBe("modeled");
    const conservative = m.paths.find((p) => p.key === "conservative")!;
    expect(conservative.outcomeMinor).toBe(Math.round(650_000 * 9 * 0.28 * 0.6));
    const stretch = m.paths.find((p) => p.key === "stretch")!;
    expect(stretch.outcomeMinor).toBe(Math.round(650_000 * 9 * 0.28 * 1.35));
  });

  it("refuses the Evidence-supported path when there is no evidence, but still models the others", () => {
    const m = deriveScenario(input({ closeRateFromEvidence: false, opportunitiesFromEvidence: false, closeRatePct: 30, opportunities: 5 }));
    expect(m.hasEvidence).toBe(false);
    const evidence = m.paths.find((p) => p.key === "evidence")!;
    expect(evidence.outcomeMinor).toBeNull();
    expect(evidence.evidence).toBe("unknown");
    // Conservative still models from the assumption
    expect(m.paths.find((p) => p.key === "conservative")!.outcomeMinor).toBe(Math.round(650_000 * 5 * 0.3 * 0.6));
  });

  it("returns null outcomes (never a guess) when the proposed price is missing", () => {
    const m = deriveScenario(input({ proposedPriceMinor: null }));
    expect(m.ready).toBe(false);
    for (const p of m.paths) expect(p.outcomeMinor).toBeNull();
  });

  it("returns null when close rate or opportunities are absent", () => {
    expect(deriveScenario(input({ closeRatePct: null, closeRateFromEvidence: false })).paths.find((p) => p.key === "conservative")!.outcomeMinor).toBeNull();
    expect(deriveScenario(input({ opportunities: null, opportunitiesFromEvidence: false })).paths.find((p) => p.key === "stretch")!.outcomeMinor).toBeNull();
  });

  it("clamps close rate into 0–100", () => {
    const high = deriveScenario(input({ closeRatePct: 250 }));
    expect(high.paths.find((p) => p.key === "evidence")!.closeRatePct).toBe(100);
    const low = deriveScenario(input({ closeRatePct: -20 }));
    expect(low.paths.find((p) => p.key === "evidence")!.closeRatePct).toBe(0);
  });
});
