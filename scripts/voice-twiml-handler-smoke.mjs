#!/usr/bin/env node
/**
 * voice-twiml — the REQUEST HANDLER, driven end to end.
 *
 * WHY THIS EXISTS SEPARATELY FROM voice-twiml-callback-smoke.mjs
 *
 * That suite covers `twiml.ts` only. An independent adversarial review of the
 * first fix pointed out — correctly — that it therefore could not fail for the
 * defect it claimed to guard: the original bug lived in `index.ts`, and all of
 * its assertions still pass if `index.ts` sets `signatureVerified = true`, drops
 * the guard on the credential read, or hardcodes the argument. A proof that
 * cannot fail for its own defect is not a proof.
 *
 * So this drives the REAL `Deno.serve` handler from `index.ts` — the real
 * routing, the real tenant resolution, the real co-pilot fork decision — with a
 * real `Request` in and the real TwiML out. Only two things are substituted:
 * the Supabase client (canned rows) and the `Deno` global (env + serve capture).
 *
 * The class of defect under guard, stated once: this endpoint is
 * `verify_jwt = false`, and in the production credential model the master
 * TWILIO_AUTH_TOKEN is absent, so its signature check does not run. Everything it
 * returns therefore goes to an UNAUTHENTICATED caller, and every field it reads
 * from the body is attacker-supplied. Nothing secret or capability-bearing may
 * leave in a response to a request we did not authenticate. Two things have now
 * violated that rule — the stamped `?t=` webhook secret, and the co-pilot stream
 * token — so it is asserted here against the response body itself rather than
 * against any one expression.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// ── Fixtures ────────────────────────────────────────────────────────────────
const TENANT = "7f3d2c11-1111-4111-8111-111111111111";
const SEAT = "22222222-2222-4222-8222-222222222222";
const CONTACT = "c0ffee00-3333-4333-8333-333333333333";
const OPERATOR_SEAT = "44444444-4444-4444-8444-444444444444";
const OTHER_TENANT = "9999aaaa-5555-4555-8555-555555555555";
const OTHER_SECRET = "OTHER-TENANT-SECRET-" + "x".repeat(30);
const OPERATOR_NUMBER = "+14700009999";
const TENANT_NUMBER = "+15550001111";
const WEBHOOK_SECRET = "WEBHOOK-SECRET-" + "s".repeat(40);
const STREAM_SECRET = "STREAM-SECRET-" + "z".repeat(40);
const CALLBACK_BASE = "https://ref.functions.supabase.co/functions/v1/twilio-status-callback";
const STREAM_URL = "wss://ref.functions.supabase.co/functions/v1/paige-stt";

const ENV = {
  SUPABASE_URL: "https://ref.functions.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  TWILIO_STATUS_CALLBACK_URL: CALLBACK_BASE,
  // The co-pilot is ACTIVATED in this harness on purpose. With it off the fork
  // returns "" for an unrelated reason and the token assertions would pass
  // vacuously — the exact failure mode this file exists to stop.
  VOICE_STT_STREAM_URL: STREAM_URL,
  VOICE_STREAM_SECRET: STREAM_SECRET,
  TWILIO_OPERATOR_CALLER_ID: OPERATOR_NUMBER,
  TWILIO_AUTH_TOKEN: undefined, // the production posture: no master token
};

// ── Supabase stub. Chainable, returns canned rows by table. ─────────────────
//
// TENANT-AWARE ON PURPOSE. An earlier revision returned its canned row for ANY
// `tenant_id` on tenant_twilio_subaccounts / tenant_members / clients, which meant
// no assertion in this file could tell "the right tenant's secret" from "a secret" —
// a cross-tenant stamp passed the whole suite green. Every table that has a tenant
// scope now honours it and returns [] on a mismatch, so a §9 scoping error surfaces
// as a missing value rather than as silence. OTHER_TENANT exists to be a wrong
// answer that is nonetheless a well-formed one.
function makeAdmin() {
  const reads = [];
  const rowsFor = (table, filters) => {
    if (table === "tenant_phone_numbers") {
      if (filters.phone_number && filters.phone_number !== TENANT_NUMBER) return [];
      if (filters.tenant_id && filters.tenant_id !== TENANT) return [];
      return [{ tenant_id: TENANT, phone_number: TENANT_NUMBER, is_primary: true }];
    }
    if (table === "tenant_members") {
      if (filters.tenant_id !== TENANT) return [];
      return [{ user_id: SEAT, role: "owner" }];
    }
    if (table === "user_roles") return [{ user_id: OPERATOR_SEAT, role: "super_admin" }];
    if (table === "clients") {
      if (filters.tenant_id !== TENANT) return [];
      return [{ id: CONTACT }];
    }
    if (table === "tenant_twilio_subaccounts") {
      // The distinguishing fixture: each tenant has its OWN secret, so stamping the
      // wrong tenant's is observable instead of indistinguishable.
      if (filters.tenant_id === TENANT) return [{ inbound_webhook_secret: WEBHOOK_SECRET }];
      if (filters.tenant_id === OTHER_TENANT) return [{ inbound_webhook_secret: OTHER_SECRET }];
      return [];
    }
    return [];
  };
  const builder = (table) => {
    const filters = {};
    const q = {
      select: () => q,
      eq: (k, v) => { filters[k] = v; return q; },
      in: () => q,
      or: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => { reads.push(table); const r = rowsFor(table, filters); return { data: r[0] ?? null, error: null }; },
      single: async () => { reads.push(table); const r = rowsFor(table, filters); return { data: r[0] ?? null, error: null }; },
      insert: () => q,
      update: () => q,
      upsert: () => q,
      then: (res) => { reads.push(table); res({ data: rowsFor(table, filters), error: null }); },
    };
    return q;
  };
  return {
    reads,
    from: (t) => builder(t),
    rpc: async (name) => {
      if (name === "create_and_attach_conversation") {
        return { data: { contact_id: CONTACT, conversation_id: "conv-1" }, error: null };
      }
      return { data: null, error: null };
    },
  };
}

// ── Bundle index.ts, stubbing its remote import, and capture the handler. ────
const stubSrc = `export function createClient(){ return globalThis.__ADMIN__; }`;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-twiml-handler-"));
const outFile = path.join(outDir, "index.mjs");
await build({
  entryPoints: ["supabase/functions/voice-twiml/index.ts"],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  plugins: [{
    name: "remote-stub",
    setup(b) {
      b.onResolve({ filter: /^https:\/\// }, (a) => ({ path: a.path, namespace: "remote-stub" }));
      b.onLoad({ filter: /.*/, namespace: "remote-stub" }, () => ({ contents: stubSrc, loader: "js" }));
    },
  }],
});

