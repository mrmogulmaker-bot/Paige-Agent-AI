import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { draftedFixText } from "./SystemsCheckTile";

/**
 * Contract: this tile must never present an internal drafting brief as a fix Paige wrote.
 *
 * `paige_drafted_fix` carries five shapes, and only ONE of them is a draft. The other four pair the
 * registry's `remediation_prompt` — an instruction addressed to Paige, about the tenant, in the
 * third person — with a marker saying no model produced anything. This component resolved `brief`
 * FIRST and never read `content`, so all four rendered under the literal heading "Paige drafted
 * this fix", showing a tenant owner the sentence "Check whether <their business> has any contacts
 * in the CRM. If empty, offer to import their existing customer list."
 *
 * SoloSystemsCheckWorkspace has always excluded `brief` and has a test asserting exactly that
 * ("shows owner-facing remediation content instead of an internal drafting brief"). This tile had
 * no equivalent guard, which is the only reason the divergence survived — and per the tier matrix
 * it is the tile, not that workspace, that a sub-account reaches. So the tier with no alternative
 * view was the one being told something untrue.
 *
 * The draft budget is why this is now urgent rather than latent: deferral is the DESIGNED outcome
 * for every fail past the budget, so a rare malfunction becomes the default rendering.
 */
describe("draftedFixText never presents an internal brief as a drafted fix", () => {
  const BRIEF = "Check whether Acme Consulting has any contacts in the CRM.";

  it("returns the real draft for a genuine forge result", () => {
    expect(draftedFixText({ brief: BRIEF, content: "Here is the fix.", model: "m" }, "tenant"))
      .toBe("Here is the fix.");
  });

  it("prefers content over brief, matching the Solo workspace's key order", () => {
    // If `brief` were still read first this returns BRIEF and the assertion fails.
    expect(draftedFixText({ brief: BRIEF, content: "Real draft." }, "tenant")).toBe("Real draft.");
  });

  it.each([
    ["budget-deferred", { deferred: true, reason: "draft_budget_exhausted" }],
    ["budget-deferred even if a brief leaks in", { brief: BRIEF, deferred: true }],
    ["needs_config", { brief: BRIEF, needs_config: true, reason: "model_needs_config" }],
    ["forge error", { brief: BRIEF, error: "Featherless call failed or returned no choice" }],
  ])("returns nothing for a %s finding, so no drafted-fix block renders", (_label, fix) => {
    expect(draftedFixText(fix, "tenant")).toBeNull();
  });

  it("still surfaces the brief for an operator finding, where the brief IS the guidance", () => {
    // prompt-forge is tenant-scoped and cannot run tenant-less, so the runner stores the registry
    // brief deterministically for operator scans. Dropping `brief` outright would blank every
    // operator finding's remediation — a removal, not a fix.
    expect(
      draftedFixText({ brief: BRIEF, source: "operator_registry_brief", operator_scope: true }, "operator"),
    ).toBe(BRIEF);
  });

  it("never returns a tenant's brief just because the operator list allows it", () => {
    expect(draftedFixText({ brief: BRIEF, needs_config: true }, "operator")).toBeNull();
  });

  it("handles the string and empty forms without throwing", () => {
    expect(draftedFixText("plain text", "tenant")).toBe("plain text");
    expect(draftedFixText("   ", "tenant")).toBeNull();
    expect(draftedFixText(null, "tenant")).toBeNull();
    expect(draftedFixText({}, "tenant")).toBeNull();
  });
});

describe("the drafted-fix heading is gated on there being a draft", () => {
  const raw = readFileSync(
    resolve(process.cwd(), "src/components/systems-check/SystemsCheckTile.tsx"),
    "utf8",
  );
  // Comments stripped before matching. The resolver's own JSDoc QUOTES the heading in order to
  // explain the defect, so matching against the raw file finds the explanation rather than the JSX
  // — which is how the first draft of this very assertion failed.
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

  it("renders the heading only inside the fixText guard", () => {
    // Pins the structural half: resolving correctly is useless if the heading escapes the guard.
    const guardAt = source.indexOf("{fixText && (");
    const headingAt = source.indexOf("Paige drafted this fix");
    expect(guardAt, "the fixText guard must still exist").toBeGreaterThan(-1);
    expect(headingAt, "the heading must exist in the JSX").toBeGreaterThan(-1);
    expect(headingAt, "the heading must sit inside the guard, never before it").toBeGreaterThan(guardAt);
  });

  it("passes scope into the resolver, so operator and tenant cannot share a key list", () => {
    expect(source).toContain("draftedFixText(current.paige_drafted_fix, scope)");
  });
});
