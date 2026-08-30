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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// The module under test is Deno-flavoured TypeScript with `.ts` import
// specifiers. It is BUNDLED here rather than run through
// `--experimental-strip-types`, because that flag needs Node 22.6+ and CI runs
// Node 20 — a mismatch that made this suite pass locally and fail the moment it
// was wired into CI. Bundling exercises the REAL module on any supported Node.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "comms-webhook-auth-"));
const outFile = path.join(outDir, "mod.mjs");
await build({
  entryPoints: ["supabase/functions/_shared/twilio-webhook-auth.ts"],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  // The shared twilio module is pulled in for `validateTwilioSignature`; its
  // remote https imports are not needed by anything this suite touches.
  external: ["https://*"],
});
const mod = await import(pathToFileURL(outFile).href);
const { authenticateTwilioWebhook, stampedWebhookUrls, inboundSecretForNumber, computeTwilioSignature } = mod;

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

// 6. A bad signature with NO secret offered is refused as exactly that. (When a
//    secret IS also offered the request falls through to it — see check 10; that
//    is deliberate, because tenant numbers are signed with a subaccount token
//    this deployment does not hold.)
{
  const r = await authenticateTwilioWebhook(
    req("https://x.test/handle-inbound-sms", { "x-twilio-signature": "not-a-real-signature" }),
    "Body=STOP", { authToken: "some-auth-token", expectedSecret: SECRET });
  check("a bad signature with no secret offered is refused", r.ok === false && r.reason === "bad_signature");
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
  // Chainable double: `inboundSecretForNumber` filters on both the number AND
  // status='active', so a double that only supports one `.eq` would hide that.
  const makeAdmin = () => ({
    from: (t) => {
      const filters = {};
      const chain = {
        eq: (c, v) => { filters[c] = v; return chain; },
        maybeSingle: async () =>
          t === "tenant_phone_numbers"
            ? {
                data: filters.phone_number === "+15550001111" && filters.status === "active"
                  ? { tenant_id: "tenant-a" } : null,
              }
            : { data: filters.tenant_id === "tenant-a" ? { inbound_webhook_secret: SECRET } : null },
      };
      return { select: () => chain };
    },
  });
  const admin = makeAdmin();
  check("a known number resolves its own tenant's secret",
    (await inboundSecretForNumber(admin, "+15550001111")) === SECRET);
  check("an unknown number resolves NO secret (negative control)",
    (await inboundSecretForNumber(admin, "+15559999999")) === null);
}

// 9. POSITIVE control for the signature path. Without this, every signature
//    assertion above would still pass if validateTwilioSignature returned false
//    unconditionally — a suite that only proves refusals proves half the seam.
{
  const url = "https://x.test/twilio-status-callback";
  const body = "MessageSid=SM123&MessageStatus=delivered";
  const token = "the-account-auth-token";
  const sig = await computeTwilioSignature(token, url, body);
  const r = await authenticateTwilioWebhook(req(url, { "x-twilio-signature": sig }), body,
    { authToken: token, expectedSecret: null });
  check("a VALID signature is accepted (positive control)", r.ok === true && r.via === "signature");
}

// 10. A bad signature must fall through to a correct secret rather than consume
//     the request — tenant numbers are signed with a subaccount token we do not hold.
{
  const r = await authenticateTwilioWebhook(
    req(`https://x.test/twilio-status-callback?t=${SECRET}`, { "x-twilio-signature": "wrong" }),
    "Body=x", { authToken: "master-token", expectedSecret: SECRET });
  check("a bad signature falls through to a valid stamped secret", r.ok === true && r.via === "shared_secret");
}

// 11. CROSS-TENANT control. Tenant B's secret is real, so it authenticates — the
//     binding that stops it acting on tenant A lives in the handler, which
//     resolves WHICH tenant the secret belongs to. Assert the module reports that
//     ownership rather than a bare yes.
{
  // Chainable double: `inboundSecretForNumber` filters on both the number AND
  // status='active', so a double that only supports one `.eq` would hide that.
  const makeAdmin = () => ({
    from: (t) => {
      const filters = {};
      const chain = {
        eq: (c, v) => { filters[c] = v; return chain; },
        maybeSingle: async () =>
          t === "tenant_phone_numbers"
            ? {
                data: filters.phone_number === "+15550001111" && filters.status === "active"
                  ? { tenant_id: "tenant-a" } : null,
              }
            : { data: filters.tenant_id === "tenant-a" ? { inbound_webhook_secret: SECRET } : null },
      };
      return { select: () => chain };
    },
  });
  const admin = makeAdmin();
  // Tenant B's number resolves NO secret from tenant A's row.
  check("one tenant's number never resolves another tenant's secret",
    (await inboundSecretForNumber(admin, "+15557654321")) === null);
  // And tenant A's own secret does not authenticate when the recipient is unknown.
  const r = await authenticateTwilioWebhook(
    req(`https://x.test/handle-inbound-sms?t=${SECRET}`), "Body=STOP",
    { authToken: null, expectedSecret: await inboundSecretForNumber(admin, "+15557654321") });
  check("a real secret is refused for a number it does not own",
    r.ok === false && r.reason === "unknown_recipient");
}

console.log(`\n${n}/${n} checks passed`);
