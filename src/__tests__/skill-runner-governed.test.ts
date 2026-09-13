/**
 * THE SKILL-RUN SECURITY MATRIX — proving the direct Edge route governs itself.
 *
 * Two pure modules, exercised as the SHIPPED code (no doubles of the decision):
 *   - `decideSkillRun` (the governed gate) over `decideGovernedExecution` + `classifyAction`.
 *   - `governedDraftAndEmail` (the external-send approval) with INJECTED deps backed by an in-memory
 *     store that enforces the same single-use / minting-request rules the real
 *     `paige_pending_confirmations` claim enforces.
 *
 * WHAT THIS PROVES (the owner's acceptance matrix):
 *   same-tenant caller → allowed · cross-tenant contact → DENIED (scoped-out) · spoofed authority →
 *   DENIED (the gate has no invoker_kind input at all) · tenant NEVER taken from body · service
 *   principal → DENIED · missing/expired/REPLAYED/forged/cross-target approval → DENIED · valid
 *   one-time approval → sent, and it cannot be replayed · on EVERY denied path NO send and NO receipt.
 *
 * WHAT IT DOES NOT PROVE (§13/§32): the authenticated runtime against the deployed function, and the
 * JWT→tenant derivation inside `skill-runner/index.ts` (Deno, not importable here) — that is a
 * separate evidence class, owed to the integrator's live drive, not claimed here.
 */
import { describe, it, expect } from "vitest";
import {
  decideSkillRun,
  SKILL_RUN_CAPABILITY,
  SKILL_DEFAULT_LANE,
  type SkillGovernedInput,
} from "../../supabase/functions/_shared/paige-skill/governed-adapter.ts";
import {
  governedDraftAndEmail,
  type EmailApprovalDeps,
  type EmailApprovalInput,
  type EmailProposalArgs,
  type EmailProposalRow,
} from "../../supabase/functions/_shared/paige-skill/email-approval.ts";
import { confirmFingerprint } from "../../supabase/functions/_shared/confirm-fingerprint.ts";

// ── decideSkillRun — the governed gate ──────────────────────────────────────────────────────────

const gate = (over: Partial<SkillGovernedInput> = {}) =>
  decideSkillRun({
    skillSlug: "draft_and_email_document",
    authenticated: true,
    userId: "user-A",
    principal: "person",
    tenantId: "tenant-A",
    access: { allowed: true },
    autonomyLane: SKILL_DEFAULT_LANE,
    args: {},
    startedAtMs: Date.now(),
    nowIso: new Date().toISOString(),
    ...over,
  });

describe("decideSkillRun — the governed gate", () => {
  it("a same-tenant authenticated owner is ALLOWED (not refused): skill_run is high → propose on confirm", () => {
    const { outcome, audit } = gate();
    expect(outcome.kind).toBe("propose");
    expect(audit.risk).toBe("high");
    expect(audit.capability).toBe(SKILL_RUN_CAPABILITY);
    expect(audit.tenant_id).toBe("tenant-A");
  });

  it("a high skill on a non-auto lane → propose/approval (confirm), and is REFUSED when turned off", () => {
    expect(gate({ autonomyLane: "confirm" }).outcome.kind).toBe("propose");
    const off = gate({ autonomyLane: "off" });
    expect(off.outcome.kind).toBe("refuse");
    if (off.outcome.kind === "refuse") expect(off.outcome.code).toBe("autonomy_off");
  });

  it("high never auto-executes: an `auto` grant is clamped to confirm → propose (no silent send)", () => {
    const { outcome, audit } = gate({ autonomyLane: "auto" });
    expect(outcome.kind).toBe("propose");
    expect(audit.clamped).toBe(true);
    expect(audit.lane_effective).toBe("confirm");
  });

  it("a SERVICE principal acting alone is DENIED (a machine credential is nobody's yes)", () => {
    const { outcome } = gate({ principal: "service", userId: null });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("service_principal_may_not_mutate");
  });

  it("an unauthenticated caller is DENIED", () => {
    const { outcome } = gate({ authenticated: false });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("unauthenticated");
  });

  it("a person with NO resolved tenant is DENIED (tenant is never defaulted)", () => {
    const { outcome } = gate({ tenantId: null });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("tenant_unresolved");
  });

  it("an access-denied verdict (e.g. authority not established) is DENIED — access is never permissive", () => {
    const { outcome } = gate({ access: { allowed: false, reason: "not authorized" } });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("access_denied");
  });

  it("the acting tenant is NEVER taken from the body: a tenant_id/role/invoker_kind embedded in args is inert", () => {
    // The adapter has no `invoker_kind` input at all, and `args` is passed only as requestArgs — never
    // read for a governance value. A forged tenant/role/confirm in the inputs cannot move the decision.
    const { audit } = gate({
      tenantId: "tenant-A",
      args: { tenant_id: "tenant-B", invoker_kind: "admin", role: "super_admin", confirm: true },
    });
    expect(audit.tenant_id).toBe("tenant-A"); // the resolved tenant, not the body's
  });
});

