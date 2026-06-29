// Shared workflow dispatcher used by both paige-mcp (inline on run_workflow)
// and dispatch-queued-workflow-runs (pg_cron sweeper for orphaned rows).
//
// Routes a queued paige_workflow_runs row to its declared provider:
//   - n8n                  → POST webhook
//   - langgraph            → POST direct to LANGGRAPH_BASE_URL/runs
//   - langgraph_bridge     → POST to MMA OS langgraph-bridge (Doctrine §117 Opt 2)
//   - direct_edge_function → invoke Paige edge function by name (synchronous)
//   - cron_only            → fail fast (registry says this only runs from cron)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type DispatchOpts = {
  runId: string;
  provider: string | null;
  n8nWebhookUrl: string | null;
  needsN8nLink: boolean | null;
  langgraphGraphId: string | null;
  directFunctionName: string | null;
  payload: Record<string, unknown>;
  /** When invoked from the sweeper we want to bump retry_count. */
  isRetry?: boolean;
};

export type DispatchResult = {
  status: "running" | "succeeded" | "failed";
  executionId?: string | null;
  threadId?: string | null;
  error?: string | null;
};

export async function dispatchWorkflowRun(opts: DispatchOpts): Promise<DispatchResult> {
  const { runId, provider, payload } = opts;

  const baseStamp = {
    last_dispatched_at: new Date().toISOString(),
  } as Record<string, unknown>;

  const updateRun = async (patch: Record<string, unknown>) => {
    const full = { ...baseStamp, ...patch };
    if (opts.isRetry) {
      // Use raw SQL to increment retry_count atomically.
      const { data } = await admin
        .from("paige_workflow_runs")
        .select("retry_count")
        .eq("id", runId)
        .maybeSingle();
      full.retry_count = ((data?.retry_count as number | null) ?? 0) + 1;
    }
    await admin.from("paige_workflow_runs").update(full).eq("id", runId);
  };

  if (!provider || provider === "cron_only") {
    const errText = provider === "cron_only" ? "cron_only_workflow" : "no_provider_configured";
    await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
    return { status: "failed", error: errText };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);

  try {
    // ---------- n8n ----------
    if (provider === "n8n") {
      if (!opts.n8nWebhookUrl || opts.needsN8nLink) {
        const errText = "needs_n8n_link";
        await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
        return { status: "failed", error: errText };
      }
      const res = await fetch(opts.n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, paige_run_id: runId, source: "mcp" }),
        signal: controller.signal,
      });
      const txt = await res.text();
      if (!res.ok) {
        const errText = `n8n_${res.status}: ${txt.slice(0, 300)}`;
        await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
        return { status: "failed", error: errText };
      }
      let executionId: string | null = null;
      try {
        const j = JSON.parse(txt);
        executionId = j?.executionId ?? j?.execution_id ?? null;
      } catch { /* webhook may return plain text */ }
      await updateRun({ status: "running", n8n_execution_id: executionId });
      return { status: "running", executionId };
    }

    // ---------- LangGraph direct ----------
    if (provider === "langgraph") {
      const lgKey = Deno.env.get("LANGGRAPH_API_KEY");
      const lgBase = Deno.env.get("LANGGRAPH_BASE_URL");
      if (!lgKey || !lgBase || !opts.langgraphGraphId) {
        const errText = "langgraph_not_configured";
        await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
        return { status: "failed", error: errText };
      }
      const res = await fetch(`${lgBase.replace(/\/$/, "")}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": lgKey },
        body: JSON.stringify({
          assistant_id: opts.langgraphGraphId,
          input: payload,
          metadata: { paige_run_id: runId, source: "mcp" },
        }),
        signal: controller.signal,
      });
      const txt = await res.text();
      if (!res.ok) {
        const errText = `langgraph_${res.status}: ${txt.slice(0, 300)}`;
        await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
        return { status: "failed", error: errText };
      }
      let j: any = null;
      try { j = JSON.parse(txt); } catch { /* */ }
      const executionId = j?.run_id ?? j?.id ?? null;
      const threadId = j?.thread_id ?? null;
      await updateRun({ status: "running", n8n_execution_id: executionId, langgraph_thread_id: threadId, result: j });
      return { status: "running", executionId, threadId };
    }

    // ---------- LangGraph via MMA OS bridge (Doctrine §117 Option 2) ----------
    if (provider === "langgraph_bridge") {
      const bridgeUrl = Deno.env.get("MMA_OS_LANGGRAPH_BRIDGE_URL");
      const bridgeKey = Deno.env.get("MMA_OS_LANGGRAPH_BRIDGE_KEY");
      if (!bridgeUrl || !bridgeKey) {
        const errText = "langgraph_bridge_not_configured";
        await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
        return { status: "failed", error: errText };
      }
      // workflow_key is what MMA OS treats as assistant_id; the registry stores it
      // as either langgraph_graph_id (preferred) or falls back to payload.workflow_key.
      const assistantId =
        opts.langgraphGraphId ??
        (payload?.workflow_key as string | undefined) ??
        null;
      if (!assistantId) {
        const errText = "langgraph_bridge_missing_assistant_id";
        await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
        return { status: "failed", error: errText };
      }
      const res = await fetch(bridgeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bridgeKey}`,
        },
        body: JSON.stringify({
          verb: "fire_agent",
          assistant_id: assistantId,
          input: payload,
          wait: false,
          metadata: { paige_run_id: runId, source: "paige_mcp" },
        }),
        signal: controller.signal,
      });
      const txt = await res.text();
      let body: any = null;
      try { body = JSON.parse(txt); } catch { /* keep null */ }
      if (!res.ok || body?.ok === false) {
        const errText = `langgraph_bridge_${res.status}: ${txt.slice(0, 400)}`;
        await updateRun({
          status: "failed",
          error: errText,
          result: body ?? { raw: txt.slice(0, 1000) },
          completed_at: new Date().toISOString(),
        });
        return { status: "failed", error: errText };
      }
      const threadId: string | null = body?.thread_id ?? null;
      const executionId: string | null = body?.run_id ?? null;
      await updateRun({
        status: "running",
        n8n_execution_id: executionId,
        langgraph_thread_id: threadId,
        result: body?.run ?? body ?? null,
      });
      return { status: "running", executionId, threadId };
    }

    // ---------- Direct edge function (synchronous) ----------
    if (provider === "direct_edge_function") {
      if (!opts.directFunctionName) {
        const errText = "direct_function_name_missing";
        await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
        return { status: "failed", error: errText };
      }
      const url = `${SUPABASE_URL}/functions/v1/${opts.directFunctionName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ ...payload, paige_run_id: runId, source: "mcp" }),
        signal: controller.signal,
      });
      const txt = await res.text();
      let resultJson: unknown;
      try { resultJson = JSON.parse(txt); } catch { resultJson = { raw: txt.slice(0, 1000) }; }
      if (!res.ok) {
        const errText = `direct_${res.status}: ${txt.slice(0, 300)}`;
        await updateRun({
          status: "failed", error: errText, result: resultJson as never,
          completed_at: new Date().toISOString(),
        });
        return { status: "failed", error: errText };
      }
      await updateRun({
        status: "succeeded", result: resultJson as never,
        completed_at: new Date().toISOString(),
      });
      return { status: "succeeded" };
    }

    const errText = `unknown_provider:${provider}`;
    await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
    return { status: "failed", error: errText };
  } catch (e) {
    const errText = (e as Error).message.slice(0, 500);
    await updateRun({ status: "failed", error: errText, completed_at: new Date().toISOString() });
    return { status: "failed", error: errText };
  } finally {
    clearTimeout(t);
  }
}
