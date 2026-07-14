// Bridge Auth Watcher
// Polls paige_bridge_auth_failures for un-alerted 401/403 entries and
// fires an admin notification + optional Telegram alert via MMA OS bridge.
// Cron-triggered every 5 min. Bearer-protected by SLA_WATCHER_CRON_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("SLA_WATCHER_CRON_SECRET") ?? "";
const PAIGE_OS_BRIDGE_URL = Deno.env.get("PAIGE_OS_BRIDGE_URL") ?? "";
const PAIGE_OS_BRIDGE_API_KEY = Deno.env.get("PAIGE_OS_BRIDGE_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

  // Pull un-alerted failures from the last hour.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: failures, error } = await supabase
    .from("paige_bridge_auth_failures")
    .select("id, occurred_at, function_name, status, verb, reason, ip, user_agent")
    .is("alerted_at", null)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!failures || failures.length === 0) {
    return new Response(JSON.stringify({ ok: true, scanned: 0, alerted: 0 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group by function + ip + reason for a compact summary.
  const byKey = new Map<string, { count: number; sample: typeof failures[number] }>();
  for (const f of failures) {
    const key = `${f.function_name}|${f.ip ?? "?"}|${f.status}|${f.reason ?? ""}`;
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { count: 1, sample: f });
  }

  const lines = Array.from(byKey.values()).map(({ count, sample }) =>
    `• ${sample.function_name} ${sample.status} ×${count} — "${sample.reason ?? "?"}" ` +
    `(verb: ${sample.verb ?? "?"}, ip: ${sample.ip ?? "?"}, ua: ${(sample.user_agent ?? "?").slice(0, 60)})`
  );

  const message =
    `🚨 Bridge auth failures detected (${failures.length} in last hour)\n` +
    lines.join("\n") +
    `\n\nLikely cause: stale PAIGE_BRIDGE_API_KEY on a caller (LangGraph / n8n / Paige Agent AI).`;

  // 1. Local mirror notification (drives in-app bell)
  await supabase.from("paige_admin_notifications").insert({
    severity: "urgent",
    title: `Bridge auth failures (${failures.length})`,
    body: message,
    link_to: `/admin/settings`,
    source_workflow_key: "bridge_auth_failure",
    scope: "admin",
  });

  // 2. Telegram via MMA OS bridge (best-effort)
  if (PAIGE_OS_BRIDGE_URL && PAIGE_OS_BRIDGE_API_KEY) {
    try {
      await fetch(PAIGE_OS_BRIDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PAIGE_OS_BRIDGE_API_KEY}`,
        },
        body: JSON.stringify({
          verb: "push_admin_notification",
          category: "bridge_auth_failure",
          severity: "critical",
          message,
          metadata: { total: failures.length, groups: Array.from(byKey.keys()) },
        }),
      });
    } catch (e) {
      console.error("mma_os_bridge_failed", String(e));
    }
  }

  // 3. Mark as alerted
  const ids = failures.map((f) => f.id);
  await supabase
    .from("paige_bridge_auth_failures")
    .update({ alerted_at: new Date().toISOString() })
    .in("id", ids);

  return new Response(
    JSON.stringify({ ok: true, scanned: failures.length, alerted: ids.length, groups: byKey.size }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