let handler = null;
globalThis.Deno = {
  env: { get: (k) => ENV[k] },
  serve: (h) => { handler = h; },
};
await import(pathToFileURL(outFile).href);
assert.ok(typeof handler === "function", "FAILED: did not capture the Deno.serve handler");

const post = async (body, { admin } = {}) => {
  globalThis.__ADMIN__ = admin ?? makeAdmin();
  const res = await handler(new Request("https://ref.functions.supabase.co/functions/v1/voice-twiml", {
    method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" },
  }));
  return { status: res.status, xml: await res.text(), admin: globalThis.__ADMIN__ };
};

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `FAILED: ${label}`); console.log(`  ok  ${label}`); };

console.log("voice-twiml handler smoke (real handler, unsigned requests)\n");

// ── 1. INBOUND, unsigned. The cheap attack: the dialed number is PUBLIC. ─────
{
  const { status, xml, admin } = await post(
    `To=${encodeURIComponent(TENANT_NUMBER)}&From=%2B15559998888&CallSid=CAattackerchosen`);
  check("inbound unsigned still answers with TwiML (the call is not broken)",
    status === 200 && xml.includes("<Response>"));
  check("inbound unsigned leaks NO webhook secret", !xml.includes(WEBHOOK_SECRET));
  check("inbound unsigned emits NO statusCallback", !xml.includes("statusCallback"));
  check("inbound unsigned mints NO co-pilot stream token", !xml.includes("streamToken"));
  check("inbound unsigned opens NO media stream at all", !xml.includes("<Stream"));
  check("inbound unsigned never even READS the credential table",
    !admin.reads.includes("tenant_twilio_subaccounts"));
  // Non-vacuity: the handler really did take the ring path rather than a degrade.
  // Deliberately NOT asserted on the tenant/seat UUIDs: those being in the response is
  // F5 (recorded in this PR as a real, pre-existing leak), and pinning them here would
  // turn its eventual fix into a red build labelled "path not short-circuited".
  check("...and it really did ring a seat (path not short-circuited)",
    xml.includes("<Client") && !xml.includes("<Say"));
}

