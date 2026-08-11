// _shared/skill-interpreter-core.ts — the PURE decision logic of the Skills S1b steps-interpreter
// (concept 1 in docs/doctrine/skills-vocabulary.md — an executable `paige_skills` recipe).
//
// This file is DELIBERATELY Deno-free (no esm.sh/URL imports, no Deno.env) so it can be unit-tested
// by vitest from src/ exactly like `_shared/contact-search.ts` (hotfix #127). The Deno orchestrator
// that wires these helpers to the real `forge()` seam + the DB lives in `_shared/skill-interpreter.ts`.
//
// WHY an interpreter (§16/§26): the shipped skill-runner dispatches with a switch(slug) + one bespoke
// handler per skill. That doesn't scale — every new skill Paige forges would need hand-written Deno.
// The interpreter reads the skill ROW (steps + methodology_anchor + allowed_tools + autonomy_lane +
// tier_availability) and drives a generic, doctrine-clean run through the EXISTING prompt-forge seam.
// It is ADDITIVE (§58): the 4 shipped skills stay on their bespoke handlers untouched; the interpreter
// only runs for slugs that today hit the default case (which just throws "no runtime handler").

// ── Types ──────────────────────────────────────────────────────────────────────────────────────
export type AutonomyLane = "auto" | "confirm" | "off";

/** How a skill run resolves after generation, derived from its autonomy_lane (§16). */
export type ExecutionMode =
  | "execute"   // 🟢 auto — return the output (and safe INTERNAL writes only; never an external send)
  | "approval"  // 🟡 confirm — file a draft to paige_pending_approvals for a human to approve
  | "brief";    // 🔴 off — hand back a brief only; write nothing, execute nothing

/** The only generation modality a skill forges today (§17 vocabulary — there is no "copy" modality). */
export type SkillModality = "text";

/** The router tiers a skill may forge at (§17). external-send-risk content escalates to frontier. */
export type SkillTier = "frontier" | "open-flexible";

/** §51/§60 tier keys. `null` = the caller's tier was not resolved server-side (UI is the primary gate). */
export type CallerTier = "god" | "agency" | "enterprise" | "sub_account" | "solo" | null;

export interface SkillStep {
  id?: string;
  tool?: string;
  desc?: string;
}

/** The subset of a `paige_skills` row the interpreter reasons over. */
export interface SkillRow {
  slug: string;
  name: string;
  category: string | null;
  risk_level: string | null;
  autonomy_lane: string | null;                      // may be null on a legacy row
  methodology_anchor: string | null;
  scoping: string | null;                            // 'platform' | 'tenant' — drives the §2 finance guard
  tier_availability: Record<string, unknown> | null; // per-skill §61 doc, added #466
  steps: SkillStep[] | null;
  allowed_tools: string[] | null;
}

// ── resolveExecutionMode — the §16 autonomy clamp ────────────────────────────────────────────────
/**
 * Map a skill's autonomy_lane (+ a STRUCTURAL risk floor) to how the run resolves. Two guarantees:
 *
 *   1. The default for a missing/unknown lane is the SAFE middle — "approval" — so a mis-seeded skill
 *      never silently auto-executes (§13/§16).
 *   2. A RISK FLOOR that does NOT depend on the lane being seeded correctly: a skill whose risk is
 *      external_send or mutating can NEVER resolve to "execute", regardless of its autonomy_lane. The
 *      lane→mode chain alone was a one-time backfill (external_send→confirm) that a future manual/forge/
 *      MCP INSERT could violate by writing risk="external_send" with lane="auto"; the floor makes the
 *      §16 human-in-the-loop invariant STRUCTURAL, not backfill-dependent. (read_only/draft may honor
 *      auto→execute; the interpreter still has no external-send call site either way.)
 */
export function resolveExecutionMode(lane: string | null | undefined, riskLevel?: string | null): ExecutionMode {
  let mode: ExecutionMode;
  switch ((lane ?? "").trim().toLowerCase()) {
    case "auto":
      mode = "execute";
      break;
    case "off":
      mode = "brief";
      break;
    case "confirm":
      mode = "approval";
      break;
    default:
      mode = "approval"; // unknown/missing lane → safest posture (§16)
      break;
  }
  // Risk floor (§16 structural invariant): high-risk work can never auto-execute — force human review.
  const risk = (riskLevel ?? "").trim().toLowerCase();
  if (mode === "execute" && (risk === "external_send" || risk === "mutating")) {
    return "approval";
  }
  return mode;
}

/**
 * Map a `paige_skills.risk_level` (read_only|draft|mutating|external_send) to the DISJOINT
 * `paige_pending_approvals.risk_level` vocabulary (low|medium|high|blocker|null). Passing the skill's
 * own value would violate `paige_pending_approvals_risk_chk` and throw the approval INSERT.
 */
export function mapApprovalRisk(riskLevel: string | null | undefined): "low" | "medium" | "high" | null {
  switch ((riskLevel ?? "").trim().toLowerCase()) {
    case "external_send":
    case "mutating":
      return "high";
    case "draft":
      return "medium";
    case "read_only":
      return "low";
    default:
      return null;
  }
}

