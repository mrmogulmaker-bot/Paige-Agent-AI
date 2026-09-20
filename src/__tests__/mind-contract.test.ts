import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// The guard is dependency-free and its exports are pure (the CLI entry only runs under a direct
// `node` invocation), so importing it here has no side effects. tsc is non-strict + allowJs, so the
// `.mjs` import adds no new type error; vitest resolves it in Node.
import {
  analyzeMindContract,
  CANONICAL_MIND_STATES,
  extractMindStateLiterals,
  readRealSpineInputs,
} from "@/../scripts/ci/mind-contract-lint.mjs";

const FIXTURES = "scripts/fixtures/mind-contract";
const fixture = (name: string) => ({ path: `${FIXTURES}/${name}`, content: readFileSync(`${FIXTURES}/${name}`, "utf8") });

// The real Spine projection + Chat adapter, exactly as they ship on main. Every test below proves
// the LIVE contract holds AND that a planted regression is caught — the failing-first pair.
const real = readRealSpineInputs();
const realViolations = analyzeMindContract(real);
const codes = (inputs: Parameters<typeof analyzeMindContract>[0]) => analyzeMindContract(inputs).map((v: { code: string }) => v.code);

describe("Mind three-state evidence contract (§18/§13/§00)", () => {
  it("MC1 — the live Mind projection's state union is EXACTLY {recorded, no_evidence, unavailable}, and a fourth state is caught", () => {
    // The live contract is fully clean end-to-end (asserted once here).
    expect(realViolations).toEqual([]);
    expect(real.projections.length).toBeGreaterThan(0);
    for (const projection of real.projections) {
      expect(extractMindStateLiterals(projection.content)).toEqual([...CANONICAL_MIND_STATES].sort());
    }
    // Failing-first: a projection that adds a "partial" state is flagged MC1.
    expect(codes({ projections: [fixture("bad-mc1-projection.ts")], chatAdapter: fixture("good-chat.ts") })).toContain("MC1");
  });

  it("MC2 — the live projector is fail-closed (non-available→unavailable, empty→no_evidence, any-null→unavailable), and a partial-answer projector is caught", () => {
    expect(realViolations.map((v: { code: string }) => v.code)).not.toContain("MC2");
    // Failing-first: a projector that returns "recorded" for an empty/partial set is flagged MC2.
    expect(codes({ projections: [fixture("bad-mc2-projection.ts")], chatAdapter: fixture("good-chat.ts") })).toContain("MC2");
  });

  it("MC3 — the live absence blocks carry their honesty guardrail copy, and a stripped block is caught", () => {
    expect(realViolations.map((v: { code: string }) => v.code)).not.toContain("MC3");
    // Failing-first: a render that drops the 'infer nothing' / 'not proof of none' copy is flagged MC3.
    expect(codes({ projections: [fixture("bad-mc3-projection.ts")], chatAdapter: fixture("good-chat.ts") })).toContain("MC3");
  });

  it("MC4 — there is exactly ONE Mind projection home, and a second projection without a Spine Change Request is caught", () => {
    expect(real.projections.length).toBe(1);
    expect(realViolations.map((v: { code: string }) => v.code)).not.toContain("MC4");
    // Failing-first: adding a second, SCR-less Mind projection alongside the real one is flagged MC4.
    expect(codes({ projections: [...real.projections, fixture("bad-mc4-second-projection.ts")], chatAdapter: real.chatAdapter })).toContain("MC4");
  });

  it("MC5 — the live Chat adapter renders VIA the Mind projection (no re-derived states), and a re-deriving adapter is caught", () => {
    expect(realViolations.map((v: { code: string }) => v.code)).not.toContain("MC5");
    // Failing-first: a Chat adapter that constructs the no_evidence branch itself is flagged MC5.
    expect(codes({ projections: real.projections, chatAdapter: fixture("bad-mc5-chat.ts") })).toContain("MC5");
  });
});
