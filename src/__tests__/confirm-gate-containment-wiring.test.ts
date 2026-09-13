/**
 * P0 — consequential-action confirm gate: batch repair + honest containment (2026-09-13).
 *
 * The edge handler `paige-ai-chat/index.ts` cannot be unit-executed (Deno + a live Supabase client),
 * so these are SOURCE-ASSERTIONS over the shipped handler — the same proof class as
 * task-thread-link-wiring.test.ts. They pin that the three fixes are wired as designed and that the
 * hard invariants are not weakened. The PURE decision primitive (confirmIdentityValue) is proven
 * behaviourally in confirm-fingerprint.test.ts; the authenticated end-to-end battery (benign
 * dismissal, batch resolve, expired/replayed/forged/cross-tenant, receipt/Rail, no-outbound) is
 * PROOF OWED against the deployed surface (§32.c) — recorded, not faked.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const HANDLER = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");
// The confirm gate (autoMode === "confirm") through the end of its !approvedArgs handling. The block
// runs ~8346–8560; slice generously by characters so every assertion lands inside it.
const gateStart = HANDLER.indexOf('if (autoMode === "confirm") {');
const gate = HANDLER.slice(gateStart, gateStart + 26000);

describe("FIX A — a batch is disambiguated by the stable subject id, WITHIN the approved set", () => {
  it("imports the batch-disambiguation primitives from the one home (§18)", () => {
    expect(HANDLER).toMatch(
      /import\s*\{[^}]*\bCONFIRM_IDENTITY_KEY\b[^}]*\bconfirmIdentityValue\b[^}]*\}\s*from\s*["']\.\.\/_shared\/confirm-fingerprint\.ts["']/,
    );
  });

  it("narrows the APPROVED-SET lookup by the call's subject id — never widens what is claimable", () => {
    // The narrowing filter is applied to the same query that is scoped `.in("fingerprint", approvedConfirmations)`,
    // so it can only ever select a proposal the operator already approved.
    expect(gate).toContain('.in("fingerprint", [...approvedConfirmations])');
    // The jsonb-text narrow uses the proven `.filter(col,"eq",val)` form (not `.eq` shorthand).
    expect(gate).toContain('lookup = lookup.filter(`args->>${identityKey}`, "eq", identityVal)');
    // The narrowed claim still requires exactly one match and that it is in the approved set.
    expect(gate).toContain("matches?.length === 1");
    expect(gate).toContain("approvedConfirmations.has(matches[0].fingerprint)");
  });

  it("the narrowed claim still runs STORED args (I2) — the gate overwrites arguments with the approved call", () => {
    expect(gate).toContain("tc.function.arguments = JSON.stringify(approvedArgs)");
  });

  it("keeps the predate-the-turn (I3) and scope (I4) predicates on the narrowed lookup", () => {
    expect(gate).toContain('.neq("issued_in_request", requestNonce)');
    // tenant / thread / scoped_client scoping is applied to the lookup (IS NOT DISTINCT FROM for nulls).
    expect(gate).toMatch(/lookup = personaCtx\?\.tenant_id \? lookup\.eq\("tenant_id"/);
    expect(gate).toMatch(/lookup = scopedClientId \? lookup\.eq\("scoped_client_id"/);
  });
});

describe("FIX B — an ambiguous approval ends in ONE truthful terminal, never a re-ask loop", () => {
  it("presents the owner-required state verbatim, with a correlation id, and records NOTHING", () => {
    const term = gate.indexOf("execution_unavailable: true");
    expect(term).toBeGreaterThan(-1);
    expect(gate).toContain("Action execution is temporarily unavailable; nothing changed or sent.");
    expect(gate).toContain("correlation_id: requestNonce");
    // The terminal must come BEFORE recordConfirmation and end in `continue`, so no fresh proposal is
    // minted (that is what stopped the accumulation loop).
    const recordIdx = gate.indexOf("const recorded = await recordConfirmation(fp");
    expect(recordIdx).toBeGreaterThan(term);
  });

  it("only fires when the operator is approving AND the batch is genuinely ambiguous (never on a first ask)", () => {
    // Primary signal: the approved-set lookup found ≥1 but resolved no single fingerprint.
    expect(gate).toContain("approvedSetAmbiguous = true");
    expect(gate).toContain("let ambiguousApproval = approvedSetAmbiguous");
    // The typed-yes (no card) branch only considers it ambiguous at ≥2 live proposals.
    expect(gate).toContain("(pendRows?.length ?? 0) >= 2");
  });

  it("GUARD (adversary #2): ambiguity is only flagged on an actual approval attempt, not a fresh confirm:false", () => {
    expect(gate).toContain("(identityVal !== null || gateArgs.confirm === true)) approvedSetAmbiguous = true");
  });
});

describe("GUARD (adversary #1) — the model's word can only claim on a CARD-LESS surface", () => {
  it("by-scope (claimBy=null) is gated on approvedConfirmations.size === 0 — never when a card was echoed", () => {
    // When the surface echoed approvals, only the echoed fingerprint (surfaceApproved) may claim; the
    // model-asserted by-scope path cannot reach an unapproved leftover proposal.
    expect(gate).toContain("(modelAsserted && !highRisk && approvedConfirmations.size === 0)");
    // high-risk is still never model-asserted (I6), independent of this guard.
    expect(gate).toContain("modelAsserted && !highRisk");
  });

  it("the terminal NEVER executes — it only pushes a success:false tool result and continues", () => {
    // Isolate the ambiguous-approval block and prove there is no RPC/insert/continue-to-exec inside it.
    const t = gate.indexOf("if (ambiguousApproval) {");
    expect(t).toBeGreaterThan(-1);
    const block = gate.slice(t, t + 1400);
    expect(block).toContain("success: false");
    expect(block).toContain("continue;");
    expect(block).not.toMatch(/\.rpc\(|\.insert\(|tc\.function\.arguments\s*=/);
  });
});

describe("FIX C — a bug-report/improvement that cannot be filed says so; it never claims it was", () => {
  const imp = (() => {
    // Anchor on a marker unique to the executor (not the tool definition or the dispatch gate).
    const i = HANDLER.indexOf("const impTenantId = personaCtx?.tenant_id ?? null;");
    return HANDLER.slice(i - 1200, i + 2000);
  })();

  it("no longer THROWS on a tenant-less (operator) caller — it returns an honest unavailable", () => {
    expect(imp).not.toContain('throw new Error("improvement tools require a resolved tenant")');
    expect(imp).toContain('availability: "unavailable"');
    expect(imp).toContain("so nothing was filed");
  });

  it("the role refusal instructs an honest 'nothing was filed' report (never a false 'filed')", () => {
    expect(imp).toContain("Improvement proposals are restricted to admins and coaches.");
    expect(imp).toContain("Nothing was filed");
  });

  it("still WRITES only for an authorized caller with a resolved tenant (gate not weakened)", () => {
    // The insert is still guarded by the role check and a non-null impTenantId above it.
    expect(imp).toContain("if (!(isAdmin || isCoach))");
    expect(imp).toContain('.from("paige_improvement_proposals").insert(');
    expect(imp).toContain("tenant_id: impTenantId");
  });
});
