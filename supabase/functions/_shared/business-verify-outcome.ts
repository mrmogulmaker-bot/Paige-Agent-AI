// THE ONE HOME (§18) for reading a `business-verifier` HTTP response as a SERVER-to-server caller.
//
// WHY THIS EXISTS (§37/§13, Codex #1222 + #1228). `business-verifier` signals its outcome in a way a
// caller that keys on HTTP STATUS alone mis-reads:
//   • a run that HAPPENED  → HTTP 200 + `{ ok:true, ... }` — even a `status:"failed"` no-match run is
//     still `ok:true` (a real verification that found no match), so `ok:true` is the ONLY success signal;
//   • a POLICY refusal     → HTTP 200 + `{ ok:false, result:"setup_required"|"unavailable" }` — the
//     Funding & Coaching Tools gate refusing BEFORE any provider contact (the only paths that set
//     `result`). Stopped before a deliverable by policy, exactly like the interpreter's needs_config/denied;
//   • an OPERATIONAL failure → an authz 403, any 4xx/5xx, OR HTTP 200 + `{ ok:false }` with an operational
//     error (`BUSINESS_LOOKUP_FAILED` / `BUSINESS_NOT_FOUND` / `BUSINESS_VERIFICATION_FAILED`). A real
//     failure a caller must surface to status-based monitoring/retry — NEVER a success and NEVER a policy
//     cancellation (Codex #1228 P2: conflating a DB/service error with a policy refusal hides real failures).
//
// A caller keying on HTTP status alone records a policy refusal (HTTP 200) as SUCCESS (§13 "a fire is not a
// delivery"). This classifier is pure + exported so BOTH callers (skill-runner, paige-mcp) read the OUTCOME,
// and the mapping is unit-tested here rather than only traced by review.

export type BusinessVerifyCallerOutcome = "ran" | "policy_refusal" | "operational_failure";

/**
 * Classify a `business-verifier` response for a server-to-server caller.
 * @param httpOk  whether the HTTP status is 2xx (`res.ok`, or `r.status < 300`).
 * @param body    the parsed JSON body (may be null/`{}` if parsing failed).
 */
export function classifyBusinessVerifyResponse(
  httpOk: boolean,
  body: { ok?: unknown; result?: unknown } | null | undefined,
): BusinessVerifyCallerOutcome {
  // A run that happened: 2xx AND a LITERAL `ok:true`. business-verifier emits `ok:true` for every run that
  // executed (incl. a `status:"failed"` no-match), so `ok === true` is the ONLY success signal — a
  // malformed / empty 2xx (e.g. paige-mcp's `{}` JSON-parse fallback, or any body missing `ok`) is NOT a
  // run and must never be reported as a successful verification (§13; Codex #1228 P2). Fail closed.
  if (httpOk && body?.ok === true) return "ran";
  // A policy refusal: the funding-gate refusal is the ONLY HTTP-200 path that sets `result`.
  if (httpOk && (body?.result === "setup_required" || body?.result === "unavailable")) return "policy_refusal";
  // Everything else non-success (authz 403, 4xx/5xx, a 200 operational error, or a malformed 2xx) is a
  // real failure a caller must surface to monitoring/retry — never a benign policy cancel, never a success.
  return "operational_failure";
}
