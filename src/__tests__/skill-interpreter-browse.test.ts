import { describe, it, expect } from "vitest";
// S1b browser-dispatch DECISION helpers live in the pure core (no Deno imports) so vitest can guard
// them as the CI regression for the §16 risk floor, the §37 allowed_tools gate, and the §13 honest
// fold. The full end-to-end dispatch RUN (deps.browse called, ledger insert+update, needs_config
// degrade) is proven by the Deno smoke — scripts/skill-interpreter-browse-smoke.ts — because the
// orchestrator imports the esm.sh/Deno forge chain that vitest can't resolve.
import {
  pickBrowserStep,
  browserToolAllowed,
  browseGatePermits,
  foldBrowserObservation,
  type SkillRow,
  type BrowseObservation,
} from "../../supabase/functions/_shared/skill-interpreter-core";

function skill(partial: Partial<SkillRow>): SkillRow {
  return {
    slug: "x", name: "X", category: null, risk_level: null, autonomy_lane: null,
    methodology_anchor: null, scoping: null, tier_availability: null, steps: null, allowed_tools: null,
    ...partial,
  };
}

describe("pickBrowserStep — the §18 tool-detection idiom", () => {
  it("finds a tool:'browser' step (case-insensitive) and returns null otherwise", () => {
    const s = skill({ steps: [{ tool: "context" }, { tool: "Browser", url: "https://a.co" }] });
    expect(pickBrowserStep(s)?.url).toBe("https://a.co");
    expect(pickBrowserStep(skill({ steps: [{ tool: "context" }] }))).toBeNull();
    expect(pickBrowserStep(skill({ steps: null }))).toBeNull();
  });
});

describe("browserToolAllowed — §37 allowed_tools is actually executed", () => {
  it("only true when 'browser' is granted in allowed_tools", () => {
    expect(browserToolAllowed(skill({ allowed_tools: ["browser"] }))).toBe(true);
    expect(browserToolAllowed(skill({ allowed_tools: ["BROWSER", "rag"] }))).toBe(true);
    expect(browserToolAllowed(skill({ allowed_tools: ["rag"] }))).toBe(false);
    expect(browserToolAllowed(skill({ allowed_tools: null }))).toBe(false);
  });
});

describe("browseGatePermits — §16 risk floor BEFORE navigating", () => {
  it("permits a read_only browse under auto, but NEVER a write-class one", () => {
    expect(browseGatePermits("auto", "read_only")).toBe(true);
    expect(browseGatePermits("auto", "draft")).toBe(true);
    // write-class can never resolve to execute → browse gated
    expect(browseGatePermits("auto", "mutating")).toBe(false);
    expect(browseGatePermits("auto", "external_send")).toBe(false);
  });
  it("does not navigate when the run wouldn't auto-execute (confirm/off/unknown lane)", () => {
    expect(browseGatePermits("confirm", "read_only")).toBe(false);
    expect(browseGatePermits("off", "read_only")).toBe(false);
    expect(browseGatePermits(null, "read_only")).toBe(false);
  });
});

describe("foldBrowserObservation — §13 honest fold, never a fabricated result", () => {
  it("renders only the fields the browse actually returned", () => {
    const obs: BrowseObservation = {
      ok: true, final_url: "https://a.co/x", http_status: 200, title: "T",
      text_excerpt: "hello world", steps: [{ kind: "assertText", ok: true, detail: "found" }],
    };
    const out = foldBrowserObservation(obs);
    expect(out).toContain("final_url: https://a.co/x");
    expect(out).toContain("http_status: 200");
    expect(out).toContain("hello world");
    expect(out).toContain("step[assertText]: ok");
  });
  it("reports a FAILED observation honestly (no fake success)", () => {
    const out = foldBrowserObservation({ ok: false, error: "navigation failed" });
    expect(out).toContain("FAILED");
    expect(out).toContain("navigation failed");
  });
  it("emits nothing when there is no real content beyond the header", () => {
    expect(foldBrowserObservation({ ok: true })).toBe("");
  });
});
