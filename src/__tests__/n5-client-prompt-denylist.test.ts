// N5 §2 de-hardcode — Layer A assembly assertion (§32: a green build is not proof;
// the FULL assembled client prompt for a bare / non-funding tenant must carry ZERO
// credit/funding vertical content, and the funding vertical must reach a client
// ONLY when the tenant opted in. This test would FAIL on the pre-N5 live code
// (the ungated userContext injected "❌ NO CREDIT REPORT UPLOADED YET…" into every
// tenant's prompt) — that failure is the point.
import { describe, expect, it } from "vitest";
import {
  buildFundingProgramVocab,
  buildLaneGuardSection,
  buildNeutralCorePrompt,
  buildPaigePersonaBlock,
  buildUserContext,
  CREDIT_DENYLIST,
  CREDIT_PROGRAM_DENYLIST,
  deriveFinanceInScopeFromFeatures,
  HARD_GUARDRAIL_MARKER,
  resolveDisputeReferralLabel,
  sanitizeClientContextForTier,
} from "../../supabase/functions/_shared/client-context.ts";
// §18 one home / §2 / §3 — the platform-default VOICE block ships in the SAME assembled
// prompt as the persona + neutral core, so it must clear the SAME finance + program
// denylists. It lives in its own shared module (extracted from paige-ai-chat/index.ts)
// so this test scans the exact string the edge function sends (§32: green build ≠ proof).
import { PAIGE_VOICE_BLOCK } from "../../supabase/functions/_shared/paige-voice.ts";

