// Plaid item updates webhook. SCAFFOLDING - records into webhook_event_log.
import { corsHeaders } from "../_shared/adminAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.text();
  let event: Record<string, unknown> = {};
  try { event = JSON.parse(body); } catch { /* noop */ }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  await admin.from("webhook_event_log").insert({
    source: "paige-plaid",
    event_type: (event.webhook_type ?? "unknown") as string,
    payload: event,
  }).catch(() => null);

  // When activated, trigger paige-plaid-sync-transactions for the item.
  const { data: cfg } = await admin
    .from("paige_config")
    .select("plaid_activated")
    .eq("id", 1)
    .maybeSingle();
  if (cfg?.plaid_activated && event.webhook_code === "SYNC_UPDATES_AVAILABLE" && event.item_id) {
    const { data: conn } = await admin
      .from("paige_bank_connections")
      .select("id")
      .eq("plaid_item_id", event.item_id)
      .maybeSingle();
    if (conn) {
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const url = Deno.env.get("SUPABASE_URL");
      await fetch(`${url}/functions/v1/paige-plaid-sync-transactions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${svc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: conn.id }),
      }).catch(() => null);
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
