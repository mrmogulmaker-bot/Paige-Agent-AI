// §32 headless guard for the C-2a SUBACCOUNT API-Key auth pattern (owner-confirmed
// 2026-07-28, Path A). Proves — deterministically, with a stubbed fetch + a fake
// supabase admin, no live Twilio/DB call — that _shared/twilio.ts:
//   • createSubaccountApiKey() POSTs to /Accounts/{subSid}/Keys.json with the MASTER
//     API-Key SID as the Basic-auth username and returns { sid, secret };
//   • resolveTwilioCreds() builds Basic auth as api_key_sid : <vaulted secret> (username
//     = SK…, NOT the subaccount SID) and returns apiKeySid in its data;
//   • resolveTwilioCreds() degrades to needs_config when api_key_sid is null (never a
//     wrong-username send, §13).
//
// Run headless:  node --experimental-strip-types scripts/twilio-subaccount-apikey-smoke.mts

// twilio.ts reads env via Deno.env.get; shim it onto a local map so the module imports in Node.
const env: Record<string, string | undefined> = {
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_API_KEY_SID: "SKmaster1111111111111111111111111",
  TWILIO_API_KEY_SECRET: "mastersecret",
};
(globalThis as unknown as { Deno?: unknown }).Deno = { env: { get: (k: string) => env[k] } };

const { createSubaccountApiKey, resolveTwilioCreds } = await import(
  "../supabase/functions/_shared/twilio.ts"
);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
function decode(authHeader: string | undefined): { user: string; pass: string } {
  const b64 = (authHeader ?? "").replace(/^Basic\s+/i, "");
  const [user, ...rest] = Buffer.from(b64, "base64").toString("utf8").split(":");
  return { user, pass: rest.join(":") };
}

console.log("Twilio subaccount API-Key (C-2a) smoke\n");

const SUB_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // placeholder subaccount SID shape (never a real SID)
const realFetch = globalThis.fetch;

// ── Case 1: createSubaccountApiKey masters-auths to /Accounts/{sub}/Keys.json ──
{
  let capturedUrl = "";
  let capturedAuth: string | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedAuth = (init?.headers as Record<string, string>)?.Authorization;
    return new Response(JSON.stringify({ sid: "SKnew2222222222222222222222222222", secret: "oneTimeSecret" }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const res = await createSubaccountApiKey(SUB_SID);
  const { user } = decode(capturedAuth);
  check("apiKey: ok:true with sid+secret", res.ok && res.data?.sid === "SKnew2222222222222222222222222222" && res.data?.secret === "oneTimeSecret");
  check("apiKey: URL targets /Accounts/{subSid}/Keys.json", capturedUrl.includes(`/Accounts/${SUB_SID}/Keys.json`), capturedUrl);
  check("apiKey: Basic-auth username = MASTER API Key SID (not the subaccount SID)", user === env.TWILIO_API_KEY_SID, `got ${user}`);
}

// ── Case 2: createSubaccountApiKey with a 2xx but MISSING secret => honest error, no fake ──
{
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sid: "SKonly3333333333333333333333333333" }), { status: 201, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const res = await createSubaccountApiKey(SUB_SID);
  check("apiKey: missing secret => ok:false, no fabricated key", !res.ok && res.error === "twilio_api_key_missing_sid_or_secret" && res.data === null);
}

// ── Case 3: createSubaccountApiKey with empty subSid => structured error, no call ──
{
  const res = await createSubaccountApiKey("");
  check("apiKey: empty subSid => twilio_missing_subaccount_sid", !res.ok && res.error === "twilio_missing_subaccount_sid");
}

globalThis.fetch = realFetch;

// ── Fake supabase admin for resolveTwilioCreds ───────────────────────────────
function makeAdmin(row: Record<string, unknown> | null, secret: string | null) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) { return this; },
        eq(_col: string, _val: string) { return this; },
        maybeSingle() { return Promise.resolve({ data: row, error: null }); },
      };
    },
    rpc(fn: string, _args?: Record<string, unknown>) {
      if (fn === "read_channel_secret") return Promise.resolve({ data: secret, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

// ── Case 4: resolveTwilioCreds builds api_key_sid : secret (username swap) ──
{
  const admin = makeAdmin(
    { subaccount_sid: SUB_SID, api_key_sid: "SKsub4444444444444444444444444444", auth_token_vault_ref: "ref", status: "active" },
    "vaultedApiKeySecret",
  );
  const creds = await resolveTwilioCreds(admin, "tenant-1");
  check("resolve: ok:true", creds.ok);
  check("resolve: accountSid = subaccount SID (URL path)", creds.data?.accountSid === SUB_SID);
  check("resolve: apiKeySid = SK… (Basic-auth USERNAME)", creds.data?.apiKeySid === "SKsub4444444444444444444444444444");
  check("resolve: authToken = vaulted API-Key SECRET (password)", creds.data?.authToken === "vaultedApiKeySecret");
  // The critical negative: the username the caller will use must NOT be the subaccount SID.
  check("resolve: apiKeySid is NOT the subaccount SID", creds.data?.apiKeySid !== SUB_SID);
}

// ── Case 5: null api_key_sid => needs_config (never a wrong-username send) ──
{
  const admin = makeAdmin(
    { subaccount_sid: SUB_SID, api_key_sid: null, auth_token_vault_ref: "ref", status: "active" },
    "vaultedApiKeySecret",
  );
  const creds = await resolveTwilioCreds(admin, "tenant-2");
  check("resolve: null api_key_sid => needs_config", !creds.ok && creds.needs_config === true && creds.error === "twilio_subaccount_api_key_missing");
}

// ── Case 6: no row => not_provisioned degrade ──
{
  const admin = makeAdmin(null, null);
  const creds = await resolveTwilioCreds(admin, "tenant-3");
  check("resolve: no row => twilio_subaccount_not_provisioned needs_config", !creds.ok && creds.needs_config === true && creds.error === "twilio_subaccount_not_provisioned");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
