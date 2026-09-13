// @vitest-environment node
//
// The shared business-verifier response classifier (§18/§37, Codex #1222 + #1228). Proves the exact
// mapping the two server-to-server callers (skill-runner verify_business_sos, paige-mcp verify_business)
// now apply, against EVERY real business-verifier response shape — so a refusal is never recorded as a
// success (§13) and an OPERATIONAL failure is never buried as a policy cancellation (#1228 P2). This is
// the boundary test Codex #1228 asked for: the caller propagation is proven here, not only traced.
import { describe, it, expect } from "vitest";
import {
  classifyBusinessVerifyResponse,
  type BusinessVerifyCallerOutcome,
} from "../../supabase/functions/_shared/business-verify-outcome.ts";

// The real business-verifier return shapes (from supabase/functions/business-verifier/index.ts):
const cases: Array<{ name: string; httpOk: boolean; body: unknown; expect: BusinessVerifyCallerOutcome }> = [
  // Runs that HAPPENED — the only success signal is ok:true (even a status:"failed" no-match is a real run).
  { name: "succeeded run (200, ok:true)", httpOk: true, body: { ok: true, run_id: "r1", status: "succeeded", composite_score: 82 }, expect: "ran" },
  { name: "partial run (200, ok:true)", httpOk: true, body: { ok: true, run_id: "r1", status: "partial" }, expect: "ran" },
  { name: "no-match run status:failed (200, ok:true)", httpOk: true, body: { ok: true, run_id: "r1", status: "failed" }, expect: "ran" },
  { name: "missing-legal-name run (200, ok:true, status:failed)", httpOk: true, body: { ok: true, run_id: "r1", status: "failed" }, expect: "ran" },

  // POLICY refusal — the Funding & Coaching Tools gate is the ONLY HTTP-200 path that sets `result`.
  { name: "funding gate unavailable (200, ok:false, result:unavailable)", httpOk: true, body: { ok: false, available: false, result: "unavailable", state: "entitlement_missing", error: "FUNDING_TOOLS_UNAVAILABLE" }, expect: "policy_refusal" },
  { name: "funding gate setup_required (200, ok:false, result:setup_required)", httpOk: true, body: { ok: false, available: false, result: "setup_required", state: "connection_missing", error: "FUNDING_TOOLS_SETUP_REQUIRED" }, expect: "policy_refusal" },

  // OPERATIONAL failures — HTTP-200 ok:false service errors (Codex #1228 P2: must be `failed`, never `cancelled`).
  { name: "BUSINESS_LOOKUP_FAILED (200, ok:false)", httpOk: true, body: { ok: false, error: "BUSINESS_LOOKUP_FAILED", fallback: true }, expect: "operational_failure" },
  { name: "BUSINESS_VERIFICATION_FAILED catch-all (200, ok:false)", httpOk: true, body: { ok: false, error: "BUSINESS_VERIFICATION_FAILED", fallback: true }, expect: "operational_failure" },
  { name: "BUSINESS_NOT_FOUND (200, ok:false)", httpOk: true, body: { ok: false, error: "BUSINESS_NOT_FOUND", business_id: "b1" }, expect: "operational_failure" },

  // Transport / authorization failures — non-2xx.
  { name: "authz 403 NOT_AUTHORIZED", httpOk: false, body: { ok: false, error: "NOT_AUTHORIZED", message: "…" }, expect: "operational_failure" },
  { name: "401 unauthorized", httpOk: false, body: { error: "unauthorized" }, expect: "operational_failure" },
  { name: "5xx with empty body", httpOk: false, body: {}, expect: "operational_failure" },
];

describe("classifyBusinessVerifyResponse — outcome mapping for server-to-server callers", () => {
  for (const c of cases) {
    it(c.name + " → " + c.expect, () => {
      expect(classifyBusinessVerifyResponse(c.httpOk, c.body as { ok?: unknown; result?: unknown })).toBe(c.expect);
    });
  }

  it("a policy `result` on a non-2xx is still an operational failure (result only means policy on a 2xx)", () => {
    // Defensive: `result` should only ever accompany a 200 refusal; if a non-2xx somehow carried it, the
    // transport failure still dominates — we never treat a non-2xx as a benign policy cancel.
    expect(classifyBusinessVerifyResponse(false, { ok: false, result: "unavailable" })).toBe("operational_failure");
  });

  it("null / unparseable body on a 2xx is treated as a run (matches business-verifier always emitting ok)", () => {
    // paige-mcp's `.catch(() => ({}))` yields {} on a parse failure; business-verifier always emits valid
    // JSON with an `ok` field, so this only guards against a malformed 2xx — kept as the prior behavior.
    expect(classifyBusinessVerifyResponse(true, {})).toBe("ran");
    expect(classifyBusinessVerifyResponse(true, null)).toBe("ran");
  });
});