// ── governedDraftAndEmail — the durable, single-use, fingerprint-bound approval ───────────────────

type StoredRow = {
  args: EmailProposalArgs;
  userId: string;
  tenantId: string;
  fingerprint: string;
  nonce: string;
  serverIssued: boolean;
  expired: boolean;
  consumed: boolean;
};

/** An in-memory stand-in for paige_pending_confirmations that enforces the SAME rules the real claim
 *  enforces: single-use (compare-and-set on consumed), server-issued-only, and the minting-request
 *  exclusion. `recordProposal`/`claimProposal` are the only way in or out. */
function makeStore(opts: { expired?: boolean; sendFails?: boolean } = {}) {
  const rows: StoredRow[] = [];
  const calls = { draft: 0, send: 0, receipt: 0, record: 0, claim: 0 };
  const sends: Array<{ to: string; subject: string; html: string; fromHeader: string }> = [];

  async function realSha256Hex(s: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const deps: EmailApprovalDeps = {
    draft: async () => {
      calls.draft++;
      return "<div>drafted body</div>";
    },
    resolveSender: async () => ({ fromName: "Coach A", fromEmail: "coach-a@tenant-a.example" }),
    fingerprint: confirmFingerprint,
    sha256Hex: realSha256Hex,
    recordProposal: async (row: EmailProposalRow) => {
      calls.record++;
      const live = rows.find((r) => r.userId === row.userId && r.fingerprint === row.fingerprint && !r.consumed && r.serverIssued);
      if (live) return "exists";
      rows.push({
        args: row.args, userId: row.userId, tenantId: row.tenantId, fingerprint: row.fingerprint,
        nonce: row.requestNonce, serverIssued: true, expired: !!opts.expired, consumed: false,
      });
      return "created";
    },
    claimProposal: async ({ userId, tenantId, fingerprint, requestNonce }) => {
      calls.claim++;
      // The atomic compare-and-set: the FIRST matching, unconsumed, server-issued, unexpired row NOT
      // minted by this request is consumed and returned; everything else yields null.
      const r = rows.find((r) =>
        r.userId === userId && r.tenantId === tenantId && r.fingerprint === fingerprint &&
        r.serverIssued && !r.expired && !r.consumed && r.nonce !== requestNonce);
      if (!r) return null;
      r.consumed = true; // single-use, set in the same step that reads it
      return r.args;
    },
    send: async (p) => {
      calls.send++;
      sends.push(p);
      return opts.sendFails ? { ok: false, id: null } : { ok: true, id: `resend_${calls.send}` };
    },
    recordReceipt: async () => {
      calls.receipt++;
    },
  };
  return { deps, calls, sends, rows };
}

const input = (over: Partial<EmailApprovalInput> = {}): EmailApprovalInput => ({
  tenantId: "tenant-A",
  userId: "user-A",
  contactId: "contact-A",
  recipientEmail: "client-a@example.com",
  contactTenantId: "tenant-A",
  recipientName: "Client A",
  docType: "summary",
  prompt: "write a recap",
  requestNonce: "req-mint",
  ...over,
});

describe("governedDraftAndEmail — durable single-use fingerprint-bound approval", () => {
  it("PHASE 1 (no approval): drafts, records a proposal, asks — and sends NOTHING", async () => {
    const s = makeStore();
    const out = await governedDraftAndEmail(input(), s.deps);
    expect(out.kind).toBe("awaiting_confirm");
    if (out.kind === "awaiting_confirm") expect(out.confirm_fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(s.calls.draft).toBe(1);
    expect(s.calls.record).toBe(1);
    expect(s.calls.send).toBe(0);       // NO send on phase 1
    expect(s.calls.receipt).toBe(0);    // NO receipt on phase 1
  });

  it("cross-tenant contact_id (scoped-out) → DENIED, with NO draft, NO send, NO receipt", async () => {
    const s = makeStore();
    // A cross-tenant contact_id resolves to no row under the caller's tenant → recipient/contactTenant null.
    const out = await governedDraftAndEmail(input({ recipientEmail: null, contactTenantId: null }), s.deps);
    expect(out.kind).toBe("denied");
    if (out.kind === "denied") expect(out.code).toBe("contact_not_in_workspace");
    expect(s.calls.draft).toBe(0);
    expect(s.calls.send).toBe(0);
    expect(s.calls.receipt).toBe(0);
  });

  it("a scoped contact whose tenant disagrees with the caller → DENIED (defense-in-depth), NO send", async () => {
    const s = makeStore();
    const out = await governedDraftAndEmail(input({ contactTenantId: "tenant-B" }), s.deps);
    expect(out.kind).toBe("denied");
    if (out.kind === "denied") expect(out.code).toBe("tenant_scope_mismatch");
    expect(s.calls.send).toBe(0);
    expect(s.calls.receipt).toBe(0);
  });

  it("a VALID one-time approval → sent once (to the stored recipient/sender), with a receipt", async () => {
    const s = makeStore();
    const mint = await governedDraftAndEmail(input(), s.deps);
    expect(mint.kind).toBe("awaiting_confirm");
    const token = mint.kind === "awaiting_confirm" ? mint.confirm_fingerprint : "";
    // Phase 2 is a SEPARATE request → a different nonce, so the minting request cannot redeem.
    const out = await governedDraftAndEmail(input({ confirmToken: token, requestNonce: "req-claim" }), s.deps);
    expect(out.kind).toBe("sent");
    expect(s.calls.send).toBe(1);
    expect(s.calls.receipt).toBe(1);
    expect(s.sends[0].to).toBe("client-a@example.com");
    expect(s.sends[0].fromHeader).toBe("Coach A <coach-a@tenant-a.example>");
  });

  it("a REPLAYED approval (same token, after consumption) → DENIED, NO second send, NO second receipt", async () => {
    const s = makeStore();
    const mint = await governedDraftAndEmail(input(), s.deps);
    const token = mint.kind === "awaiting_confirm" ? mint.confirm_fingerprint : "";
    const first = await governedDraftAndEmail(input({ confirmToken: token, requestNonce: "req-claim-1" }), s.deps);
    expect(first.kind).toBe("sent");
    const replay = await governedDraftAndEmail(input({ confirmToken: token, requestNonce: "req-claim-2" }), s.deps);
    expect(replay.kind).toBe("denied");
    if (replay.kind === "denied") expect(replay.code).toBe("approval_not_valid");
    expect(s.calls.send).toBe(1);    // still only the ONE send
    expect(s.calls.receipt).toBe(1); // still only the ONE receipt
  });

  it("a FORGED token (never minted) → DENIED, NO send", async () => {
    const s = makeStore();
    const out = await governedDraftAndEmail(input({ confirmToken: "deadbeefdeadbeef", requestNonce: "req-x" }), s.deps);
    expect(out.kind).toBe("denied");
    if (out.kind === "denied") expect(out.code).toBe("approval_not_valid");
    expect(s.calls.send).toBe(0);
    expect(s.calls.receipt).toBe(0);
  });

  it("an EXPIRED approval → DENIED, NO send", async () => {
    const s = makeStore({ expired: true });
    const mint = await governedDraftAndEmail(input(), s.deps);
    const token = mint.kind === "awaiting_confirm" ? mint.confirm_fingerprint : "";
    const out = await governedDraftAndEmail(input({ confirmToken: token, requestNonce: "req-claim" }), s.deps);
    expect(out.kind).toBe("denied");
    expect(s.calls.send).toBe(0);
  });

  it("the MINTING request cannot redeem its own token (same nonce) → DENIED, NO send", async () => {
    const s = makeStore();
    const mint = await governedDraftAndEmail(input({ requestNonce: "req-same" }), s.deps);
    const token = mint.kind === "awaiting_confirm" ? mint.confirm_fingerprint : "";
    // Redeem with the SAME nonce the row was minted under — the canonical minting-request exclusion.
    const out = await governedDraftAndEmail(input({ confirmToken: token, requestNonce: "req-same" }), s.deps);
    expect(out.kind).toBe("denied");
    expect(s.calls.send).toBe(0);
  });

  it("a token from tenant A cannot be claimed by a session resolved to tenant B → DENIED", async () => {
    const s = makeStore();
    const mint = await governedDraftAndEmail(input({ tenantId: "tenant-A" }), s.deps);
    const token = mint.kind === "awaiting_confirm" ? mint.confirm_fingerprint : "";
    // Same token, but the caller now resolves to tenant-B (and a tenant-B contact). The claim predicate
    // binds tenant_id, so the A-minted row never matches.
    const out = await governedDraftAndEmail(
      input({ tenantId: "tenant-B", contactTenantId: "tenant-B", confirmToken: token, requestNonce: "req-b" }),
      s.deps,
    );
    expect(out.kind).toBe("denied");
    expect(s.calls.send).toBe(0);
  });

  it("a FAILED send (Resend rejects / no key) is NEVER reported as sent — §13 — and the approval is still consumed", async () => {
    const s = makeStore({ sendFails: true });
    const mint = await governedDraftAndEmail(input(), s.deps);
    const token = mint.kind === "awaiting_confirm" ? mint.confirm_fingerprint : "";
    const out = await governedDraftAndEmail(input({ confirmToken: token, requestNonce: "req-claim" }), s.deps);
    expect(out.kind).toBe("send_failed");   // NOT "sent" — a fire is not a delivery
    expect(s.calls.send).toBe(1);           // the send was attempted
    expect(s.calls.receipt).toBe(1);        // an HONEST failure receipt is still written (status failed)
    // consume-then-execute: the one-time approval is spent even though the send failed → replay denied.
    const replay = await governedDraftAndEmail(input({ confirmToken: token, requestNonce: "req-claim-2" }), s.deps);
    expect(replay.kind).toBe("denied");
    expect(s.calls.send).toBe(1);           // no second send
  });

  it("the fingerprint BINDS recipient, sender, doc_type and content — any change yields a different token", async () => {
    const base = { action: "draft_and_email_document", tenant_id: "t", contact_id: "c", recipient: "a@x", from_email: "s@x", from_name: "S", doc_type: "summary", content_sha256: "hash1" };
    const fp = (o: Record<string, unknown>) => confirmFingerprint("draft_and_email_document", o);
    const baseFp = await fp(base);
    expect(await fp({ ...base, recipient: "b@x" })).not.toBe(baseFp);      // recipient
    expect(await fp({ ...base, from_email: "s2@x" })).not.toBe(baseFp);    // sender identity
    expect(await fp({ ...base, doc_type: "invoice" })).not.toBe(baseFp);   // document kind
    expect(await fp({ ...base, content_sha256: "hash2" })).not.toBe(baseFp); // drafted content
    expect(await fp({ ...base })).toBe(baseFp);                            // identical → stable
  });
});
