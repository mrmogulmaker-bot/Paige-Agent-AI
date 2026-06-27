// Plaid sync transactions for a connection. SCAFFOLDING.
import { requireAdmin, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { admin } = gate;

  const { connection_id } = await req.json().catch(() => ({}));
  if (!connection_id) return jsonResponse({ error: "connection_id required" }, 400);

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

  const { data: conn } = await admin
    .from("paige_bank_connections")
    .select("id, plaid_access_token_encrypted")
    .eq("id", connection_id)
    .maybeSingle();
  if (!conn) return jsonResponse({ error: "connection not found" }, 404);

  const { data: token, error: decErr } = await admin.rpc("qb_decrypt_token", {
    _ciphertext: conn.plaid_access_token_encrypted,
  });
  if (decErr) return jsonResponse({ error: "decrypt_failed" }, 500);

  const env = cfg.plaid_env ?? "sandbox";
  const host = env === "production" ? "https://production.plaid.com"
    : env === "development" ? "https://development.plaid.com"
    : "https://sandbox.plaid.com";

  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const txRes = await fetch(`${host}/transactions/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      secret,
      access_token: token,
      start_date: start,
      end_date: end,
      options: { count: 250 },
    }),
  });
  if (!txRes.ok) {
    const text = await txRes.text();
    return jsonResponse({ error: "plaid_tx_error", status: txRes.status, body: text }, 502);
  }
  const txData = await txRes.json();
  const rows = (txData.transactions ?? []).map((t: Record<string, unknown>) => ({
    bank_connection_id: connection_id,
    plaid_transaction_id: t.transaction_id,
    date: t.date,
    amount_cents: Math.round((t.amount as number) * 100),
    name: t.name,
    category: t.category ?? null,
    pending: !!t.pending,
    account_id: t.account_id,
  }));

  if (rows.length) {
    await admin
      .from("paige_bank_transactions")
      .upsert(rows, { onConflict: "plaid_transaction_id" });
  }

  await admin
    .from("paige_bank_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", connection_id);

  return jsonResponse({ ok: true, synced: rows.length });
});
