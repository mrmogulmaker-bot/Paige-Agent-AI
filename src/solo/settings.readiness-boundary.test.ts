import { describe, expect, it } from "vitest";
import {
  billingStep, consentStep, deliveryStep, phoneStep, readinessSteps, registrationStep,
  READINESS_COPY, stepByName, type CommsReadiness, type Step } from "./settings";

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

/**
 * Every reason `tenant_comms_readiness()` can return in `blocked_reason`.
 * Kept in sync with the CASE in
 * `supabase/migrations/20261002000000_comms_credential_lockdown_and_readiness.sql`.
 */
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
  // Billing reaches this surface now. The processor and its identifiers are
  // provider payload, never tenant-facing copy (§38 — Paige holds the rail,
  // the tenant never sees its plumbing).
  "stripe", "sub_", "cus_", "price_", "processor",
  // §2: "practice" is banned in shipped copy pending HIPAA/SOC-2; the ruled
  // inclusive words are business / company.
  "practice",
  // An unbacked claim that someone is already acting on it. Nothing in this
  // change creates an alert, a ticket or a queue entry (§13).
  "we are looking into", "we're looking into",
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

/**
 * The billing row of the ladder. Connections owns billing setup, so its copy
 * crosses the same tenant-facing boundary as every blocking reason and is locked
 * the same way.
 */
const BILLING_CASES: Array<{ name: string; billing: CommsReadiness["billing"] }> = [
  { name: "no plan on file", billing: { subscription: "absent", plan_name: null, period_end: null, cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0 } },
  { name: "plan not active", billing: { subscription: "inactive", plan_name: "Solo", period_end: null, cancel_at_period_end: true, usage_metering: "not_recording", metered_events_30d: 0 } },
  { name: "active, nothing metered", billing: { subscription: "active", plan_name: "Solo", period_end: "2026-09-19T00:00:00Z", cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0 } },
  { name: "active, one event metered", billing: { subscription: "active", plan_name: "Solo", period_end: "2026-09-19T00:00:00Z", cancel_at_period_end: false, usage_metering: "recording", metered_events_30d: 1 } },
  { name: "active, many events metered", billing: { subscription: "active", plan_name: "Solo", period_end: "2026-09-19T00:00:00Z", cancel_at_period_end: false, usage_metering: "recording", metered_events_30d: 12 } },
  { name: "active with no plan name", billing: { subscription: "active", plan_name: null, period_end: null, cancel_at_period_end: false, usage_metering: "recording", metered_events_30d: 3 } },
];

describe("tenant-facing billing copy", () => {
  it("says something for every billing state the resolver can return", () => {
    for (const { name, billing } of BILLING_CASES) {
      const row = billingStep(billing);
      expect(row.state.length, name).toBeGreaterThan(0);
      expect(row.detail.length, name).toBeGreaterThan(0);
    }
  });

  it("never leaks the payment processor or a provider identifier", () => {
    for (const { name, billing } of BILLING_CASES) {
      const row = billingStep(billing);
      const text = `${row.state} ${row.detail}`.toLowerCase();
      for (const term of FORBIDDEN) {
        expect(text.includes(term), `${name} leaks "${term}": ${text}`).toBe(false);
      }
    }
  });

  it("never claims usage is billed while nothing is being recorded", () => {
    const row = billingStep({
      subscription: "active", plan_name: "Solo", period_end: null,
      cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0,
    });
    // An active plan alone must not read as a settled, green state.
    expect(row.truth).not.toBe("LIVE");
    expect(row.detail.toLowerCase()).toContain("not being recorded");
  });

  it("does not present an absent plan as a failure the tenant caused", () => {
    const row = billingStep({
      subscription: "absent", plan_name: null, period_end: null,
      cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0,
    });
    expect(row.tone).toBe("neutral");
    expect(row.truth).toBe("UNAVAILABLE");
  });

  it("counts one metered event in the singular", () => {
    const one = billingStep({ subscription: "active", plan_name: "Solo", period_end: null, cancel_at_period_end: false, usage_metering: "recording", metered_events_30d: 1 });
    const many = billingStep({ subscription: "active", plan_name: "Solo", period_end: null, cancel_at_period_end: false, usage_metering: "recording", metered_events_30d: 2 });
    expect(one.detail).toContain("1 usage event ");
    expect(many.detail).toContain("2 usage events ");
  });
});