// ── 2. OUTBOUND, unsigned, naming a tenant in From. The original attack. ─────
{
  const { status, xml, admin } = await post(
    `From=${encodeURIComponent(`client:${TENANT}.${SEAT}`)}&To=%2B15559998888&CallSid=CAx`);
  check("outbound unsigned still answers with TwiML", status === 200 && xml.includes("<Response>"));
  check("outbound unsigned leaks NO webhook secret", !xml.includes(WEBHOOK_SECRET));
  check("outbound unsigned emits NO statusCallback", !xml.includes("statusCallback"));
  check("outbound unsigned mints NO co-pilot stream token", !xml.includes("streamToken"));
  check("outbound unsigned never even READS the credential table",
    !admin.reads.includes("tenant_twilio_subaccounts"));
  check("...and it really did bridge the dial (path not short-circuited)", xml.includes("<Dial"));
}

// ── 3. NON-VACUITY, the load-bearing case. Flip ONLY the auth posture: set the
//       master token and sign the request. Everything the assertions above deny
//       must now APPEAR — otherwise those assertions were passing because the
//       handler never emits these things at all.
{
  const { computeTwilioSignature } = await (async () => {
    const f = path.join(outDir, "sig.mjs");
    await build({ entryPoints: ["supabase/functions/_shared/twilio-webhook-auth.ts"], outfile: f,
      bundle: true, format: "esm", platform: "neutral", target: "es2022", external: ["https://*"] });
    return import(pathToFileURL(f).href);
  })();

  const TOKEN = "master-auth-token";
  ENV.TWILIO_AUTH_TOKEN = TOKEN;
  const url = "https://ref.functions.supabase.co/functions/v1/voice-twiml";
  const body = `To=${encodeURIComponent(TENANT_NUMBER)}&From=%2B15559998888&CallSid=CAsigned`;
  const sig = await computeTwilioSignature(TOKEN, url, body);

  globalThis.__ADMIN__ = makeAdmin();
  const res = await handler(new Request(url, {
    method: "POST", body,
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig },
  }));
  const xml = await res.text();

  check("a SIGNED inbound call DOES stamp the secret", xml.includes(WEBHOOK_SECRET));
  check("a SIGNED inbound call DOES emit a statusCallback", xml.includes("statusCallback"));
  check("a SIGNED inbound call DOES mint a co-pilot stream token", xml.includes("streamToken"));
  // The inbound-path regression the callback suite could not see: the tenant here
  // is the OWNER OF THE DIALED NUMBER, not anything in `From`. A bare URL would
  // be refused 401 by the fail-closed callback endpoint.
  check("...and the inbound callback is STAMPED, not bare", xml.includes(`?t=${encodeURIComponent(WEBHOOK_SECRET)}`));
  check("...with THIS tenant's secret, not another tenant's", !xml.includes(OTHER_SECRET));

  // Decode the minted token and assert on its PAYLOAD, not merely its presence.
  // Presence alone cannot see a §9 scoping error inside it — an unscoped contact
  // lookup silently yields a token with no contact link, and the co-pilot then
  // no-ops its client linkage while every "a token was minted" assertion stays green.
  {
    const m = xml.match(/name="streamToken" value="([^"]+)"/);
    check("the minted token is well-formed", !!m && m[1].split(".").length === 3);
    const payload = JSON.parse(Buffer.from(
      m[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    check("...bound to THIS tenant", payload.t === TENANT);
    check("...bound to THIS call", payload.c === "CAsigned");
    check("...and carrying the tenant-scoped contact it resolved", payload.ct === CONTACT);
  }

  // A bad signature is a hard refusal, not a silent unsigned accept.
  globalThis.__ADMIN__ = makeAdmin();
  const bad = await handler(new Request(url, {
    method: "POST", body,
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "AAAA" },
  }));
  check("a BAD signature is rejected 403", bad.status === 403);

  // ── 4. THE OTHER THREE BRANCHES, SIGNED. ────────────────────────────────
  // The suite previously exercised 2 of the handler's 4 terminal branches, and
  // only 1 of 4 on the signed path — which is the ONLY path where a wrong-tenant
  // or bare callback is observable at all. So the per-branch fix was unguarded on
  // three of the four branches it changed. Each case below is a branch, not a
  // variation: tenant outbound, operator outbound, operator inbound.
  const signedPost = async (b) => {
    const sg = await computeTwilioSignature(TOKEN, url, b);
    globalThis.__ADMIN__ = makeAdmin();
    const r = await handler(new Request(url, {
      method: "POST", body: b,
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sg },
    }));
    return { xml: await r.text(), admin: globalThis.__ADMIN__ };
  };

  // 4a. Tenant OUTBOUND. Tenant = the authenticated `client:` identity.
  {
    const r = await signedPost(
      `From=${encodeURIComponent(`client:${TENANT}.${SEAT}`)}&To=%2B15559998888&CallSid=CAob`);
    check("signed tenant OUTBOUND stamps a callback", r.xml.includes("statusCallback"));
    check("...with THIS tenant's secret", r.xml.includes(`?t=${encodeURIComponent(WEBHOOK_SECRET)}`));
    check("...never another tenant's", !r.xml.includes(OTHER_SECRET));
    check("...and it is not bare", !r.xml.includes(`statusCallback="${CALLBACK_BASE}"`));
  }

  // 4b. Operator OUTBOUND. Tenant-less by construction (§9/§53): the master leg
  //     must carry NO tenant credential and NO tenant co-pilot fork.
  {
    const r = await signedPost(
      `From=${encodeURIComponent(`client:operator.${OPERATOR_SEAT}`)}&To=%2B15559998888&CallSid=CAop`);
    check("signed OPERATOR outbound carries NO tenant secret",
      !r.xml.includes(WEBHOOK_SECRET) && !r.xml.includes(OTHER_SECRET));
    check("...and never reads the credential table at all",
      !r.admin.reads.includes("tenant_twilio_subaccounts"));
    check("...and mints NO co-pilot token (co-pilot is tenant STT)", !r.xml.includes("streamToken"));
    check("...but does keep the bare callback (master signature authenticates it)",
      r.xml.includes(`statusCallback="${CALLBACK_BASE}"`));
  }

  // 4c. Operator INBOUND — the dialed number is the platform master number, owned
  //     by no tenant. Same §9/§53 rule as 4b.
  {
    const r = await signedPost(
      `To=${encodeURIComponent(OPERATOR_NUMBER)}&From=%2B15559998888&CallSid=CAopin`);
    check("signed OPERATOR inbound carries NO tenant secret",
      !r.xml.includes(WEBHOOK_SECRET) && !r.xml.includes(OTHER_SECRET));
    check("...and mints NO co-pilot token", !r.xml.includes("streamToken"));
    check("...and rang an OPERATOR seat, not a tenant seat",
      r.xml.includes(`operator.${OPERATOR_SEAT}`) && !r.xml.includes(`${TENANT}.${SEAT}`));
  }

  ENV.TWILIO_AUTH_TOKEN = undefined;
}

console.log(`\n${n} assertions passed.`);
