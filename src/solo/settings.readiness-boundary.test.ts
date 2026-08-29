import { describe, expect, it } from "vitest";
import { READINESS_COPY } from "./settings";

/**
 * The tenant-facing boundary, locked.
 *
 * Owner ruling: the Connections surface may show readiness, what is missing,
 * safe preparation steps and a clear next action — and must NOT ship
 * credential-vulnerability details, webhook naming details, or internal
 * ownership diagnostics to tenant users.
 *
 * These strings are the entire tenant-facing explanation of why texting is not
 * ready, so this is where that boundary is enforceable.
 */

/** Every reason `tenant_comms_readiness()` can return in `blocked_reason`. */
const BLOCKED_REASONS = [
  "messaging_account_missing",
  "messaging_account_inactive",
  "no_sms_number",
  "registration_absent",
  "registration_not_approved",
  "no_consent_recorded",
] as const;

/** Words that would leak platform internals, a vulnerability, or who owns a repair. */
const FORBIDDEN = [
  "vault", "auth_token", "api key", "api_key", "credential", "secret", "token",
  "webhook", "twilio", "subaccount", "sid", "signature",
  "rls", "policy", "migration", "service role", "service_role",
  "lane b", "claude", "engineering", "backend", "internal",
  "vulnerab", "exploit", "cross-tenant", "handler", "endpoint", "rpc",
  "table", "column", "supabase", "edge function",
];

describe("tenant-facing readiness copy", () => {
  it("covers every blocking reason the resolver can return", () => {
    for (const reason of BLOCKED_REASONS) {
      expect(READINESS_COPY[reason], `no copy for ${reason}`).toBeTruthy();
      expect(READINESS_COPY[reason].headline.length).toBeGreaterThan(0);
      expect(READINESS_COPY[reason].next.length).toBeGreaterThan(0);
    }
  });

  it("uses the ruled fallback headline whenever texting is not ready", () => {
    for (const reason of BLOCKED_REASONS) {
      expect(READINESS_COPY[reason].headline).toBe("Texting is not ready yet");
    }
  });

  it("never leaks a credential, webhook, or internal-ownership detail to a tenant", () => {
    for (const [reason, copy] of Object.entries(READINESS_COPY)) {
      const text = `${copy.headline} ${copy.next}`.toLowerCase();
      for (const term of FORBIDDEN) {
        expect(text.includes(term), `"${reason}" copy leaks "${term}": ${text}`).toBe(false);
      }
    }
  });

  it("gives a next step, not just a refusal", () => {
    for (const [reason, copy] of Object.entries(READINESS_COPY)) {
      // A bare restatement of the headline is not a next step.
      expect(copy.next.toLowerCase(), reason).not.toBe(copy.headline.toLowerCase());
      expect(copy.next.split(" ").length, reason).toBeGreaterThan(6);
    }
  });
});