/**
 * The class of bug this catches, found in this surface's own shipped copy:
 *
 *   "PAIGE can prepare that registration from your business details."
 *      -> Paige had no A2P tool registered, and the only caller of
 *         comms-a2p-draft / comms-a2p-submit was the legacy admin tab a Solo
 *         tenant is redirected away from. Nobody could act on it.
 *   "Collect consent through your intake forms first"
 *      -> the only writer of paige_consent_events is the inbound-SMS handler.
 *         No intake form records SMS consent, so this stored nothing.
 *
 * Both read as helpful next steps and both described capabilities that did not
 * exist. A promise the product cannot keep is the same §13 failure as a
 * fabricated status — it is just harder to notice, because it sounds like help.
 *
 * So: tenant-facing next-steps may state FACTS about this account and may
 * describe what the tenant can do. They may not promise that Paige, or the
 * product, will do something — because a promise here is unverifiable from the
 * copy alone, and the two above survived review precisely because nobody traced
 * them to a mechanism.
 */
const UNBACKED_PROMISE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bpaige (can|will|would|is able to)\b/i, why: "promises a Paige capability the copy cannot prove exists" },
  { re: /\bwe('| wi)ll\b/i,                       why: "promises a product action" },
  { re: /\bautomatically\b/i,                     why: "claims automation the copy cannot prove exists" },
  { re: /\bintake form/i,                          why: "no intake form records SMS consent" },
];

describe("tenant-facing next steps promise only what exists", () => {
  it("never promises an automated action the copy cannot prove is wired", () => {
    for (const [reason, copy] of Object.entries(READINESS_COPY)) {
      for (const { re, why } of UNBACKED_PROMISE_PATTERNS) {
        expect(re.test(copy.next), `"${reason}" ${why}: ${copy.next}`).toBe(false);
      }
    }
  });

  it("applies the same rule to the billing row", () => {
    for (const { name, billing } of BILLING_CASES) {
      const row = billingStep(billing);
      for (const { re, why } of UNBACKED_PROMISE_PATTERNS) {
        expect(re.test(`${row.state} ${row.detail}`), `${name} ${why}`).toBe(false);
      }
    }
  });
});


/**
 * The extracted step functions.
 *
 * Communications subsections and the readiness ladder are two presentations of
 * the SAME canonical record and now derive from these functions, so the
 * tenant-facing boundary is enforceable in one place instead of being re-checked
 * per surface. A subsection that disagreed with the ladder would be a second
 * opinion about whether this account can text (§57).
 */
const BASE: CommsReadiness = {
  tenant_id: "t", can_send_sms: false, blocked_reason: "no_sms_number",
  subaccount: "connected", number: "absent", number_e164: null,
  business: { has_name: true, has_website: false, has_phone: true },
  a2p: "prepared",
  consent: { granted_count: 0, suppressed_count: 0, state: "none_recorded" },
  delivery: { state: "no_activity", sent_30d: 0, delivered_30d: 0, failed_30d: 0, last_inbound_at: null },
  billing: { subscription: "absent", plan_name: null, period_end: null, cancel_at_period_end: false,
    usage_metering: "not_recording", metered_events_30d: 0 },
};

/**
 * Claims that DO promise a product action and are nonetheless permitted, each
 * because a named server gate enforces it. Narrow and evidence-bearing on
 * purpose: the promise patterns exist because two unbacked promises shipped, so
 * an exemption has to cite the code that makes the promise true, not merely
 * assert that it is.
 */
const BACKED_CLAIMS: Array<{ text: string; enforcedBy: string }> = [
  {
    text: "PAIGE will not text them",
    // `_shared/pre-send-pipeline.ts` reads `paige_suppressions` before every
    // send, and `send-message` carries a terminal `blocked_suppressed` outcome
    // that fails CLOSED when that legal-gate read errors. The send genuinely
    // refuses, so this is a fact about the system rather than a promise.
    enforcedBy: "_shared/pre-send-pipeline.ts suppression gate + send-message blocked_suppressed",
  },
];

describe("readiness steps are one shared source", () => {
  it("every backed-claim exemption names the gate that enforces it", () => {
    // The allowlist must not become a way to wave copy through: an entry with no
    // named enforcement is indistinguishable from an unbacked promise.
    for (const b of BACKED_CLAIMS) {
      expect(b.enforcedBy.length, `"${b.text}" has no named enforcement`).toBeGreaterThan(20);
    }
  });

  it("the ladder is built from the same functions the subsections call", () => {
    const steps = readinessSteps(BASE);
    // `readinessSteps` stamps `no`; everything else must come from the step
    // function untouched, or the two renderings can drift apart again.
    const content = (st: Step | undefined) => { const { no: _no, ...rest } = st ?? ({} as Step); return rest; };
    const byName = (n: string) => steps.find((s) => s.n === n);
    expect(content(byName("Phone number"))).toEqual(phoneStep(BASE));
    expect(content(byName("Business texting"))).toEqual(registrationStep(BASE));
    expect(content(byName("Consent and opt-outs"))).toEqual(consentStep(BASE));
    expect(content(byName("Delivery"))).toEqual(deliveryStep(BASE));
  });

  it("gives a step the SAME number wherever it is rendered", () => {
    // A step drawn on its own used to be numbered from the one-element array it
    // was passed, so "Business details" read as step 1 inside the registration
    // card and step 2 in the ladder — one step, two numbers, one surface.
    const steps = readinessSteps(BASE);
    expect(steps.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const st of steps) {
      const alone = stepByName(BASE, st.n);
      expect(alone).toHaveLength(1);
      expect(alone[0].no).toBe(st.no);
    }
  });

  it("names the email sending identity distinctly from the texting sender", () => {
    // Two steps sharing the name "Sending identity" defeated the requirement that
    // email identity read as clearly separate from phone/SMS.
    const names = readinessSteps(BASE).map((s) => s.n);
    expect(names).toContain("Texting sender");
    expect(names).not.toContain("Sending identity");
  });

  it("leaks nothing tenant-facing from any step, in any state", () => {
    const variants: CommsReadiness[] = [
      BASE,
      { ...BASE, a2p: "approved", number: "assigned", number_e164: "+15550001111", can_send_sms: true,
        consent: { granted_count: 3, suppressed_count: 1, state: "ready" },
        delivery: { state: "delivering", sent_30d: 9, delivered_30d: 8, failed_30d: 1, last_inbound_at: null } },
      { ...BASE, a2p: "submitted", subaccount: "inactive",
        delivery: { state: "failing", sent_30d: 4, delivered_30d: 0, failed_30d: 4, last_inbound_at: null } },
      { ...BASE, a2p: "absent", subaccount: "absent" },
    ];
    for (const v of variants) {
      for (const st of readinessSteps(v)) {
        const text = `${st.n} ${st.s} ${st.state} ${st.detail}`.toLowerCase();
        for (const term of FORBIDDEN) {
          expect(text.includes(term), `step "${st.n}" leaks "${term}": ${text}`).toBe(false);
        }
        const claim = `${st.state} ${st.detail}`;
        for (const { re, why } of UNBACKED_PROMISE_PATTERNS) {
          if (BACKED_CLAIMS.some((b) => claim.includes(b.text))) continue;
          expect(re.test(claim), `step "${st.n}" ${why}: ${claim}`).toBe(false);
        }
      }
    }
  });

  it("states the prepared-not-submitted ceiling rather than implying a filing", () => {
    const prepared = registrationStep({ ...BASE, a2p: "prepared" });
    expect(prepared.state).toBe("Prepared, not submitted");
    expect(prepared.detail.toLowerCase()).toContain("nothing has been filed");
    // Non-vacuity: a genuinely filed registration reads differently.
    expect(registrationStep({ ...BASE, a2p: "submitted" }).state).toBe("Filed with carriers");
    expect(registrationStep({ ...BASE, a2p: "approved" }).truth).toBe("LIVE");
  });

  it("never infers delivery, and never claims replies in either direction", () => {
    for (const state of ["no_activity", "awaiting_receipts", "delivering", "mixed", "failing"] as const) {
      const st = deliveryStep({ ...BASE, delivery: { ...BASE.delivery, state } });
      const text = `${st.state} ${st.detail}`.toLowerCase();
      // Replies are unreportable: nothing writes an inbound SMS row. Saying so is
      // the opposite of a claim, so the step must CARRY the disclosure — an
      // earlier version of this test banned the word "repl" outright, which is
      // how the disclosure came to be dropped from the ladder unnoticed (§58).
      expect(st.detail).toContain("Whether replies are arriving is not reported");
      // ...but it must never assert a direction.
      expect(text).not.toContain("replies received");
      expect(text).not.toContain("no replies");
      expect(text).not.toContain("webhook");
    }
    // Non-vacuity: it does report what receipts actually counted.
    const delivering = deliveryStep({ ...BASE,
      delivery: { state: "delivering", sent_30d: 5, delivered_30d: 4, failed_30d: 1, last_inbound_at: null } });
    expect(delivering.state).toBe("4 of 5 delivered");
  });

  it("does not let a plan imply that anything was billed or sent", () => {
    const active = billingStep({ subscription: "active", plan_name: "Solo", period_end: null,
      cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0 });
    expect(active.truth).not.toBe("LIVE");
    expect(active.detail.toLowerCase()).toContain("not being recorded");
  });
});
