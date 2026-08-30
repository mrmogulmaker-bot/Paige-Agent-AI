#!/usr/bin/env node
/**
 * voice-twiml statusCallback — the decision that leaked a tenant credential.
 *
 * `voice-twiml` is `verify_jwt = false`, and in the production credential model
 * TWILIO_AUTH_TOKEN is deliberately ABSENT, so its signature check does not run.
 * Everything it returns is therefore returned to an UNAUTHENTICATED caller, and
 * every field it reads from the body is attacker-supplied.
 *
 * The first revision of the fail-closed webhook work stamped the receiving
 * tenant's long-lived `inbound_webhook_secret` into the `statusCallback`
 * attribute of the TwiML — i.e. into the HTTP RESPONSE BODY. An anonymous POST
 * of `From=client:<any tenant uuid>.<any user uuid>` was enough to be handed
 * that tenant's secret, which is exactly the credential the rest of that work
 * makes load-bearing.
 *
 * This suite drives the REAL decision function and the REAL TwiML builders.
 * Assertion 1 is the regression: it FAILS against the pre-fix behaviour, which
 * returned the stamped URL here. Everything else exists so the fix cannot be
 * "return nothing, always" — the capability must survive on the authenticated
 * path.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Bundled rather than type-stripped for the same reason as the sibling smoke:
// `--experimental-strip-types` needs Node 22.6+ and CI runs Node 20.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-twiml-callback-"));
const outFile = path.join(outDir, "mod.mjs");
await build({
  entryPoints: ["supabase/functions/voice-twiml/twiml.ts"],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  external: ["https://*"],
});
const { resolveStatusCallbackUrl, buildOutboundTwiml, buildInboundTwiml } =
  await import(pathToFileURL(outFile).href);

const BASE = "https://ref.functions.supabase.co/functions/v1/twilio-status-callback";
const SECRET = "s".repeat(64);
const TENANT = "11111111-1111-1111-1111-111111111111";

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `FAILED: ${label}`); console.log(`  ok  ${label}`); };

console.log("voice-twiml statusCallback smoke\n");

// 1. THE REGRESSION. Unsigned request + resolvable tenant secret. The pre-fix
//    code returned `${BASE}?t=${SECRET}` here; anything non-empty fails.
{
  const url = resolveStatusCallbackUrl({
    base: BASE, signatureVerified: false, tenantId: TENANT, tenantSecret: SECRET,
  });
  check("an UNSIGNED request gets NO callback url", url === "");
  check("the secret does not appear in the result", !url.includes(SECRET));
}

// 2. The secret must not survive into the rendered TwiML on the unsigned path —
//    the response body is the actual disclosure surface, so assert on it too.
{
  const url = resolveStatusCallbackUrl({
    base: BASE, signatureVerified: false, tenantId: TENANT, tenantSecret: SECRET,
  });
  const outbound = buildOutboundTwiml("+15550001111", "+15550002222", "", url);
  const inbound = buildInboundTwiml([`${TENANT}.22222222-2222-2222-2222-222222222222`], "", url);
  check("unsigned OUTBOUND TwiML contains no secret", !outbound.includes(SECRET));
  check("unsigned INBOUND TwiML contains no secret", !inbound.includes(SECRET));
  check("unsigned OUTBOUND TwiML emits no statusCallback at all", !outbound.includes("statusCallback"));
  check("unsigned INBOUND TwiML emits no statusCallback at all", !inbound.includes("statusCallback"));
}

// 3. NON-VACUITY. The builders DO embed a statusCallback when given one, so the
//    assertions above are testing the gate and not a builder that never emits.
{
  const outbound = buildOutboundTwiml("+15550001111", "+15550002222", "", `${BASE}?t=${SECRET}`);
  check("the builder embeds a statusCallback when one is supplied", outbound.includes("statusCallback="));
  check("...and that stamped url really does carry the secret", outbound.includes(SECRET));
}

// 4. The capability survives on the AUTHENTICATED path — the fix is a gate, not
//    a deletion. A verified request for a tenant with a resolvable secret still
//    stamps, so voice rows keep getting their terminal status once voice
//    webhooks can be authenticated.
{
  const url = resolveStatusCallbackUrl({
    base: BASE, signatureVerified: true, tenantId: TENANT, tenantSecret: SECRET,
  });
  check("a VERIFIED tenant request still gets a stamped url", url === `${BASE}?t=${SECRET}`);
  const outbound = buildOutboundTwiml("+15550001111", "+15550002222", "", url);
  check("...and it reaches the TwiML", outbound.includes(`?t=${SECRET}`));
}

// 5. Verified, but the tenant's secret could not be resolved: emit NOTHING
//    rather than a bare url the fail-closed endpoint would refuse anyway.
{
  const url = resolveStatusCallbackUrl({
    base: BASE, signatureVerified: true, tenantId: TENANT, tenantSecret: null,
  });
  check("a verified tenant call with no resolvable secret gets no url", url === "");
}

// 6. Operator/master call (no tenant) on a verified request keeps the bare url —
//    it is authenticated downstream by the master signature, and carries no
//    tenant credential to disclose.
{
  const url = resolveStatusCallbackUrl({
    base: BASE, signatureVerified: true, tenantId: null, tenantSecret: null,
  });
  check("a VERIFIED operator call keeps the bare callback url", url === BASE);
}

// 7. ...but an UNSIGNED operator call gets nothing. It carries no secret, so
//    this is not a disclosure — it is honesty: with no auth token configured the
//    callback endpoint cannot verify a signature either, so that url is dead on
//    arrival and emitting it would fake a wired callback.
{
  const url = resolveStatusCallbackUrl({
    base: BASE, signatureVerified: false, tenantId: null, tenantSecret: null,
  });
  check("an UNSIGNED operator call gets no callback url", url === "");
}

// 8. Unconfigured base is still "" on every path (unchanged behaviour).
{
  for (const signatureVerified of [true, false]) {
    for (const [tenantId, tenantSecret] of [[TENANT, SECRET], [null, null]]) {
      const url = resolveStatusCallbackUrl({ base: "", signatureVerified, tenantId, tenantSecret });
      check(`no base => no url (verified=${signatureVerified}, tenant=${!!tenantId})`, url === "");
    }
  }
}

// 9. The secret is url-encoded when it IS legitimately stamped, so a secret
//    containing a reserved character cannot break out of the query value.
{
  const odd = "ab&t=cd#ef/gh";
  const url = resolveStatusCallbackUrl({
    base: BASE, signatureVerified: true, tenantId: TENANT, tenantSecret: odd,
  });
  check("a reserved-character secret is percent-encoded", url === `${BASE}?t=${encodeURIComponent(odd)}`);
  check("...and does not inject a second query parameter", url.split("?t=").length === 2 && !url.includes("&"));
}

console.log(`\n${n} assertions passed.`);
