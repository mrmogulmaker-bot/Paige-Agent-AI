#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SECRET = "tenant-proof-secret";
let providerCalls = 0;
let targetedTenant = null;

function makeAdmin() {
  return {
    from(table) {
      const filters = {};
      const q = {
        select: () => q,
        eq: (key, value) => { filters[key] = value; if (key === "tenant_id") targetedTenant = value; return q; },
        is: () => q,
        update: () => q,
        maybeSingle: async () => table === "tenant_twilio_subaccounts"
          ? { data: {
            subaccount_sid: "ACtenant0000000000000000000000000",
            api_key_sid: "SKtenant0000000000000000000000000",
            auth_token_vault_ref: "vault-ref",
            twiml_app_sid: "APtenant0000000000000000000000000",
            inbound_webhook_secret: SECRET,
            config: { voice_webhook_auth: "tenant_secret_v1" },
          }, error: null }
          : { data: null, error: null },
        then(resolve) { resolve({ data: null, error: null }); },
      };
      return q;
    },
    rpc(name, args) {
      if (name === "verify_cron_token") return Promise.resolve({ data: args?._token === "cron-ok", error: null });
      if (name === "read_channel_secret") return Promise.resolve({ data: "tenant-api-key-secret", error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "repair-voice-app-"));
const outFile = path.join(outDir, "index.mjs");
await build({
  entryPoints: ["supabase/functions/repair-voice-twiml-app/index.ts"],
  outfile: outFile, bundle: true, format: "esm", platform: "neutral", target: "es2022",
  plugins: [{
    name: "remote-stub",
    setup(b) {
      b.onResolve({ filter: /^https:\/\// }, (a) => ({ path: a.path, namespace: "remote-stub" }));
      b.onLoad({ filter: /.*/, namespace: "remote-stub" }, () => ({
        contents: "export function createClient(){ return globalThis.__ADMIN__; }", loader: "js",
      }));
    },
  }],
});

const ENV = {
  SUPABASE_URL: "https://ref.functions.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  TWILIO_ACCOUNT_SID: "ACmaster0000000000000000000000000",
  TWILIO_API_KEY_SID: "SKmaster0000000000000000000000000",
  TWILIO_API_KEY_SECRET: "master-api-key-secret",
  TWILIO_OPERATOR_TWIML_APP_SID: "APoperator00000000000000000000000",
};
let handler;
globalThis.__ADMIN__ = makeAdmin();
globalThis.Deno = { env: { get: (key) => ENV[key] }, serve: (fn) => { handler = fn; } };
globalThis.fetch = async () => {
  providerCalls++;
  return new Response(JSON.stringify({ sid: "APok" }), { status: 200, headers: { "content-type": "application/json" } });
};
await import(pathToFileURL(outFile).href);

const invoke = (body, token = null) => handler(new Request("https://ref/functions/v1/repair-voice-twiml-app", {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { "x-cron-token": token } : {}) },
  body: JSON.stringify(body),
}));

assert.equal((await invoke({ scope: "tenant", tenant_id: TENANT })).status, 401);
assert.equal(providerCalls, 0, "unauthorized caller must not reach provider");
assert.equal((await invoke({ scope: "tenant", tenant_id: "not-a-uuid" }, "cron-ok")).status, 400);
assert.equal(providerCalls, 0, "invalid target must not reach provider");

const tenantResponse = await invoke({ scope: "tenant", tenant_id: TENANT }, "cron-ok");
const tenantBody = await tenantResponse.text();
assert.equal(tenantResponse.status, 200);
assert.equal(targetedTenant, TENANT, "repair must use exactly the authorized target");
assert.equal(providerCalls, 1, "force repair must contact provider despite durable marker");
assert.ok(!tenantBody.includes(TENANT) && !tenantBody.includes(SECRET), "response must contain no target or secret");

const operatorResponse = await invoke({ scope: "operator" }, "cron-ok");
const operatorBody = await operatorResponse.text();
assert.equal(operatorResponse.status, 200);
assert.equal(providerCalls, 2, "operator repair contacts only the operator application");
assert.ok(!operatorBody.includes("APoperator") && !operatorBody.includes("master-api-key-secret"));

console.log("PASS — repair endpoint auth, one-target scope, forced provider write, and redacted response");