// --- Chainable Supabase mock. Every builder method returns `this`; `this` is
// thenable (resolves to {data: list, count}); `.maybeSingle()` resolves to
// {data: single}. Per-table fixtures drive the shape. ---
interface MockBuilder {
  select: () => MockBuilder;
  eq: () => MockBuilder;
  neq: () => MockBuilder;
  order: () => MockBuilder;
  limit: () => MockBuilder;
  then: (resolve: (v: unknown) => void) => void;
  maybeSingle: () => Promise<unknown>;
}
function mockSupabase(fixtures: Record<string, { single?: unknown; list?: unknown[]; count?: number }>) {
  function builder(table: string): MockBuilder {
    const cfg = fixtures[table] || {};
    const b: MockBuilder = {
      select: () => b,
      eq: () => b,
      neq: () => b,
      order: () => b,
      limit: () => b,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: cfg.list ?? null, count: cfg.count ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const NEUTRAL_CTX = (userContext: string, clientContext: string) =>
  buildNeutralCorePrompt({
    dateTimeString: "Monday, August 4, 2026 at 10:00 AM EDT",
    timezoneNote: " (timezone: America/New_York)",
    clientContext,
    memoryBlock: "",
    sessionDocContext: "",
    userContext,
    fetchedUrlContent: "",
    tenantKbContext: "",
  });

// Strip the ONE place credit words are allowed — the persona guardrail that FORBIDS
// them — before scanning the full assembled prompt for leaks.
function stripGuardrail(s: string): string {
  return s.replace(/HARD GUARDRAIL — STAY IN LANE:[\s\S]*?does not provide\./g, "");
}

describe("N5 §2 — bare tenant assembled prompt is credit-free", () => {
  it("emits NO credit/funding content and keeps the HARD GUARDRAIL", async () => {
    const sb = mockSupabase({}); // no user data at all
    const userContext = await buildUserContext(sb, "user-bare", /*fundingEnabled*/ false);
    const persona = buildPaigePersonaBlock(null, "Acme Co", false, null);
    // Assemble in the SAME order the edge function sends: persona → VOICE → neutral core,
    // so the platform-default voice block is covered by the same §2 denylist scan.
    const full = persona + "\n\n" + PAIGE_VOICE_BLOCK + "\n\n" + NEUTRAL_CTX(userContext, "");

    expect(persona).toContain(HARD_GUARDRAIL_MARKER); // guardrail present
    const scanned = stripGuardrail(full);
    expect(CREDIT_DENYLIST.test(scanned)).toBe(false);
    expect(CREDIT_PROGRAM_DENYLIST.test(scanned)).toBe(false);
    // userContext itself carries no credit — only ungated QuickBooks awareness.
    expect(CREDIT_DENYLIST.test(userContext)).toBe(false);
  });
});

describe("§18/§2/§3 — the platform-default VOICE block is finance- and program-clean", () => {
  it("PAIGE_VOICE_BLOCK carries ZERO credit/funding vocab and no program labels", () => {
    // The voice block ships to EVERY tenant by default (§9), so it must be as
    // coaching-generic + finance-free as the neutral core. It is NOT wrapped by the
    // persona HARD-GUARDRAIL, so no strip is needed — it must pass the denylists raw.
    expect(CREDIT_DENYLIST.test(PAIGE_VOICE_BLOCK)).toBe(false);
    expect(CREDIT_PROGRAM_DENYLIST.test(PAIGE_VOICE_BLOCK)).toBe(false);
    // The recency reassert (should-fix #2) is present at the very end, restating that a
    // tenant-authored voice overrides this default.
    expect(PAIGE_VOICE_BLOCK).toContain("TENANT VOICE WINS");
  });
});

describe("N5 §2 — non-funding coaching tenant assembled prompt is credit-free", () => {
  it("renders the tenant's own domain/persona, tasks plainly, and zero credit", async () => {
    const sb = mockSupabase({
      profiles: { single: { full_name: "Dana Lee", city: "Austin", state: "TX" } },
      user_subscriptions: { single: { plan_slug: "pro", status: "active" } },
      tasks: { list: [{ title: "Send onboarding email", status: "pending", track: "client-success" }] },
      businesses: { list: [{ legal_name: "Peak Fitness", business_type: "fitness", entity_type: "LLC" }] },
      documents: { list: [] },
      quickbooks_connections: { single: null },
    });
    const fitnessPlaybook = {
      persona: { name: "Coach P", role: "training assistant", domain: "fitness coaching", tone: "energetic" },
      probingQuestions: [{ ask: "What's your training goal?", captures: "goal" }],
      journey: [{ label: "Intake", description: "Assess baseline" }],
    };
    const userContext = await buildUserContext(sb, "user-fit", false);
    const persona = buildPaigePersonaBlock(fitnessPlaybook, "Peak Fitness", false, null);
    // Same real assembly order (persona → VOICE → neutral core) so the voice block is scanned.
    const full = persona + "\n\n" + PAIGE_VOICE_BLOCK + "\n\n" + NEUTRAL_CTX(userContext, "");

    expect(persona).toContain("fitness coaching"); // tenant domain leads
    expect(persona).toContain(HARD_GUARDRAIL_MARKER);
    expect(userContext).toContain("Send onboarding email"); // tasks shown plainly
    expect(userContext).not.toContain("dispute-related tasks excluded"); // no credit framing
    const scanned = stripGuardrail(full);
    expect(CREDIT_DENYLIST.test(scanned)).toBe(false);
    expect(CREDIT_PROGRAM_DENYLIST.test(scanned)).toBe(false);
  });
});

describe("N5 §2 — the gate is REAL: same data leaks credit only when funding is on", () => {
  it("buildUserContext emits credit for a funding tenant and none for a non-funding tenant", async () => {
    const fx = {
      profiles: { single: { full_name: "Sam", estimated_fico_ex: 690 } },
      quickbooks_connections: { single: null },
      // gated tables — only read when fundingEnabled:
      credit_report_uploads: { list: [] },
      credit_accounts: { count: 0 },
      credit_negative_items: { list: [] },
      banking_relationships: { list: [] },
      businesses: { list: [] },
      business_credit_reports: { single: null },
    };
    const funding = await buildUserContext(mockSupabase(fx), "u", /*fundingEnabled*/ true);
    const nonFunding = await buildUserContext(mockSupabase(fx), "u", /*fundingEnabled*/ false);

    // Funding tenant DOES get credit vertical (the no-report nudge + fundability + business credit).
    expect(CREDIT_DENYLIST.test(funding)).toBe(true);
    expect(funding).toContain("NO CREDIT REPORT UPLOADED YET");
    // Same data, non-funding tenant → zero credit vertical.
    expect(CREDIT_DENYLIST.test(nonFunding)).toBe(false);
    expect(nonFunding).not.toContain("CREDIT REPORT");
  });
});

describe("N5 §37 — sanitizeClientContextForTier drops credit for non-funding", () => {
  const creditCtx =
    "Session: signed in just now\nCurrent page: Dashboard\nCLIENT CONTEXT — Sam\nBureau Scores:\n  Experian: 690 — Pulled by: Chase\nActive Negatives: 2 unique accounts";
  it("keeps the page/session prefix and strips the credit body for non-funding", () => {
    const out = sanitizeClientContextForTier(creditCtx, false);
    expect(out).toContain("Current page: Dashboard");
    expect(CREDIT_DENYLIST.test(out)).toBe(false);
    expect(out).not.toContain("Bureau Scores");
  });
  it("passes credit through untouched for a funding tenant", () => {
    expect(sanitizeClientContextForTier(creditCtx, true)).toBe(creditCtx);
  });
});

// ===========================================================================
// #184 KILL — the persona SCOPE/lane guard is DATA-DRIVEN. These are the
// load-bearing both-directions assertions: the SAME edge code (buildPaigePersonaBlock
// / buildLaneGuardSection), fed two different installed-Blueprint DATA sets, keeps a
// coaching/consulting tenant credit-CLEAN AND puts credit IN-scope for a funding
// tenant — with ZERO vertical named in the edge code. The distinction lives entirely
// in playbook_config.refusal_boundaries (the installed Blueprint's data).
// ===========================================================================

// The credit-clean refusal_boundaries a horizontal (consulting) Blueprint ships —
// mirrors the consulting v1.0.0 manifest (20260805120000).
const CONSULTING_BOUNDARIES = [
  "Don't give licensed legal, tax, or accounting advice — route those to a qualified professional.",
  "Stay inside this engagement's agreed scope; if the client asks for work beyond it, flag a change order to the team rather than absorbing it silently.",
  "Never commit the consultant to a deliverable, deadline, or price without explicit approval.",
  "Never fabricate a result, a delivered output, or a meeting that didn't happen.",
  "Keep every client's and every engagement's information strictly separate.",
];

// The refusal_boundaries the funding Blueprint ships — DECLARE credit/capital in-scope
// (mirrors the funding v1.1.0 manifest).
const FUNDING_BOUNDARIES = [
  "Credit, business credit, funding, lenders, and capital strategy ARE in scope for this practice — raise them when they genuinely help the client get funding-ready.",
  "You are not a licensed attorney, accountant, or investment advisor — for regulated legal, tax, or securities advice, route the client to a qualified professional.",
  "Never guarantee lender approval, a specific credit-score increase, or a funding amount — outcomes depend on the lender and the client's own profile.",
  "Dispute and credit-repair execution is handled by a separate specialist — refer that work out, don't perform it here.",
];

describe("#184 §2 — the SCOPE guard is data-driven, proven BOTH directions from Blueprint data", () => {
  it("CONSULTING (horizontal) Blueprint → credit-CLEAN persona, no vertical named", () => {
    const consultingPlaybook = {
      persona: { name: "Paige", role: "engagement assistant", domain: "business consulting", tone: "sharp" },
      probingQuestions: [{ ask: "What outcome must this engagement deliver?", captures: "objective" }],
      journey: [{ label: "Discovery", description: "Scope and stakeholders" }],
      refusal_boundaries: CONSULTING_BOUNDARIES,
    };
    // financeInScope=false — a consulting tenant never opts into finance.
    const persona = buildPaigePersonaBlock(consultingPlaybook, "Northstar Consulting", false, null);

    // The tenant's OWN boundaries lead — the data-driven SCOPE section is present…
    expect(persona).toContain("SCOPE & BOUNDARIES");
    expect(persona).toContain("business consulting"); // tenant domain leads
    // …and the assembled prompt is entirely credit/funding-free (both directions of the denylist).
    expect(CREDIT_DENYLIST.test(persona)).toBe(false);
    expect(CREDIT_PROGRAM_DENYLIST.test(persona)).toBe(false);
  });

  it("FUNDING (vertical) Blueprint → credit IS in-scope, straight from the boundary DATA", () => {
    const fundingPlaybook = {
      persona: { name: "Paige", role: "funding strategist", domain: "funding and capital-raising coaching", tone: "sharp" },
      probingQuestions: [{ ask: "What are you raising capital for?", captures: "funding_objective" }],
      journey: [{ label: "Assessment", description: "Readiness reviewed" }],
      refusal_boundaries: FUNDING_BOUNDARIES,
    };
    // financeInScope=true — this tenant opted into the is_finance Blueprint.
    const persona = buildPaigePersonaBlock(fundingPlaybook, "Apex Funding", true, null);

    expect(persona).toContain("SCOPE & BOUNDARIES");
    // Credit/funding vocabulary IS present — because the Blueprint DATA declares it in-scope,
    // NOT because any vertical is hardcoded in the edge code.
    expect(CREDIT_DENYLIST.test(persona)).toBe(true);
    expect(persona).toContain("in scope for this practice");
    // And the neutral platform-default guardrail is NOT emitted when the tenant carries boundaries.
    expect(persona).not.toContain(HARD_GUARDRAIL_MARKER);
  });

  it("buildLaneGuardSection: three branches — boundaries win, then finance fallback, then neutral default", () => {
    // (a) boundaries present → data leads regardless of the finance flag.
    expect(buildLaneGuardSection({ refusal_boundaries: CONSULTING_BOUNDARIES }, "Acme", false))
      .toContain("SCOPE & BOUNDARIES");
    // (b) no boundaries + finance-in-scope → generic vertical-free note, no credit words, no neutral guardrail.
    const financeFallback = buildLaneGuardSection({}, "Acme", true);
    expect(CREDIT_DENYLIST.test(financeFallback)).toBe(false);
    expect(financeFallback).not.toContain(HARD_GUARDRAIL_MARKER);
    // (c) no boundaries + not finance → the neutral platform-default guardrail (§2), credit named only to forbid.
    const neutral = buildLaneGuardSection(null, "Acme", false);
    expect(neutral).toContain(HARD_GUARDRAIL_MARKER);
    expect(neutral.trimEnd().endsWith("does not provide.")).toBe(true); // excisable by the denylist test
  });
});

describe("#184 — deriveFinanceInScopeFromFeatures is the GENERIC no-join signal (no vertical literal)", () => {
  it("reads the generic finance_in_scope flag, true for both boolean and string 'true'", () => {
    expect(deriveFinanceInScopeFromFeatures({ finance_in_scope: true })).toBe(true);
    expect(deriveFinanceInScopeFromFeatures({ finance_in_scope: "true" })).toBe(true);
  });
  it("false for a coaching/consulting tenant — and the legacy 'funding' signals no longer flip it", () => {
    expect(deriveFinanceInScopeFromFeatures({})).toBe(false);
    expect(deriveFinanceInScopeFromFeatures(null)).toBe(false);
    // The generic no-join signal deliberately does NOT key on the vertical literal — a
    // tenant flagged only by the legacy features must be BACKFILLED to finance_in_scope
    // (the migration does this); the raw legacy keys alone do not light up this signal.
    expect(deriveFinanceInScopeFromFeatures({ playbook: "funding" })).toBe(false);
    expect(deriveFinanceInScopeFromFeatures({ enabled_skills: ["funding"] })).toBe(false);
  });
});

describe("N5 §9 Leak 3 — program vocab + dispute label come from the Playbook, no hardcoded default", () => {
  it("empty Playbook → no program sequence and a brand-free dispute label", () => {
    expect(buildFundingProgramVocab(null)).toBe("");
    expect(buildFundingProgramVocab({})).toBe("");
    const label = resolveDisputeReferralLabel(null);
    expect(label).toBe("a separate credit-repair specialist");
    expect(/Mogul/i.test(label)).toBe(false);
  });
  it("renders the tenant's OWN programs when the Playbook defines them", () => {
    const vocab = buildFundingProgramVocab({
      funding: {
        programs: [{ label: "Launch", description: "Foundation" }, { label: "Scale" }],
        dispute_referral_label: "the Peak Credit desk",
      },
    });
    expect(vocab).toContain("Launch: Foundation");
    expect(vocab).toContain("Scale");
    expect(vocab).not.toMatch(CREDIT_PROGRAM_DENYLIST); // no ACCEL/BUILD/FUND baked in
    expect(resolveDisputeReferralLabel({ funding: { dispute_referral_label: "the Peak Credit desk" } }))
      .toBe("the Peak Credit desk");
  });
});
