// pg_cron sweeper — recovers orphaned paige_workflow_runs.
//
// Triggered every minute. Picks up rows where:
//   - status='queued'  AND created_at < now() - 60 seconds, OR
//   - status='running' AND last_dispatched_at < now() - 5 minutes (cold-start stall)
//
// For each pick, re-loads its registry row and routes through the shared
// dispatcher with isRetry=true so retry_count increments. Hard cap of 20
// rows per sweep to stay inside the function budget.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { dispatchWorkflowRun } from "../_shared/workflowDispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_PICKS = 20;
const MAX_RETRIES = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const now = Date.now();
  const queuedCutoff = new Date(now - 60_000).toISOString();          // > 60s queued
  const runningCutoff = new Date(now - 5 * 60_000).toISOString();     // > 5min running

  // Pull queued > 60s OR running > 5min, up to MAX_PICKS rows.
  const { data: rows, error } = await admin
    .from("paige_workflow_runs")
    .select("id, registry_id, status, payload, retry_count, created_at, last_dispatched_at")
    .or(
      `and(status.eq.queued,created_at.lt.${queuedCutoff}),and(status.eq.running,last_dispatched_at.lt.${runningCutoff})`,
    )
    .lt("retry_count", MAX_RETRIES)
    .order("created_at", { ascending: true })
    .limit(MAX_PICKS);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const picks = rows ?? [];
  if (picks.length === 0) {
    return new Response(JSON.stringify({ ok: true, picked: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load all relevant registry rows in one query.
  const regIds = Array.from(new Set(picks.map((r: any) => r.registry_id).filter(Boolean)));
  const { data: regs } = await admin
    .from("paige_workflow_registry")
    .select("id, key, provider, n8n_webhook_url, needs_n8n_link, langgraph_graph_id, direct_function_name")
    .in("id", regIds);
  const regMap = new Map<string, any>((regs ?? []).map((r: any) => [r.id, r]));

  const results: Array<Record<string, unknown>> = [];
  for (const r of picks) {
    const reg = regMap.get(r.registry_id);
    if (!reg) {
      await admin.from("paige_workflow_runs").update({
        status: "failed",
        error: "registry_row_missing",
        completed_at: new Date().toISOString(),
        last_dispatched_at: new Date().toISOString(),
      }).eq("id", r.id);
      results.push({ run_id: r.id, status: "failed", error: "registry_row_missing" });
      continue;
    }
    const out = await dispatchWorkflowRun({
      runId: r.id,
      provider: reg.provider,
      n8nWebhookUrl: reg.n8n_webhook_url,
      needsN8nLink: reg.needs_n8n_link,
      langgraphGraphId: reg.langgraph_graph_id,
      directFunctionName: reg.direct_function_name,
      payload: (r.payload as Record<string, unknown>) ?? {},
      isRetry: true,
    });
    results.push({
      run_id: r.id,
      workflow_key: reg.key,
      status: out.status,
      error: out.error ?? null,
      retry_count: (r.retry_count ?? 0) + 1,
    });
  }

  return new Response(JSON.stringify({ ok: true, picked: picks.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
