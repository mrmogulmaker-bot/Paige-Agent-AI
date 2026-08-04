// N5 §2 de-hardcode — Layer A assembly assertion (§32: a green build is not proof;
// the FULL assembled client prompt for a bare / non-funding tenant must carry ZERO
// credit/funding vertical content, and the funding vertical must reach a client
// ONLY when the tenant opted in. This test would FAIL on the pre-N5 live code
// (the ungated userContext injected "❌ NO CREDIT REPORT UPLOADED YET…" into every
// tenant's prompt) — that failure is the point.
import { describe, expect, it } from "vitest";
import {
  buildFundingProgramVocab,
  buildNeutralCorePrompt,
  buildPaigePersonaBlock,
  buildUserContext,
  CREDIT_DENYLIST,
  CREDIT_PROGRAM_DENYLIST,
  HARD_GUARDRAIL_MARKER,
  resolveDisputeReferralLabel,
  sanitizeClientContextForTier,
} from "../../supabase/functions/_shared/client-context.ts";

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
    const full = persona + "\n\n" + NEUTRAL_CTX(userContext, "");

    expect(persona).toContain(HARD_GUARDRAIL_MARKER); // guardrail present
    const scanned = stripGuardrail(full);
    expect(CREDIT_DENYLIST.test(scanned)).toBe(false);
    expect(CREDIT_PROGRAM_DENYLIST.test(scanned)).toBe(false);
    // userContext itself carries no credit — only ungated QuickBooks awareness.
    expect(CREDIT_DENYLIST.test(userContext)).toBe(false);
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
    const full = persona + "\n\n" + NEUTRAL_CTX(userContext, "");

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
