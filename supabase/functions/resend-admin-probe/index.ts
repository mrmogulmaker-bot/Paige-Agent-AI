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
    // The LIST response hides endpoints; fetch each webhook's DETAIL for the truth.
    const detailList: Array<Record<string, unknown>> = [];
    if (Array.isArray(webhooks?.data)) {
      for (const w of webhooks.data as Array<{ id: string }>) {
        const d = await fetch(`${RESEND_API}/webhooks/${w.id}`, { headers: authHeaders });
        const dj = d.ok ? await d.json() : { error: d.status };
        detailList.push({
          id: dj.id ?? w.id,
          endpoint: dj.endpointUrl ?? dj.endpoint_url ?? dj.endpoint ?? dj.url ?? null,
          events: dj.events ?? null,
          status: dj.status ?? null,
          // Secret fields (if the API exposes any) — surfaced to the authorized operator only.
          secret_fields: Object.keys(dj).filter((k) => /secret/i.test(k)),
          secret_values: Object.fromEntries(Object.entries(dj).filter(([k]) => /secret/i.test(k))),
        });
      }
    }
    return json({
      ok: true,
      domains: Array.isArray(domains?.data) ? domains.data.map(project) : domains,
      webhooks: detailList.length ? detailList : webhooks,
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

  // ---- set-endpoint: repoint a webhook (by id) at a given URL -----------------
  if (action === "set-endpoint" && typeof body.webhook_id === "string" && typeof body.endpoint === "string") {
    const r = await fetch(`${RESEND_API}/webhooks/${body.webhook_id}`, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({ endpoint: body.endpoint }),
    });
    const out = await r.json().catch(() => ({}));
    return r.ok ? json({ ok: true, webhook: { id: out.id, endpoint: out.endpointUrl ?? out.endpoint ?? body.endpoint } })
                : json({ ok: false, error: `resend_${r.status}`, detail: out }, 502);
  }

  // ---- list-inbound: does Resend's API expose received emails? ---------------
  // The webhook fires email.received; the question is whether GET /emails (or any
  // endpoint) returns them. This action tries the known candidates and reports
  // what works — the polling beat's foundation.
  if (action === "list-inbound") {
    const attempts: Array<{ endpoint: string; status: number; count?: number; sample?: unknown }> = [];
    const candidates = [
      `${RESEND_API}/emails?limit=5`,
      `${RESEND_API}/emails?direction=inbound&limit=5`,
      `${RESEND_API}/inbound/emails?limit=5`,
      `${RESEND_API}/domains/thegtri.resend.app/emails?limit=5`,
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url, { headers: authHeaders });
        const j = r.ok ? await r.json() : null;
        const items = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : null;
        attempts.push({
          endpoint: url.replace(RESEND_API, ""),
          status: r.status,
          count: items?.length ?? undefined,
          sample: items?.[0] ? { id: items[0].id, from: items[0].from, to: items[0].to, subject: items[0].subject, created_at: items[0].created_at, direction: items[0].direction } : undefined,
        });
      } catch (e) {
        attempts.push({ endpoint: url.replace(RESEND_API, ""), status: 0, sample: { error: (e as Error).message } });
      }
    }
    return json({ ok: true, attempts });
  }

  return json({ error: "unknown_action" }, 400);
});