// ── tierAllowsSkill — the §60/§61 per-skill tier gate ────────────────────────────────────────────
/**
 * Server-side belt for the §60/§61 tier lock — whether the caller's tier may SELF-RUN this skill. The
 * PRIMARY gate is the UI (`hasFeature('skills')`, #466) — a Deno edge function cannot import the
 * frontend helper, so this reads the per-skill `tier_availability` jsonb doc instead. It is
 * defense-in-depth (§13), not the sole enforcement.
 *
 * §61 CRITICAL: "resell" is NOT self-run. tier_availability values are yes | yes+resell | resell | no.
 * Only "yes"/"yes+resell" permit the tier to self-execute; "resell" means the tier may RESELL the
 * skill via the Marketplace but NEVER run it itself (the §61 agency posture), and "no" denies outright.
 * A null caller tier (not resolved server-side) or an unspecified tier key is allowed through — the
 * authoritative gate already ran in the UI.
 */
export function tierAllowsSkill(
  tierAvailability: Record<string, unknown> | null | undefined,
  callerTier: CallerTier,
): boolean {
  if (!callerTier) return true;                                   // UI is the primary gate (#466)
  if (!tierAvailability || typeof tierAvailability !== "object") return true; // no per-skill doc → unrestricted here
  const v = tierAvailability[callerTier];
  if (v === undefined || v === null) return true;                 // tier key unspecified → unrestricted here
  const s = String(v).trim().toLowerCase();
  return s.startsWith("yes"); // "yes"/"yes+resell" self-run; "resell" (marketplace-only, §61) + "no" deny
}

// ── needsFormat — Slice 4 (S1d) format-picker ────────────────────────────────────────────────────
export const FORMAT_OPTIONS = ["Word", "Google Doc", "PDF", "Markdown"] as const;
export const FORMAT_PROMPT = "What format would you like this in — Word, Google Doc, PDF, or Markdown?";

/**
 * A document-generating skill asks the user for a format BEFORE generating (§15 — Paige probes for
 * what she can't know; §36 — draft-first, one clear choice). True when the skill is a document skill
 * (category "documents" OR a step renders a doc) AND the caller hasn't already chosen a format.
 */
export function needsFormat(skill: SkillRow, inputs: Record<string, unknown> | null | undefined): boolean {
  const isDoc =
    (skill.category ?? "").trim().toLowerCase() === "documents" ||
    (Array.isArray(skill.steps) && skill.steps.some((s) => (s?.tool ?? "").toLowerCase() === "pdf_render"));
  if (!isDoc) return false;
  const fmt = inputs?.format;
  return !(typeof fmt === "string" && fmt.trim().length > 0);
}

// ── pickModality / pickTier — §17 routing choices ────────────────────────────────────────────────
export function pickModality(_skill: SkillRow): SkillModality {
  return "text"; // skills forge text; a doc-render step is a downstream format concern, not the modality
}

/**
 * §17 — content that will become a customer send (external_send risk) is drafted at the frontier tier;
 * everything else drafts at the cheap/flexible open tier (§14 cost-low). The actual send never happens
 * here (it routes through approval), so is_customer_send stays false at the forge call — but drafting
 * the words a client will read still earns the stronger model.
 */
export function pickTier(skill: SkillRow): SkillTier {
  return (skill.risk_level ?? "").trim().toLowerCase() === "external_send" ? "frontier" : "open-flexible";
}

// ── buildForgeIntent — assemble the brief the forge template fills ───────────────────────────────
function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "";
}

/**
 * Turn the skill row + caller inputs (+ optional gathered context) into the userIntent brief that
 * prompt-forge fills into the tenant's DNA template. The methodology_anchor LEADS so every skill is
 * grounded in a real framework (§35 — "no vibes-based skills"), then the descriptive steps become the
 * plan, then the caller's brief and chosen format. Always non-empty (forge requires a userIntent).
 */
export function buildForgeIntent(
  skill: SkillRow,
  inputs: Record<string, unknown> | null | undefined,
  contextText?: string,
): string {
  const parts: string[] = [`Task: ${skill.name}.`];
  if (skill.methodology_anchor && skill.methodology_anchor.trim()) {
    parts.push(`Ground your work in this methodology: ${skill.methodology_anchor.trim()}.`);
  }
  const plan = Array.isArray(skill.steps)
    ? skill.steps.filter((s) => s?.desc && s.desc.trim()).map((s, i) => `${i + 1}. ${s.desc!.trim()}`).join(" ")
    : "";
  if (plan) parts.push(`Follow this plan: ${plan}`);
  const brief = firstString(inputs?.prompt, inputs?.topic, inputs?.brief, inputs?.request, inputs?.instructions);
  if (brief) parts.push(`Brief: ${brief}`);
  const fmt = typeof inputs?.format === "string" ? inputs.format.trim() : "";
  if (fmt) parts.push(`Deliver the output in ${fmt} format.`);
  if (contextText && contextText.trim()) parts.push(`Relevant context:\n${contextText.trim()}`);
  return parts.join("\n");
}

// ── The set of shipped slugs that keep their bespoke handlers (§58) ──────────────────────────────
/**
 * The 4 skills shipped with bespoke switch(slug) handlers. The interpreter NEVER replaces these unless
 * a caller passes force_interpreter (Slice 3's bespoke-vs-interpreter diff proof). Everything else —
 * every slug Paige forges from here on — flows through the interpreter automatically.
 */
export const BESPOKE_SKILL_SLUGS: ReadonlySet<string> = new Set([
  "verify_business_sos",
  "research_to_concept_brief",
  "build_game_plan",
  "draft_and_email_document",
]);

/** Should this run go through the interpreter? True for any non-bespoke slug, or when explicitly forced. */
export function shouldUseInterpreter(slug: string, forceInterpreter?: boolean): boolean {
  return forceInterpreter === true || !BESPOKE_SKILL_SLUGS.has(slug);
}
