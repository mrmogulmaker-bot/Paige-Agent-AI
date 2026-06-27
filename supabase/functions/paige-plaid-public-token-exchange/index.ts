// Plaid exchange public_token -> access_token, store encrypted. SCAFFOLDING.
import { requireAdmin, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { admin } = gate;

  const { contact_id, public_token, institution_name } = await req.json().catch(() => ({}));
  if (!contact_id || !public_token) return jsonResponse({ error: "missing fields" }, 400);

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

  const exchangeRes = await fetch(`${host}/item/public_token/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, public_token }),
  });
  if (!exchangeRes.ok) {
    const text = await exchangeRes.text();
    return jsonResponse({ error: "plaid_exchange_error", status: exchangeRes.status, body: text }, 502);
  }
  const { access_token, item_id } = await exchangeRes.json();

  // Encrypt access token via qb_encrypt_token (pgcrypto wrapper)
  const { data: encrypted, error: encErr } = await admin.rpc("qb_encrypt_token", {
    _plaintext: access_token,
  });
  if (encErr) return jsonResponse({ error: "encrypt_failed", detail: encErr.message }, 500);

  const accountsRes = await fetch(`${host}/accounts/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, access_token }),
  });
  const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [] };

  const { data: row, error: insErr } = await admin
    .from("paige_bank_connections")
    .insert({
      contact_id,
      plaid_item_id: item_id,
      plaid_access_token_encrypted: encrypted,
      institution_name: institution_name ?? null,
      accounts: accountsData.accounts ?? [],
      status: "active",
    })
    .select("id")
    .single();
  if (insErr) return jsonResponse({ error: insErr.message }, 500);

  return jsonResponse({ ok: true, connection_id: row.id });
});
