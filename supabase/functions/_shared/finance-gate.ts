// _shared/finance-gate.ts — the canonical §2 finance classifier (ONE home, §18).
//
// Funding/credit specialists are a per-tenant OPT-IN offer, never a platform default and never
// shown to (or invocable by) a tenant that hasn't turned the funding offer on. Two surfaces enforce
// this and MUST agree on what "looks like finance":
//   • subagent-forge — blocks CREATION of a finance agent as a platform default, or for a
//     non-funding tenant (§2 at author time).
//   • paige-orchestrator — hides/*blocks INVOCATION of* a finance agent for a non-funding tenant
//     (§2/#206 at read time — the leak this shared home closes).
// They previously each carried their own copy of the domain set + keyword regex; the orchestrator's
// copy had only the domain half, so an agent classified finance by KEYWORD (but not domain) slipped
// through. Sharing the classifier removes that skew for good.
//
// The signal is domain OR text: an agent whose `domain` is a known finance domain, OR whose
// name/description/system_prompt trips the finance keyword set. Fails toward HIDING (§2 safe
// direction: a non-funding tenant never sees funding content).

/** Known finance domains — an exact (lowercased) match flags the agent as finance. */
export const FINANCE_DOMAINS = new Set(["credit", "funding", "fundability"]);

/** Finance vocabulary — a match in the agent's text flags it even when the domain label doesn't. */
export const FINANCE_KEYWORDS =
  /\b(loan|lender|credit\s*repair|credit\s*score|funding|fundability|underwrit|tradeline|dispute\s*letter)\b/i;

/**
 * True when an agent reads as a funding/credit specialist by its domain OR its text.
 * §2: such an agent is a per-tenant opt-in — never a platform default, never surfaced to a tenant
 * without funding enabled. Accepts whatever fields the caller has (missing fields are ignored).
 */
export function looksLikeFinanceAgent(fields: {
  domain?: unknown;
  name?: unknown;
  description?: unknown;
  system_prompt?: unknown;
}): boolean {
  const domain = String(fields.domain ?? "").toLowerCase();
  const blob = `${fields.name ?? ""} ${fields.description ?? ""} ${fields.system_prompt ?? ""}`;
  return FINANCE_DOMAINS.has(domain) || FINANCE_KEYWORDS.test(blob);
}
