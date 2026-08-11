import { describe, it, expect } from "vitest";
// The Skills S1b steps-interpreter's DECISION logic lives with the edge functions (it's shared by the
// skill-runner and the Slice-3 diff harness). The core module is pure (no Deno imports), so vitest can
// exercise it here as the CI regression guard for the §16 autonomy clamp, the §60 tier gate, and the
// §58 additive-dispatch invariant.
import {
  resolveExecutionMode,
  mapApprovalRisk,
  tierAllowsSkill,
  needsFormat,
  buildForgeIntent,
  pickModality,
  pickTier,
  shouldUseInterpreter,
  BESPOKE_SKILL_SLUGS,
  FORMAT_OPTIONS,
  type SkillRow,
} from "../../supabase/functions/_shared/skill-interpreter-core";

function skill(partial: Partial<SkillRow>): SkillRow {
  return {
    slug: "x",
    name: "X",
    category: null,
    risk_level: null,
    autonomy_lane: null,
    methodology_anchor: null,
    scoping: null,
    tier_availability: null,
    steps: null,
    allowed_tools: null,
    ...partial,
  };
}

describe("resolveExecutionMode — the §16 autonomy clamp", () => {
  it("maps auto→execute, confirm→approval, off→brief", () => {
    expect(resolveExecutionMode("auto")).toBe("execute");
    expect(resolveExecutionMode("confirm")).toBe("approval");
    expect(resolveExecutionMode("off")).toBe("brief");
  });
  it("defaults a missing/unknown lane to the SAFE middle (approval), never execute", () => {
    expect(resolveExecutionMode(null)).toBe("approval");
    expect(resolveExecutionMode(undefined)).toBe("approval");
    expect(resolveExecutionMode("")).toBe("approval");
    expect(resolveExecutionMode("garbage")).toBe("approval");
  });
  it("is case/whitespace tolerant", () => {
    expect(resolveExecutionMode(" AUTO ")).toBe("execute");
    expect(resolveExecutionMode("Confirm")).toBe("approval");
  });
  it("§16 GUARANTEE: an external_send skill (seeded confirm) can NEVER resolve to execute", () => {
    // external_send risk is always seeded lane=confirm → approval; even if lane were somehow blank it
    // still defaults to approval. There is no input that yields execute for a confirm/blank lane.
    expect(resolveExecutionMode("confirm")).not.toBe("execute");
    expect(resolveExecutionMode(null)).not.toBe("execute");
  });
  it("§16 STRUCTURAL RISK FLOOR: high-risk can never auto-execute even if mis-laned to auto", () => {
    // The load-bearing invariant that does NOT depend on the lane being seeded correctly.
    expect(resolveExecutionMode("auto", "external_send")).toBe("approval");
    expect(resolveExecutionMode("auto", "mutating")).toBe("approval");
    // low-risk skills still honor auto→execute
    expect(resolveExecutionMode("auto", "read_only")).toBe("execute");
    expect(resolveExecutionMode("auto", "draft")).toBe("execute");
    // an off lane on a high-risk skill stays brief (even safer) — floor only lifts execute→approval
    expect(resolveExecutionMode("off", "external_send")).toBe("brief");
  });
});

describe("mapApprovalRisk — skill risk → disjoint approvals vocabulary", () => {
  it("maps into (low|medium|high|null), never the skill vocabulary", () => {
    expect(mapApprovalRisk("external_send")).toBe("high");
    expect(mapApprovalRisk("mutating")).toBe("high");
    expect(mapApprovalRisk("draft")).toBe("medium");
    expect(mapApprovalRisk("read_only")).toBe("low");
    expect(mapApprovalRisk(null)).toBe(null);
    expect(mapApprovalRisk("garbage")).toBe(null);
  });
});

