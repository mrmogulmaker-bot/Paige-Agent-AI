import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §68 / §13 — the rung the operator READS must be the rung in FORCE.
 *
 * The defect this pins, caught on the live console 2026-08-24 from a side-by-side the owner sent:
 * the spine header rendered "Act and report" (rung 3 — the stored CEILING) directly above a tally
 * reading "0 autonomous · 0 ask first · 23 draft only", which is rung-1 behaviour. The label was
 * fed from `live.level` (the ceiling) while the tally was computed from `live.effective` (what
 * actually binds after §68's attestation and safety-proof clamps). One surface, two different
 * claims about the same platform.
 *
 * A readout that claims authority the platform is not holding is the same class of untruth as a
 * fabricated metric, and it is invisible in every render test that passes `trust` in directly —
 * which all of them do, because that prop bypasses the hook. So this asserts against the SOURCE:
 * whatever feeds the displayed rung must come from `effective`, never from the bare ceiling.
 */
describe("the spine displays the rung in force, not the ceiling", () => {
  const src = readFileSync(
    join(process.cwd(), "src/operator/shell/OperatorSpine.tsx"),
    "utf8",
  );

  // Comments discuss BOTH fields by name — including the comment explaining this very fix — so
  // matching against raw source would pass on prose while the code did the wrong thing. Strip
  // first. (Same trap consoleTypography.test.ts hit on its first run.)
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  it("feeds the displayed rung from `effective`", () => {
    expect(code).toMatch(/level:\s*live\.effective/);
  });

  it("does NOT feed the displayed rung from the bare ceiling", () => {
    // `live.effective ?? live.level` is the sanctioned form — the fallback only fires on a
    // pre-§68 server that sent no `effective`. What must never come back is `level: live.level`
    // on its own, which is the regression.
    expect(code).not.toMatch(/level:\s*live\.level\b/);
  });
});
