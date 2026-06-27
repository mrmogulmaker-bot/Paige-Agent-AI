// Plaid link token create — SCAFFOLDING. Inactive until paige_config.plaid_activated.
import { requireAdmin, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { admin } = gate;

  const { contact_id } = await req.json().catch(() => ({}));
  if (!contact_id) return jsonResponse({ error: "contact_id required" }, 400);

  const { data: cfg } = await admin
    .from("paige_config")
    .select("plaid_activated, plaid_env")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.plaid_activated) {
    return jsonResponse({ activated: false, message: "Plaid not yet activated" }, 200);
  }

  const clientId = Deno.env.get("PLAID_CLIENT_ID");
  const secret = Deno.env.get("PLAID_SECRET");
  if (!clientId || !secret) {
    return jsonResponse({ activated: false, message: "Plaid secrets missing" }, 200);
  }

  const env = cfg.plaid_env ?? "sandbox";
  const host = env === "production" ? "https://production.plaid.com"
    : env === "development" ? "https://development.plaid.com"
    : "https://sandbox.plaid.com";

  const res = await fetch(`${host}/link/token/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      secret,
      client_name: "Paige Agent AI",
      user: { client_user_id: contact_id },
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: "plaid_api_error", status: res.status, body: text }, 502);
  }
  const data = await res.json();
  return jsonResponse({ ok: true, link_token: data.link_token, expiration: data.expiration });
});