describe("tierAllowsSkill — the §60/§61 server-side belt", () => {
  const avail = { god: "yes", solo: "yes", sub_account: "yes", agency: "resell", enterprise: "yes+resell" };
  it("allows SELF-RUN tiers (yes / yes+resell) for the §61-default availability doc", () => {
    for (const t of ["god", "solo", "sub_account", "enterprise"] as const) {
      expect(tierAllowsSkill(avail, t)).toBe(true);
    }
  });
  it("§61: 'resell' is NOT self-run — an agency (resell-only) is DENIED self-execution", () => {
    expect(tierAllowsSkill(avail, "agency")).toBe(false); // agency:'resell' → marketplace only, no self-run
  });
  it("denies an explicit no and resell; allows yes / yes+resell", () => {
    expect(tierAllowsSkill({ ...avail, solo: "no" }, "solo")).toBe(false);
    expect(tierAllowsSkill({ ...avail, solo: "false" }, "solo")).toBe(false);
    expect(tierAllowsSkill({ ...avail, solo: "resell" }, "solo")).toBe(false);
    expect(tierAllowsSkill({ ...avail, agency: "yes+resell" }, "agency")).toBe(true);
    expect(tierAllowsSkill({ ...avail, agency: "yes" }, "agency")).toBe(true);
  });
  it("allows a null caller tier (UI is the primary gate, #466) and an unspecified tier key", () => {
    expect(tierAllowsSkill(avail, null)).toBe(true);
    expect(tierAllowsSkill({ solo: "yes" }, "agency")).toBe(true); // agency key absent → not restricted here
    expect(tierAllowsSkill(null, "solo")).toBe(true);
  });
});

describe("needsFormat — Slice 4 (S1d) format-picker", () => {
  const docSkill = skill({ category: "documents" });
  it("asks for a format when a document skill has no format chosen", () => {
    expect(needsFormat(docSkill, {})).toBe(true);
    expect(needsFormat(docSkill, { format: "" })).toBe(true);
    expect(needsFormat(skill({ steps: [{ tool: "pdf_render", desc: "render" }] }), {})).toBe(true);
  });
  it("does not ask once a format is provided", () => {
    expect(needsFormat(docSkill, { format: "PDF" })).toBe(false);
  });
  it("does not ask for a non-document skill", () => {
    expect(needsFormat(skill({ category: "research" }), {})).toBe(false);
  });
  it("offers the four owner-ruled formats", () => {
    expect([...FORMAT_OPTIONS]).toEqual(["Word", "Google Doc", "PDF", "Markdown"]);
  });
});

describe("buildForgeIntent — methodology-anchored brief", () => {
  it("leads with the methodology anchor and includes the plan + brief + format", () => {
    const s = skill({
      name: "Build Game Plan",
      methodology_anchor: "GROW coaching model",
      steps: [{ id: "a", tool: "anthropic", desc: "Compose roadmap" }],
    });
    const intent = buildForgeIntent(s, { prompt: "help this client", format: "PDF" }, "Client: Jane Doe");
    expect(intent).toContain("GROW coaching model");
    expect(intent).toContain("Compose roadmap");
    expect(intent).toContain("help this client");
    expect(intent).toContain("PDF");
    expect(intent).toContain("Client: Jane Doe");
  });
  it("is always non-empty (forge requires a userIntent) even with bare inputs", () => {
    expect(buildForgeIntent(skill({ name: "Bare" }), {}).length).toBeGreaterThan(0);
  });
});

describe("pickModality / pickTier — §17 routing", () => {
  it("always forges the text modality", () => {
    expect(pickModality(skill({ category: "documents" }))).toBe("text");
  });
  it("escalates external_send risk to frontier, everything else open-flexible", () => {
    expect(pickTier(skill({ risk_level: "external_send" }))).toBe("frontier");
    expect(pickTier(skill({ risk_level: "read_only" }))).toBe("open-flexible");
    expect(pickTier(skill({ risk_level: "draft" }))).toBe("open-flexible");
    expect(pickTier(skill({ risk_level: null }))).toBe("open-flexible");
  });
});

describe("shouldUseInterpreter — the §58 additive-dispatch invariant", () => {
  it("routes every NON-bespoke slug through the interpreter", () => {
    expect(shouldUseInterpreter("some_new_forged_skill")).toBe(true);
  });
  it("keeps the 4 shipped bespoke slugs on their handlers (byte-identical, §58)", () => {
    for (const slug of BESPOKE_SKILL_SLUGS) {
      expect(shouldUseInterpreter(slug)).toBe(false);
    }
    expect(BESPOKE_SKILL_SLUGS.size).toBe(4);
  });
  it("only routes a bespoke slug through the interpreter when EXPLICITLY forced (Slice 3 diff)", () => {
    expect(shouldUseInterpreter("build_game_plan", false)).toBe(false);
    expect(shouldUseInterpreter("build_game_plan", true)).toBe(true);
  });
});
