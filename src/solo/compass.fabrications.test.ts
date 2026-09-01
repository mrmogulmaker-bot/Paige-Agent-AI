import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The Trust Compass must not ship invented customers, invented provider state, invented
 * measurements, or a claim that something was sent.
 *
 * These are source assertions on purpose. `TcApprove` and `TcEscalate` are module-private and
 * reachable only by clicking a canvas orb, so a render test cannot get at them; what CAN be
 * guaranteed mechanically is that the fabricated strings are not in the file and that the modals
 * read the real seam. A future edit that reintroduces any of them fails here.
 */
const src = fs.readFileSync(path.join(process.cwd(), "src/solo/compass.tsx"), "utf8");

describe("no invented customer or provider state", () => {
  it("carries no invented recipient, sender, company or carrier", () => {
    for (const invented of [
      "sarah.nnadi",          // a named recipient at a named company
      "harpervale",
      "jordan@paigeagent.ai", // a named sender on the operator's own domain
      "Statewide Mutual",     // a named insurance carrier
    ]) {
      expect(src.includes(invented)).toBe(false);
    }
  });

  it("makes no statement about a lapsed policy or a coverage position", () => {
    // The escalation asserted a statutory coverage position and recommended a course of action.
    expect(src).not.toContain("lapsed on August 9");
    expect(src).not.toContain("Reinstate now");
    expect(src).not.toContain("Consult counsel");
  });

  it("shows no confidence percentage on a draft, because no column supplies one", () => {
    // Scoped to the DRAFT's invented 91%. A broader `not.toContain("Confidence")` failed here and
    // was right to: `TcDept` still renders "Confidence, last 30 days" from `TC_DEPTS`, a fixture
    // array supplying every department's confidence, trust level and action counts. That is a
    // real, larger finding — it drives the compass dial itself — and it is tracked rather than
    // silently widened into this slice. Narrowing the assertion to what this change actually
    // fixed keeps it honest; the broader one is owed with that work.
    // Asserted on the ROW the modal built — `['Confidence', …]` — not on the value 91, which
    // collides with TC_DEPTS' Executive entry (`conf:91`) and would have gone red for the wrong
    // reason. An assertion that matches unrelated code is worse than no assertion.
    expect(src).not.toContain("['Confidence'");
    expect(src).not.toContain("['To',");
    expect(src).not.toContain("['From',");
  });
});

describe("no fabricated successful action", () => {
  it("does not claim anything was sent", () => {
    // The approve button used to raise a toast reading "Sent. That one raced through — she logged
    // it under Marketing." Nothing sent anything.
    expect(src).not.toContain("Sent. That one raced through");
    expect(src).not.toMatch(/setToast\(\s*'Sent/);
  });
});

describe("the modals read the real action bus", () => {
  it("CALLS the pending-actions seam in both modals", () => {
    // Not `toContain("useSoloPendingActions")`. That was the first version and it was vacuous:
    // the removal note above names the hook, so the assertion passed with every call site
    // deleted. Mutation caught it — stripping the import left the test green. Counting the actual
    // invocations is what distinguishes wiring from mentioning it.
    const calls = src.match(/useSoloPendingActions\(\)/g) ?? [];
    expect(calls.length).toBe(2); // TcApprove and TcEscalate
    expect(src).toContain('from "./data/useSoloPendingActions"');
  });

  it("has no remaining reference to the removed fixtures", () => {
    expect(src).not.toMatch(/TC_DRAFT\./);
    expect(src).not.toMatch(/TC_ESC\./);
  });
});
