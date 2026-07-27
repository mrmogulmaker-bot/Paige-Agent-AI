// §32 headless guard for the platform MASTER Twilio credential pattern (owner-confirmed
// 2026-07-27): prod carries an API KEY trio — TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID +
// TWILIO_API_KEY_SECRET — and NOT the master TWILIO_AUTH_TOKEN. This asserts, deterministically
// and without any live Twilio call, that _shared/twilio.ts builds Basic auth from the API Key
// SID:Secret (username = SK…, not the account SID) while the URL still addresses the Account SID.
//
// It also proves the legacy fallback (only TWILIO_AUTH_TOKEN set → username = account SID) and the
// unconfigured degrade (all unset → null). Run headless:
//   node --experimental-strip-types scripts/twilio-master-auth-smoke.mts
//
// OPTIONAL LIVE PROBE (§13 — real proof, only when creds are present in the environment): set
// TWILIO_LIVE_SMOKE=1 with the real trio in env and it does GET /Accounts/{AccountSid}.json and
// asserts 200 + a friendly_name. Skipped by default so the guard runs anywhere.

// twilio.ts reads env via Deno.env.get; shim it onto process.env so the module imports in Node.
const env: Record<string, string | undefined> = {};
(globalThis as unknown as { Deno?: unknown }).Deno = {
  env: { get: (k: string) => env[k] },
};

const { masterCreds, masterBasicAuthHeader } = await import(
  "../supabase/functions/_shared/twilio.ts"
);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function reset() {
  for (const k of Object.keys(env)) delete env[k];
}

console.log("Twilio master-auth pattern smoke\n");

// ── Case 1: API Key trio (the prod pattern) ──────────────────────────────────
reset();
env.TWILIO_ACCOUNT_SID = "AC00000000000000000000000000000000";
env.TWILIO_API_KEY_SID = "SK11111111111111111111111111111111";
env.TWILIO_API_KEY_SECRET = "topsecretkeyvalue";
{
  const creds = masterCreds();
  check("trio: masterCreds() non-null", creds !== null);
  check("trio: accountSid is the ACCOUNT SID (URL path)", creds?.accountSid === env.TWILIO_ACCOUNT_SID);
  check("trio: apiKeySid is the API KEY SID (auth username)", creds?.apiKeySid === env.TWILIO_API_KEY_SID);
  check("trio: authToken (password) is the API KEY SECRET", creds?.authToken === env.TWILIO_API_KEY_SECRET);

  const header = masterBasicAuthHeader();
  const expected = "Basic " + btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`);
  check("trio: Basic header username = API Key SID, password = secret", header === expected, `got ${header}`);
  // The critical negative: the account SID must NOT be the Basic-auth username.
  const wrong = "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_API_KEY_SECRET}`);
  check("trio: header does NOT use the account SID as username", header !== wrong);
}

// ── Case 2: legacy fallback (only TWILIO_AUTH_TOKEN present) ──────────────────
reset();
env.TWILIO_ACCOUNT_SID = "AC22222222222222222222222222222222";
env.TWILIO_AUTH_TOKEN = "legacyauthtoken";
{
  const creds = masterCreds();
  check("legacy: masterCreds() non-null via auth-token fallback", creds !== null);
  check("legacy: no apiKeySid on the fallback path", creds?.apiKeySid === undefined);
  const header = masterBasicAuthHeader();
  const expected = "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  check("legacy: Basic header = accountSid:authToken", header === expected, `got ${header}`);
}

// ── Case 3: API Key trio WINS over a stray legacy token ──────────────────────
reset();
env.TWILIO_ACCOUNT_SID = "AC33333333333333333333333333333333";
env.TWILIO_API_KEY_SID = "SK44444444444444444444444444444444";
env.TWILIO_API_KEY_SECRET = "preferredsecret";
env.TWILIO_AUTH_TOKEN = "shouldbeignored";
{
  const header = masterBasicAuthHeader();
  const expected = "Basic " + btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`);
  check("precedence: API Key trio beats a stray legacy TWILIO_AUTH_TOKEN", header === expected);
}

// ── Case 4: unconfigured → honest null degrade (never an empty-password header) ──
reset();
env.TWILIO_ACCOUNT_SID = "AC55555555555555555555555555555555"; // account only, no auth material
{
  check("unconfigured: masterCreds() is null with no auth material", masterCreds() === null);
  check("unconfigured: masterBasicAuthHeader() is null (no empty-password send)", masterBasicAuthHeader() === null);
}
reset();
{
  check("empty-env: masterCreds() is null", masterCreds() === null);
  check("empty-env: masterBasicAuthHeader() is null", masterBasicAuthHeader() === null);
}

// ── Optional live probe (§13): only with real creds + explicit opt-in ─────────
if (process.env.TWILIO_LIVE_SMOKE === "1") {
  reset();
  env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  env.TWILIO_API_KEY_SID = process.env.TWILIO_API_KEY_SID;
  env.TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
  env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const header = masterBasicAuthHeader();
  const sid = env.TWILIO_ACCOUNT_SID;
  if (!header || !sid) {
    check("live: creds present for probe", false, "TWILIO_LIVE_SMOKE=1 but no usable master creds in env");
  } else {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        method: "GET",
        headers: { Authorization: header },
      });
      const body = (await res.json().catch(() => ({}))) as { friendly_name?: string; sid?: string };
      check("live: GET /Accounts/{sid}.json returns 200", res.status === 200, `status ${res.status}`);
      check("live: response carries a friendly_name", typeof body.friendly_name === "string" && body.friendly_name.length > 0);
      check("live: response sid matches the account SID", body.sid === sid);
      console.log(`  ℹ live account friendly_name: ${body.friendly_name ?? "(none)"}`);
    } catch (e) {
      check("live: probe completed without a transport error", false, (e as Error).message);
    }
  }
} else {
  console.log("\n  (live probe skipped — set TWILIO_LIVE_SMOKE=1 with real creds to run it)");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
