// Wave 3 — Unassigned SLA Watcher
// Cron-triggered every 30 min. Bearer-protected by SLA_WATCHER_CRON_SECRET.
// Fires Telegram alerts via MMA OS bridge (push_admin_notification) and
// mirrors into paige_admin_notifications. Dedupes per (client,category,severity) per 24h.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("SLA_WATCHER_CRON_SECRET") ?? "";
const MMA_OS_BRIDGE_URL = Deno.env.get("MMA_OS_BRIDGE_URL") ?? "";
const MMA_OS_BRIDGE_API_KEY = Deno.env.get("MMA_OS_BRIDGE_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Row = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  tier: string | null;
  unassigned_for_hours: number | null;
};

function thresholdFor(tier: string | null, hours: number) {
  if (!tier) return null;
  if (tier === "vip" && hours > 6) return { severity: "critical", emoji: "🚨" };
  if (tier === "premium" && hours > 24) return { severity: "warning", emoji: "🟡" };
  if (tier === "standard" && hours > 72) return { severity: "low", emoji: "⚪" };
  return null;
}

function tsafe(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "cron_secret_missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !tsafe(auth.slice(7), CRON_SECRET)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: queue, error } = await supabase
    .from("paige_unassigned_queue")
    .select("id,email,first_name,last_name,tier,unassigned_for_hours");

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const fired: any[] = [];
  const skipped: any[] = [];

  for (const row of (queue ?? []) as Row[]) {
    const hours = Number(row.unassigned_for_hours ?? 0);
    const t = thresholdFor(row.tier, hours);
    if (!t) continue;

    // Dedupe: skip if a matching alert in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("paige_sla_alert_log")
      .select("id")
      .eq("client_id", row.client_id)
      .eq("category", "unassigned_sla")
      .eq("severity", t.severity)
      .gte("sent_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      skipped.push({ client_id: row.client_id, reason: "dedupe_24h" });
      continue;
    }

    const message =
      `${t.emoji} ${row.tier?.toUpperCase()} unassigned > threshold: ` +
      `${row.full_name ?? "Unknown"} (${row.email ?? "no-email"}) | ` +
      `tier: ${row.tier} | unassigned_for_hours: ${hours.toFixed(1)}`;

    // 1. Local mirror notification (drives in-app bell)
    await supabase.from("paige_admin_notifications").insert({
      severity: t.severity === "critical" ? "urgent" : t.severity === "warning" ? "warning" : "info",
      title: `Unassigned ${row.tier} > SLA`,
      body: message,
      link_to: `/admin/contacts/${row.client_id}`,
      source_workflow_key: "unassigned_sla",
      contact_id: row.client_id,
      scope: "admin",
    });

    // 2. Telegram via MMA OS bridge
    if (MMA_OS_BRIDGE_URL && MMA_OS_BRIDGE_API_KEY) {
      try {
        await fetch(MMA_OS_BRIDGE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MMA_OS_BRIDGE_API_KEY}`,
          },
          body: JSON.stringify({
            verb: "push_admin_notification",
            category: "unassigned_sla",
            severity: t.severity,
            message,
            metadata: {
              client_id: row.client_id,
              email: row.email,
              tier: row.tier,
              hours_unassigned: hours,
            },
          }),
        });
      } catch (e) {
        console.error("mma_os_bridge_failed", String(e));
      }
    }

    // 3. Dedupe log
    await supabase.from("paige_sla_alert_log").insert({
      client_id: row.client_id,
      category: "unassigned_sla",
      severity: t.severity,
      hours_unassigned: hours,
      metadata: { email: row.email, tier: row.tier },
    });

    fired.push({ client_id: row.client_id, severity: t.severity, hours });
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: queue?.length ?? 0, fired, skipped_count: skipped.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
