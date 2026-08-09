// Headless smoke for the OPERATOR SMS seam (wave-s3). Proves the crash-prone runtime logic
// RUNS, not just compiles (§32): the Twilio request-signature validation and the A2P
// Messaging-Service send path. No network — fetch is stubbed to capture the outbound request.
//
// Run headless:
//   node --experimental-strip-types scripts/operator-sms-smoke.mts
//
// twilio.ts / operator-twilio.ts read env via Deno.env.get; shim Deno onto globalThis so the
// modules import in Node. Web Crypto (crypto.subtle) is global in Node 20+, so the HMAC
// signature functions run unchanged.

const env: Record<string, string | undefined> = {};
(globalThis as unknown as { Deno?: unknown }).Deno = {
  env: { get: (k: string) => env[k] },
};

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const { computeTwilioSignature } = await import("../supabase/functions/_shared/twilio.ts");
const { operatorTwilioCreds, sendOperatorSms, validateOperatorTwilioSignature, decideOperatorInboundGate } = await import(
  "../supabase/functions/_shared/operator-twilio.ts"
);

console.log("Operator SMS seam smoke\n");

// ── 1) Signature validation round-trip (spoof guard) ─────────────────────────────
{
  for (const k of Object.keys(env)) delete env[k];
  const token = "operator-auth-token-abc";
  env.TWILIO_OPERATOR_AUTH_TOKEN = token;
  const url = "https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-operator-sms-inbound";
  const rawBody = "Body=hello+there&From=%2B14705551234&To=%2B14702003444";
  const good = await computeTwilioSignature(token, url, rawBody);

  check("valid signature ACCEPTED", await validateOperatorTwilioSignature(good, url, rawBody) === true);
  check("tampered body REJECTED", await validateOperatorTwilioSignature(good, url, rawBody + "&x=1") === false);
  check("wrong signature REJECTED", await validateOperatorTwilioSignature("bogus", url, rawBody) === false);
  check("missing signature REJECTED", await validateOperatorTwilioSignature(null, url, rawBody) === false);

  // No token configured → cannot validate → reject (honest degrade, never a fake accept).
  delete env.TWILIO_OPERATOR_AUTH_TOKEN;
  check("no operator auth token → validation REJECTS", await validateOperatorTwilioSignature(good, url, rawBody) === false);
}

// ── 1b) HANDLER gate — deployed fail-closed behavior (§9/§32). This is the decision the
//        inbound handler actually drives, so these assertions reflect the DEPLOYED handler,
//        not just the raw validator. accept=true → HTTP 200 (persist); accept=false → 401. ─
{
  const url = "https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-operator-sms-inbound";
  const rawBody = "Body=hello+there&From=%2B14705551234&To=%2B14702003444";

  // Token set + valid signature → 200 (the ONLY signed accept path).
  for (const k of Object.keys(env)) delete env[k];
  const token = "operator-auth-token-abc";
  env.TWILIO_OPERATOR_AUTH_TOKEN = token;
  const good = await computeTwilioSignature(token, url, rawBody);
  const g1 = await decideOperatorInboundGate(good, url, rawBody);
  check("handler: token set + valid signature → ACCEPT (200)", g1.accept === true && g1.status === 0);

  // Token set + unsigned/bad signature → 401 (handler rejects, writes nothing).
  const g2 = await decideOperatorInboundGate(null, url, rawBody);
  check("handler: token set + unsigned → REJECT 401", g2.accept === false && g2.status === 401);
  const g3 = await decideOperatorInboundGate("bogus", url, rawBody);
  check("handler: token set + bad signature → REJECT 401", g3.accept === false && g3.status === 401);

  // Token UNSET, no dev flag → FAIL CLOSED 401 (the core S2 fix — no longer accepts unsigned).
  delete env.TWILIO_OPERATOR_AUTH_TOKEN;
  const g4 = await decideOperatorInboundGate(good, url, rawBody);
  check("handler: no token, no flag → FAIL CLOSED 401 (never a silent accept)", g4.accept === false && g4.status === 401);

  // Token UNSET + explicit dev-only escape hatch → accepts (documented opt-in only).
  env.ALLOW_UNSIGNED_OPERATOR_SMS = "true";
  const g5 = await decideOperatorInboundGate(null, url, rawBody);
  check("handler: no token + ALLOW_UNSIGNED_OPERATOR_SMS=true → ACCEPT (dev escape hatch)", g5.accept === true);
  delete env.ALLOW_UNSIGNED_OPERATOR_SMS;
}

