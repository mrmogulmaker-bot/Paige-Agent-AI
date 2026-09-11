// resend-admin-probe — a one-shot DIAGNOSTIC + REPAIR tool for the inbound email
// chain (#1089). Uses the account's existing RESEND_API_KEY from function env
// SERVER-SIDE ONLY (the key never appears in any response or log) to interrogate
// Resend's own API: what domains exist, what webhooks exist, whether the inbound
// webhook points where it should — and to create/fix it when asked.
//
// Auth: the Vault cron token (verify_cron_token) or the service bearer — same gate
// as every internal beat. verify_jwt must be false (cron-style).
//
// Actions:
//   {action:"status"}       → domains[] + webhooks[] (non-secret fields only)
//   {action:"fix-webhook"}  → ensures ONE webhook exists pointing at
//                             handle-inbound-email with the email.inbound event
//                             (creates or updates by id); returns its signing
//                             secret ONCE so the operator can install it — the
//                             secret rotates per create, so it is only revealed
//                             at creation/repair time to the authorized caller.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API = "https://api.resend.com";
const INBOUND_HANDLER_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/handle-inbound-email`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer.length > 0 && bearer === SERVICE_ROLE;
  if (!authorized) {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    if (cronToken) {
      const { data: ok } = await admin.rpc("verify_cron_token", { _token: cronToken });
      authorized = ok === true;
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "no_resend_api_key_in_env" }, 500);
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "status";

  // ---- status: domains + webhooks, non-secret projections only ----
  if (action === "status") {
    const [domRes, whRes] = await Promise.all([
      fetch(`${RESEND_API}/domains?limit=50`, { headers: authHeaders }),
      fetch(`${RESEND_API}/webhooks`, { headers: authHeaders }),
    ]);
    const domains = domRes.ok ? await domRes.json() : { error: domRes.status };
    const webhooks = whRes.ok ? await whRes.json() : { error: whRes.status };
    const project = (d: Record<string, unknown>) => ({
      id: d.id, name: d.name, status: d.status, region: d.region, created_at: d.created_at,
    });
    return json({
      ok: true,
      domains: Array.isArray(domains?.data) ? domains.data.map(project) : domains,
      webhooks: Array.isArray(webhooks?.data)
        ? webhooks.data.map((w: Record<string, unknown>) => ({
            id: w.id, endpoint_url: w.endpointUrl ?? w.endpoint_url ?? w.url, events: w.events, status: w.status,
          }))
        : webhooks,
      expected_handler: INBOUND_HANDLER_URL,
    });
  }

  // ---- fix-webhook: ensure the inbound webhook exists, correctly pointed ----
  if (action === "fix-webhook") {
    const whRes = await fetch(`${RESEND_API}/webhooks`, { headers: authHeaders });
    const list = whRes.ok ? (await whRes.json())?.data ?? [] : [];
    type Wh = { id: string; endpointUrl?: string; endpoint_url?: string; url?: string };
    const urlOf = (w: Wh) => w.endpointUrl ?? w.endpoint_url ?? w.url ?? "";
    const existing = (list as Wh[]).find((w) => urlOf(w) === INBOUND_HANDLER_URL);

    // Resend's create-webhook schema: `endpoint` + `events` (the live 422 named the field).
    const payload = JSON.stringify({
      endpoint: INBOUND_HANDLER_URL,
      events: ["email.received"],  // Resend's inbound event name (NOT email.inbound — the runbook correction)
    });

    let result: Response;
    if (existing) {
      // Update in place (re-asserts the event set; does NOT rotate the secret).
      result = await fetch(`${RESEND_API}/webhooks/${existing.id}`, {
        method: "PATCH", headers: authHeaders, body: payload,
      });
    } else {
      result = await fetch(`${RESEND_API}/webhooks`, {
        method: "POST", headers: authHeaders, body: payload,
      });
    }
    const out = await result.json().catch(() => ({}));
    if (!result.ok) return json({ ok: false, error: `resend_${result.status}`, detail: out }, 502);
    return json({
      ok: true,
      created: !existing,
      webhook: { id: out.id, endpoint_url: out.endpointUrl ?? out.endpoint_url, events: out.events },
      // The signing secret — returned ONCE to the authorized operator for install.
      signing_secret: out.secret ?? out.signingSecret ?? null,
      install_hint: "Write this to RESEND_WEBHOOK_SECRET (fn env or the admin_app_settings fallback the handler reads).",
    });
  }

  return json({ error: "unknown_action" }, 400);
});
