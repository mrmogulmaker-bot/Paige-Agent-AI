import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, intuit-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

const REVENUE_ENTITIES = new Set(["Invoice", "Payment", "SalesReceipt", "Deposit"]);
const EXPENSE_ENTITIES = new Set(["Purchase", "Bill", "BillPayment", "Employee"]);
const SKIP_ENTITIES = new Set(["Customer", "Vendor"]);

interface EntityChange {
  name: string;
  id: string;
  operation: string;
  lastUpdated?: string;
}

interface EventNotification {
  realmId: string;
  dataChangeEvent?: { entities?: EntityChange[] };
}

interface WebhookPayload {
  eventNotifications?: EventNotification[];
}

function verifySignature(rawBody: string, signatureHeader: string | null, token: string): boolean {
  if (!signatureHeader) return false;
  const computed = createHmac("sha256", token).update(rawBody).digest("base64");
  // Constant-time-ish compare
  if (computed.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

async function triggerSync(connectionId: string, userId: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/quickbooks-sync-financials`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Fire-and-forget; do not await response body to keep webhook fast
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ user_id: userId, connection_id: connectionId, source: "webhook" }),
  }).catch((e) => console.warn("[qb-webhook] sync trigger failed:", e instanceof Error ? e.message : String(e)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const verifierToken = Deno.env.get("QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN");
  if (!verifierToken) {
    console.error("[qb-webhook] Missing QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN secret");
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }

  // 1. Verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const tokenParam = url.searchParams.get("intuit_webhook_verifier_token") ?? url.searchParams.get("verifier_token");
    if (!tokenParam || tokenParam !== verifierToken) {
      return new Response("Invalid verifier token", { status: 401, headers: corsHeaders });
    }
    return new Response(tokenParam, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // 2. Signature validation — must read raw body
  const rawBody = await req.text();
  const sigHeader = req.headers.get("intuit-signature");
  if (!verifySignature(rawBody, sigHeader, verifierToken)) {
    console.warn("[qb-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  // 3. Parse payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const notifications = payload.eventNotifications ?? [];
  if (notifications.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const processed: Array<{ realm: string; status: string; reason?: string }> = [];

  for (const notif of notifications) {
    try {
      const realmId = notif.realmId;
      const entities = notif.dataChangeEvent?.entities ?? [];
      if (!realmId || entities.length === 0) {
        processed.push({ realm: realmId ?? "unknown", status: "skipped", reason: "empty" });
        continue;
      }

      // 4. Connection lookup
      const { data: conn, error: connErr } = await supabase
        .from("quickbooks_connections")
        .select("id, user_id, last_webhook_received_at, needs_revenue_sync, needs_expense_sync")
        .eq("qb_realm_id", realmId)
        .eq("is_active", true)
        .maybeSingle();

      if (connErr || !conn) {
        processed.push({ realm: realmId, status: "no_connection" });
        continue;
      }

      // 5. Smart targeting — aggregate flags across all entities in this notification
      let needsRevenue = conn.needs_revenue_sync ?? false;
      let needsExpense = conn.needs_expense_sync ?? false;
      let anyRelevant = false;

      for (const ent of entities) {
        if (SKIP_ENTITIES.has(ent.name)) continue;
        if (REVENUE_ENTITIES.has(ent.name)) {
          needsRevenue = true;
          anyRelevant = true;
        } else if (EXPENSE_ENTITIES.has(ent.name)) {
          needsExpense = true;
          anyRelevant = true;
        }
      }

      if (!anyRelevant) {
        // Still update last_webhook_received_at for visibility, but no sync trigger
        await supabase
          .from("quickbooks_connections")
          .update({ last_webhook_received_at: now.toISOString() })
          .eq("id", conn.id);
        processed.push({ realm: realmId, status: "low_priority_skip" });
        continue;
      }

      // Debounce check
      const lastTs = conn.last_webhook_received_at ? new Date(conn.last_webhook_received_at).getTime() : 0;
      const withinDebounce = lastTs && now.getTime() - lastTs < DEBOUNCE_MS;

      // Always update timestamp + flags
      await supabase
        .from("quickbooks_connections")
        .update({
          last_webhook_received_at: now.toISOString(),
          needs_revenue_sync: needsRevenue,
          needs_expense_sync: needsExpense,
        })
        .eq("id", conn.id);

      if (withinDebounce) {
        processed.push({ realm: realmId, status: "debounced" });
        continue;
      }

      // Trigger sync (fire-and-forget); reset flags optimistically
      await supabase
        .from("quickbooks_connections")
        .update({ needs_revenue_sync: false, needs_expense_sync: false })
        .eq("id", conn.id);

      triggerSync(conn.id, conn.user_id);
      processed.push({ realm: realmId, status: "sync_triggered" });
    } catch (e) {
      console.error("[qb-webhook] notification error:", e instanceof Error ? e.message : String(e));
      processed.push({ realm: notif.realmId ?? "unknown", status: "error" });
    }
  }

  // 6. Always 200 fast
  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
