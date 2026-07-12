// pg_cron sweeper — recovers orphaned paige_workflow_runs.
//
// Triggered every minute. Two distinct jobs:
//   1. QUEUED rows older than 60s → re-dispatch via shared dispatcher (isRetry=true).
//   2. RUNNING rows with provider='langgraph_bridge' older than 60s →
//      poll MMA OS langgraph-bridge `get_run` verb. If terminal, flip the row
//      to succeeded/failed. If still running, just bump last_dispatched_at so
//      we don't re-poll for another minute. This replaces the previous
//      "blind re-dispatch after 5 min" behavior that caused duplicate runs.
//   3. RUNNING rows on other providers older than 5 min → re-dispatch.
//
// Hard cap of 20 rows per sweep to stay inside the function budget.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { dispatchWorkflowRun } from "../_shared/workflowDispatch.ts";
import { contactHintsFromPayload, emitAutomationRail } from "../_shared/railAutomation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BRIDGE_URL = Deno.env.get("PAIGE_OS_LANGGRAPH_BRIDGE_URL") ?? "";
const BRIDGE_KEY = Deno.env.get("PAIGE_OS_LANGGRAPH_BRIDGE_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_PICKS = 20;
const MAX_RETRIES = 5;
// LangSmith run states: 'pending' | 'running' | 'success' | 'error' | 'timeout' | 'interrupted'
const TERMINAL_OK = new Set(["success", "completed"]);
const TERMINAL_FAIL = new Set(["error", "failed", "timeout", "interrupted", "cancelled"]);

async function pollLangGraphBridgeRun(
  threadId: string | null,
  runId: string | null,
): Promise<{ status: string | null; output?: unknown; error?: string | null } | null> {
  if (!BRIDGE_URL || !BRIDGE_KEY || !runId) return null;
  try {
    const res = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_KEY}`,
      },
      body: JSON.stringify({
        verb: "get_run",
        thread_id: threadId,
        run_id: runId,
      }),
    });
    const txt = await res.text();
    let body: any = null;
    try { body = JSON.parse(txt); } catch { /* */ }
    if (!res.ok) {
      return { status: null, error: `bridge_${res.status}: ${txt.slice(0, 200)}` };
    }
    // Bridge response shape (best-effort): { ok, run: { status, output, error } } or flat.
    const status = body?.run?.status ?? body?.status ?? null;
    const output = body?.run?.output ?? body?.output ?? body?.run ?? body;
    const error = body?.run?.error ?? body?.error ?? null;
    return { status, output, error };
  } catch (e) {
    return { status: null, error: (e as Error).message.slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const now = Date.now();
  const queuedCutoff = new Date(now - 60_000).toISOString();           // > 60s queued
  const bridgePollCutoff = new Date(now - 60_000).toISOString();       // > 60s running for bridge polling
  const runningStallCutoff = new Date(now - 5 * 60_000).toISOString(); // > 5min running for re-dispatch

  // 1. Queued rows needing first dispatch / retry.
  const { data: queuedRows } = await admin
    .from("paige_workflow_runs")
    .select("id, registry_id, status, payload, retry_count, created_at, last_dispatched_at")
    .eq("status", "queued")
    .lt("created_at", queuedCutoff)
    .lt("retry_count", MAX_RETRIES)
    .order("created_at", { ascending: true })
    .limit(MAX_PICKS);

  // 2. Running rows on langgraph_bridge needing completion check.
  const { data: bridgeRunning } = await admin
    .from("paige_workflow_runs")
    .select("id, registry_id, status, payload, n8n_execution_id, langgraph_thread_id, retry_count, last_dispatched_at, paige_workflow_registry!inner(provider, label, tenant_id)")
    .eq("status", "running")
    .eq("paige_workflow_registry.provider", "langgraph_bridge")
    .lt("last_dispatched_at", bridgePollCutoff)
    .order("last_dispatched_at", { ascending: true })
    .limit(MAX_PICKS);

  // 3. Running rows on OTHER providers stalled > 5min (re-dispatch).
  const { data: otherStalled } = await admin
    .from("paige_workflow_runs")
    .select("id, registry_id, status, payload, retry_count, last_dispatched_at, paige_workflow_registry!inner(provider)")
    .eq("status", "running")
    .neq("paige_workflow_registry.provider", "langgraph_bridge")
    .lt("last_dispatched_at", runningStallCutoff)
    .lt("retry_count", MAX_RETRIES)
    .order("last_dispatched_at", { ascending: true })
    .limit(MAX_PICKS);

  const results: Array<Record<string, unknown>> = [];

  // ----- Pass 2: completion polling for langgraph_bridge -----
  for (const r of bridgeRunning ?? []) {
    const poll = await pollLangGraphBridgeRun(
      (r as any).langgraph_thread_id ?? null,
      (r as any).n8n_execution_id ?? null,
    );
    if (!poll) {
      results.push({ run_id: r.id, mode: "bridge_poll", status: "skipped" });
      continue;
    }
    const stamp = new Date().toISOString();
    if (poll.status && TERMINAL_OK.has(poll.status)) {
      await admin.from("paige_workflow_runs").update({
        status: "succeeded",
        result: poll.output as never,
        completed_at: stamp,
        last_dispatched_at: stamp,
      }).eq("id", r.id);
      // Rail (owner_ops) — the async bridge run has genuinely COMPLETED (§13: only on
      // real terminal success). Its automation.fired was emitted at dispatch time
      // (paige-mcp), so this pairs it. Best-effort + non-blocking; skips without a client.
      {
        const reg = (r as any).paige_workflow_registry ?? {};
        const hints = contactHintsFromPayload((r as any).payload ?? {});
        await emitAutomationRail(admin, {
          tenantId: reg?.tenant_id ?? null,
          contactId: hints.contactId, email: hints.email, phone: hints.phone,
          workflowName: reg?.label ?? null,
          phase: "completed", refTable: "paige_workflow_runs", refId: r.id,
        });
      }
      results.push({ run_id: r.id, mode: "bridge_poll", status: "succeeded" });
    } else if (poll.status && TERMINAL_FAIL.has(poll.status)) {
      await admin.from("paige_workflow_runs").update({
        status: "failed",
        error: poll.error ?? `langgraph_${poll.status}`,
        result: poll.output as never,
        completed_at: stamp,
        last_dispatched_at: stamp,
      }).eq("id", r.id);
      results.push({ run_id: r.id, mode: "bridge_poll", status: "failed", error: poll.error ?? poll.status });
    } else {
      // Still running — just bump last_dispatched_at so we wait another 60s before re-polling.
      await admin.from("paige_workflow_runs").update({
        last_dispatched_at: stamp,
      }).eq("id", r.id);
      results.push({ run_id: r.id, mode: "bridge_poll", status: "still_running", remote_status: poll.status });
    }
  }

  // ----- Pass 1 + 3: dispatch queued + re-dispatch other stalled rows -----
  const toDispatch = [...(queuedRows ?? []), ...(otherStalled ?? [])];
  if (toDispatch.length > 0) {
    const regIds = Array.from(new Set(toDispatch.map((r: any) => r.registry_id).filter(Boolean)));
    const { data: regs } = await admin
      .from("paige_workflow_registry")
      .select("id, key, provider, n8n_webhook_url, needs_n8n_link, langgraph_graph_id, direct_function_name")
      .in("id", regIds);
    const regMap = new Map<string, any>((regs ?? []).map((r: any) => [r.id, r]));

    for (const r of toDispatch) {
      const reg = regMap.get((r as any).registry_id);
      if (!reg) {
        await admin.from("paige_workflow_runs").update({
          status: "failed",
          error: "registry_row_missing",
          completed_at: new Date().toISOString(),
          last_dispatched_at: new Date().toISOString(),
        }).eq("id", r.id);
        results.push({ run_id: r.id, mode: "dispatch", status: "failed", error: "registry_row_missing" });
        continue;
      }
      const out = await dispatchWorkflowRun({
        runId: r.id,
        provider: reg.provider,
        n8nWebhookUrl: reg.n8n_webhook_url,
        needsN8nLink: reg.needs_n8n_link,
        langgraphGraphId: reg.langgraph_graph_id,
        directFunctionName: reg.direct_function_name,
        payload: ((r as any).payload as Record<string, unknown>) ?? {},
        isRetry: true,
      });
      results.push({
        run_id: r.id,
        mode: r.status === "queued" ? "first_dispatch" : "redispatch",
        workflow_key: reg.key,
        status: out.status,
        error: out.error ?? null,
        retry_count: ((r as any).retry_count ?? 0) + 1,
      });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    queued_picked: queuedRows?.length ?? 0,
    bridge_polled: bridgeRunning?.length ?? 0,
    other_stalled: otherStalled?.length ?? 0,
    results,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