// ── 2) operatorTwilioCreds resolution (API-Key preferred, auth-token fallback, needs_config) ─
{
  for (const k of Object.keys(env)) delete env[k];
  check("unconfigured → null (needs_config degrade)", operatorTwilioCreds() === null);

  env.TWILIO_OPERATOR_ACCOUNT_SID = "AC11111111111111111111111111111111";
  env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID = "MG22222222222222222222222222222222";
  env.TWILIO_OPERATOR_API_KEY_SID = "SK33333333333333333333333333333333";
  env.TWILIO_OPERATOR_API_KEY_SECRET = "operator-api-key-secret";
  const c = operatorTwilioCreds();
  check("API-Key path: username = API Key SID", c?.apiKeySid === env.TWILIO_OPERATOR_API_KEY_SID);
  check("API-Key path: password = API Key Secret", c?.authToken === env.TWILIO_OPERATOR_API_KEY_SECRET);
  check("API-Key path: messagingServiceSid resolved (MG…)", c?.messagingServiceSid === env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID);

  delete env.TWILIO_OPERATOR_API_KEY_SID;
  delete env.TWILIO_OPERATOR_API_KEY_SECRET;
  env.TWILIO_OPERATOR_AUTH_TOKEN = "legacy-operator-auth-token";
  const f = operatorTwilioCreds();
  check("fallback path: no apiKeySid", f?.apiKeySid === undefined);
  check("fallback path: password = auth token", f?.authToken === "legacy-operator-auth-token");

  delete env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID;
  check("missing Messaging Service SID → null (never a raw From)", operatorTwilioCreds() === null);
}

// ── 3) sendOperatorSms sends via the Messaging Service SID, NEVER a raw From ──────────
{
  for (const k of Object.keys(env)) delete env[k];
  env.TWILIO_OPERATOR_ACCOUNT_SID = "AC44444444444444444444444444444444";
  env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID = "MG55555555555555555555555555555555";
  env.TWILIO_OPERATOR_API_KEY_SID = "SK66666666666666666666666666666666";
  env.TWILIO_OPERATOR_API_KEY_SECRET = "secret-xyz";

  let capturedBody = "";
  let capturedAuth = "";
  let capturedUrl = "";
  const realFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: { headers: Record<string, string>; body: string }) => {
    capturedUrl = url;
    capturedBody = init.body;
    capturedAuth = init.headers["Authorization"] ?? "";
    return Promise.resolve(new Response(JSON.stringify({ sid: "SM99999999999999999999999999999999" }), { status: 201 }));
  };

  const res = await sendOperatorSms("+14705551234", "Hi from the operator line");
  (globalThis as unknown as { fetch: unknown }).fetch = realFetch;

  const params = new URLSearchParams(capturedBody);
  check("send ok:true", res.ok === true);
  check("provider sid returned (not fabricated)", (res.data as { sid?: string } | null)?.sid === "SM99999999999999999999999999999999");
  check("body carries MessagingServiceSid (MG…)", params.get("MessagingServiceSid") === env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID);
  check("body has NO raw From (A2P best-practice)", params.get("From") === null || params.get("From") === "");
  check("URL addresses the operator account SID", capturedUrl.includes(env.TWILIO_OPERATOR_ACCOUNT_SID!));
  const expectedAuth = "Basic " + Buffer.from(`${env.TWILIO_OPERATOR_API_KEY_SID}:${env.TWILIO_OPERATOR_API_KEY_SECRET}`).toString("base64");
  check("Basic-auth username = operator API Key SID", capturedAuth === expectedAuth, `got ${capturedAuth.slice(0, 12)}…`);

  // Unconfigured → needs_config, never a fabricated send.
  for (const k of Object.keys(env)) delete env[k];
  const degraded = await sendOperatorSms("+14705551234", "x");
  check("unconfigured send → needs_config (no fake send)", degraded.needs_config === true && degraded.ok === false);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
