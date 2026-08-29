#!/usr/bin/env node
/**
 * comms-webhook-auth — the decisions that used to fail OPEN.
 *
 * Vitest covers `src/**` only and no edge function carries a test, so this is
 * the §32 smoke for the module that decides whether a provider callback is
 * authentic. It exercises the REAL module against the REAL inputs; only the
 * database read is substituted.
 *
 * Every assertion here would have PASSED against the old implementation for the
 * wrong reason — it accepted everything — so each one is paired with a negative
 * control that must fail.
 */
import assert from "node:assert/strict";
import {
  authenticateTwilioWebhook,
  stampedWebhookUrls,
  inboundSecretForNumber,
} from "../supabase/functions/_shared/twilio-webhook-auth.ts";

const SECRET = "a".repeat(64);
const req = (url, headers = {}) => new Request(url, { method: "POST", headers });
let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `FAILED: ${label}`); console.log(`  ok  ${label}`); };

console.log("comms-webhook-auth smoke\n");

// 1. No proof at all — the exact shape the old code accepted.
{
  const r = await authenticateTwilioWebhook(req("https://x.test/handle-inbound-sms"), "From=%2B15551234567",
    { authToken: null, expectedSecret: SECRET });
  check("a callback offering no proof is REFUSED", r.ok === false && r.reason === "no_proof_offered");
}

// 2. Correct secret is accepted.
{
  const r = await authenticateTwilioWebhook(req(`https://x.test/handle-inbound-sms?t=${SECRET}`), "Body=STOP",
    { authToken: null, expectedSecret: SECRET });
  check("the stamped secret is accepted", r.ok === true && r.via === "shared_secret");
}

// 3. NEGATIVE CONTROL — a wrong secret must be refused. If this passes, the
//    comparison is not actually comparing anything.
{
  const r = await authenticateTwilioWebhook(req(`https://x.test/handle-inbound-sms?t=${"b".repeat(64)}`), "Body=STOP",
    { authToken: null, expectedSecret: SECRET });
  check("a WRONG secret is refused (negative control)", r.ok === false && r.reason === "bad_secret");
}

// 4. A secret of a different length must not be accepted by a short-circuit.
{
  const r = await authenticateTwilioWebhook(req("https://x.test/handle-inbound-sms?t=a"), "Body=STOP",
    { authToken: null, expectedSecret: SECRET });
  check("a truncated secret is refused", r.ok === false && r.reason === "bad_secret");
}

// 5. An unresolvable recipient is refused rather than waved through — the
//    precise case the old code turned into "accepting unsigned".
{
  const r = await authenticateTwilioWebhook(req(`https://x.test/handle-inbound-sms?t=${SECRET}`), "Body=STOP",
    { authToken: null, expectedSecret: null });
  check("an unknown recipient is REFUSED, not accepted", r.ok === false && r.reason === "unknown_recipient");
}

// 6. With a token present, a bad signature is refused and does NOT fall through
//    to the secret path — otherwise a forged signature would be retried as a secret.
{
  const r = await authenticateTwilioWebhook(
    req(`https://x.test/handle-inbound-sms?t=${SECRET}`, { "x-twilio-signature": "not-a-real-signature" }),
    "Body=STOP", { authToken: "some-auth-token", expectedSecret: SECRET });
  check("a bad signature is refused and does not fall through", r.ok === false && r.reason === "bad_signature");
}

// 7. The stamped URLs name handlers that ACTUALLY EXIST. The previous names
//    (twilio-sms-webhook / twilio-sms-status-webhook) are in neither the repo
//    nor the deployed function list, which is why STOP was never recorded.
{
  const u = stampedWebhookUrls("https://proj.supabase.co/", SECRET);
  check("inbound URL points at handle-inbound-sms", u.smsUrl.includes("/functions/v1/handle-inbound-sms"));
  check("status URL points at twilio-status-callback", u.statusCallback.includes("/functions/v1/twilio-status-callback"));
  check("neither URL names a function that does not exist",
    !/twilio-sms-webhook|twilio-sms-status-webhook/.test(u.smsUrl + u.statusCallback));
  check("both URLs carry the secret", u.smsUrl.includes(`t=${SECRET}`) && u.statusCallback.includes(`t=${SECRET}`));
}

// 8. Secret resolution is keyed on the RECEIVING number's tenant.
{
  const admin = {
    from: (t) => ({
      select: () => ({
        eq: (_c, v) => ({
          maybeSingle: async () =>
            t === "tenant_phone_numbers"
              ? { data: v === "+15550001111" ? { tenant_id: "tenant-a" } : null }
              : { data: v === "tenant-a" ? { inbound_webhook_secret: SECRET } : null },
        }),
      }),
    }),
  };
  check("a known number resolves its own tenant's secret",
    (await inboundSecretForNumber(admin, "+15550001111")) === SECRET);
  check("an unknown number resolves NO secret (negative control)",
    (await inboundSecretForNumber(admin, "+15559999999")) === null);
}

console.log(`\n${n}/${n} checks passed`);
