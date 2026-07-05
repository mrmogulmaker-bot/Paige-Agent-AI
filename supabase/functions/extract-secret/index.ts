// supabase/functions/extract-secret/index.ts
// SPRINT P.S.M Phase 1 — allowlisted single-secret VERIFIER (one-shot).
//
// Purpose: before the BYO Supabase cutover, confirm that the operator's saved
// copies of the app-internal, ENV-ONLY encryption keys match what is live in the
// source project. Hash-by-default: plaintext is never returned unless reveal:true
// is explicitly passed. super_admin-only. Every invocation is audited.
//
// ONE-SHOT: DELETE this function at Phase 1 exit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hard allowlist — the ONLY secrets this function can ever touch.
const ALLOWLIST = new Set([
  "CALENDAR_ENCRYPTION_KEY",
  "AUTOMATION_WEBHOOK_ENCRYPTION_KEY",
  "QUICKBOOKS_TOKEN_ENCRYPTION_KEY",
]);

const json = (body: unknown, status = 200, reqId?: string) =>
  new Response(JSON.stringify(reqId ? { request_id: reqId, ...(body as object) } : body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const log = (reqId: string, stage: string, p: Record<string, unknown> = {}) => {
  try {
    console.log(JSON.stringify({ fn: "extract-secret", request_id: reqId, stage, ts: new Date().toISOString(), ...p }));
  } catch {
    console.log(`[${reqId}] ${stage}`);
  }
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const reqId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`).toString();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, reqId);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) { log(reqId, "auth_missing"); return json({ error: "Unauthorized" }, 401, reqId); }

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await caller.auth.getUser();
  if (userErr || !user) { log(reqId, "auth_failed", { error: userErr?.message }); return json({ error: "Unauthorized" }, 401, reqId); }
  const { data: isSuper, error: rpcErr } = await caller.rpc("is_super_admin");
  if (rpcErr) { log(reqId, "gate_rpc_error", { error: rpcErr.message }); return json({ error: "gate check failed" }, 500, reqId); }
  if (isSuper !== true) { log(reqId, "forbidden_not_super_admin", { caller_id: user.id }); return json({ error: "Forbidden" }, 403, reqId); }

  let body: { secret_name?: string; reveal?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400, reqId); }
  const secretName = (body.secret_name ?? "").toString();
  const reveal = body.reveal === true;
  const mode = reveal ? "reveal" : "hash";

  if (!ALLOWLIST.has(secretName)) {
    log(reqId, "rejected_not_allowlisted", { caller_id: user.id });
    return json({ error: "secret_name not in allowlist" }, 400, reqId);
  }

  const value = Deno.env.get(secretName);
  if (!value) {
    log(reqId, "secret_not_configured");
    return json({ error: "secret not configured" }, 500, reqId);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error: auditErr } = await admin.from("paige_audit_log").insert({
    actor_user_id: user.id,
    actor_role: "super_admin",
    action: "extract_secret",
    target_type: "secret",
    payload: { secret_name: secretName, mode },
  });
  if (auditErr) {
    log(reqId, "audit_write_failed", { error: auditErr.message });
    return json({ error: "audit write failed — refusing to return secret" }, 500, reqId);
  }
  log(reqId, "verified", { caller_id: user.id, secret_name: secretName, mode });

  return json({
    ok: true,
    secret_name: secretName,
    mode,
    present: true,
    length: value.length,
    sha256: await sha256Hex(value),
    ...(reveal
      ? { value, warning: `Plaintext for ${secretName} was returned. Rotate this key after migration cutover completes.` }
      : {}),
  }, 200, reqId);
});
