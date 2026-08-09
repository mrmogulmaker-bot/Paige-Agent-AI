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

// ── 2) operatorTwilioCreds resolution — MASTER-CRED REUSE (§30 owner correction 2026-08-09) ─
{
  for (const k of Object.keys(env)) delete env[k];
  check("unconfigured → null (needs_config degrade)", operatorTwilioCreds() === null);

  // MG SID present but NO account/auth of any kind → still null (needs the master creds).
  env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID = "MG22222222222222222222222222222222";
  check("MG SID but no account/auth → null", operatorTwilioCreds() === null);

  // REUSE PATH: MASTER creds (already set in prod) + operator MG SID, NO operator account
  // creds → resolves using the MASTER account SID + master API Key (zero new pastes).
  env.TWILIO_ACCOUNT_SID = "ACmaster1111111111111111111111111";
  env.TWILIO_API_KEY_SID = "SKmaster2222222222222222222222222";
  env.TWILIO_API_KEY_SECRET = "master-api-key-secret";
  const m = operatorTwilioCreds();
  check("REUSE: account SID = MASTER account SID (no operator paste)", m?.accountSid === env.TWILIO_ACCOUNT_SID);
  check("REUSE: username = MASTER API Key SID", m?.apiKeySid === env.TWILIO_API_KEY_SID);
  check("REUSE: password = MASTER API Key Secret", m?.authToken === env.TWILIO_API_KEY_SECRET);
  check("REUSE: messagingServiceSid = operator MG SID", m?.messagingServiceSid === env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID);

  // Generic TWILIO_MESSAGING_SERVICE_SID is reused when the operator override isn't set.
  delete env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID;
  env.TWILIO_MESSAGING_SERVICE_SID = "MGgeneric333333333333333333333333";
  check("generic MESSAGING_SERVICE_SID reused when operator MG unset", operatorTwilioCreds()?.messagingServiceSid === env.TWILIO_MESSAGING_SERVICE_SID);

  // OVERRIDE PATH: explicit operator account trio WINS over the master creds.
  env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID = "MGop44444444444444444444444444444";
  env.TWILIO_OPERATOR_ACCOUNT_SID = "ACop5555555555555555555555555555";
  env.TWILIO_OPERATOR_API_KEY_SID = "SKop6666666666666666666666666666";
  env.TWILIO_OPERATOR_API_KEY_SECRET = "operator-override-secret";
  const o = operatorTwilioCreds();
  check("OVERRIDE: operator account SID wins over master", o?.accountSid === env.TWILIO_OPERATOR_ACCOUNT_SID);
  check("OVERRIDE: operator API Key SID wins", o?.apiKeySid === env.TWILIO_OPERATOR_API_KEY_SID);
  check("OVERRIDE: operator MG SID wins over generic", o?.messagingServiceSid === env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID);

  // The ONE genuinely-owed secret: with master creds set but NO messaging service anywhere,
  // resolution is null (needs_config) — never a raw-From A2P violation.
  for (const k of Object.keys(env)) delete env[k];
  env.TWILIO_ACCOUNT_SID = "ACmaster1111111111111111111111111";
  env.TWILIO_API_KEY_SID = "SKmaster2222222222222222222222222";
  env.TWILIO_API_KEY_SECRET = "master-api-key-secret";
  check("master creds set, NO messaging service → null (MG SID is the single owed secret)", operatorTwilioCreds() === null);
}

// ── 3) sendOperatorSms sends via the Messaging Service SID with MASTER creds ──────────
{
  for (const k of Object.keys(env)) delete env[k];
  // Master creds already set (as in prod) + only the operator MG SID → sends, no new paste.
  env.TWILIO_ACCOUNT_SID = "ACmaster4444444444444444444444444";
  env.TWILIO_API_KEY_SID = "SKmaster6666666666666666666666666";
  env.TWILIO_API_KEY_SECRET = "master-secret-xyz";
  env.TWILIO_OPERATOR_MESSAGING_SERVICE_SID = "MG55555555555555555555555555555555";

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
  check("URL addresses the MASTER account SID (reuse)", capturedUrl.includes(env.TWILIO_ACCOUNT_SID!));
  const expectedAuth = "Basic " + Buffer.from(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`).toString("base64");
  check("Basic-auth username = MASTER API Key SID (reuse)", capturedAuth === expectedAuth, `got ${capturedAuth.slice(0, 12)}…`);

  // No messaging service anywhere → needs_config with the precise owed-secret reason.
  for (const k of Object.keys(env)) delete env[k];
  env.TWILIO_ACCOUNT_SID = "ACmaster4444444444444444444444444";
  env.TWILIO_API_KEY_SID = "SKmaster6666666666666666666666666";
  env.TWILIO_API_KEY_SECRET = "master-secret-xyz";
  const degraded = await sendOperatorSms("+14705551234", "x");
  check("no MG SID → needs_config (no fake send)", degraded.needs_config === true && degraded.ok === false);
  check("needs_config names the messaging-service gap", degraded.error === "operator_messaging_service_not_configured");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
