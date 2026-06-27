// Trigger a workflow from paige_workflow_registry.
// Routes by provider: n8n (webhook), langgraph (API), direct_edge_function (invoke), cron_only (rejected).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonRes({ error: "unauthorized" }, 401);

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: user.id, _role: "coach" });
  if (!isAdmin && !isCoach) return jsonRes({ error: "forbidden" }, 403);

  let body: { registry_key: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid_json" }, 400); }
  if (!body?.registry_key) return jsonRes({ error: "missing_registry_key" }, 400);

  const { data: registry, error: regErr } = await admin
    .from("paige_workflow_registry")
    .select("*")
    .eq("key", body.registry_key)
    .eq("is_active", true)
    .maybeSingle();
  if (regErr || !registry) return jsonRes({ error: "workflow_not_found" }, 404);

  const payload = body.payload ?? {};

  // Pre-flight: cron_only workflows can't be manually triggered.
  if (registry.provider === "cron_only") {
    return jsonRes({
      error: "cron_only_workflow",
      message: "This workflow runs on a schedule and cannot be triggered manually.",
    }, 400);
  }

  // Pre-flight: missing route info.
  if (registry.provider === "n8n" && (!registry.n8n_webhook_url || registry.needs_n8n_link)) {
    return jsonRes({
      error: "needs_n8n_link",
      message: "Workflow is curated but not yet linked to a live n8n workflow. Run n8n-list-workflows to sync.",
    }, 409);
  }
  if (registry.provider === "langgraph" && !registry.langgraph_graph_id) {
    return jsonRes({ error: "langgraph_graph_id_missing" }, 409);
  }
  if (registry.provider === "direct_edge_function" && !registry.direct_function_name) {
    return jsonRes({ error: "direct_function_name_missing" }, 409);
  }

  const { data: run, error: runErr } = await admin
    .from("paige_workflow_runs")
    .insert({
      registry_id: registry.id,
      triggered_by_user_id: user.id,
      payload,
      status: "queued",
    })
    .select("*")
    .single();
  if (runErr || !run) return jsonRes({ error: "run_insert_failed", detail: runErr?.message }, 500);

  let newStatus: "running" | "failed" | "succeeded" = "running";
  let errorText: string | null = null;
  let executionId: string | null = null;
  let resultJson: unknown = null;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);

    if (registry.provider === "n8n") {
      const res = await fetch(registry.n8n_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, paige_run_id: run.id, triggered_by: user.id }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        newStatus = "failed";
        errorText = `n8n_${res.status}: ${(await res.text()).slice(0, 300)}`;
      } else {
        const j = await res.json().catch(() => ({}));
        executionId = j?.executionId ?? j?.execution_id ?? null;
      }
    } else if (registry.provider === "langgraph") {
      const lgKey = Deno.env.get("LANGGRAPH_API_KEY");
      const lgBase = Deno.env.get("LANGGRAPH_BASE_URL");
      if (!lgKey || !lgBase) {
        newStatus = "failed";
        errorText = "LANGGRAPH_API_KEY or LANGGRAPH_BASE_URL not configured";
      } else {
        const res = await fetch(`${lgBase.replace(/\/$/, "")}/runs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": lgKey,
          },
          body: JSON.stringify({
            assistant_id: registry.langgraph_graph_id,
            input: payload,
            metadata: { paige_run_id: run.id, triggered_by: user.id },
          }),
          signal: controller.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
          newStatus = "failed";
          errorText = `langgraph_${res.status}: ${(await res.text()).slice(0, 300)}`;
        } else {
          const j = await res.json().catch(() => ({}));
          executionId = j?.run_id ?? j?.id ?? null;
          resultJson = j;
        }
      }
    } else if (registry.provider === "direct_edge_function") {
      // Forward to the target edge function with the user's auth.
      const targetUrl = `${supabaseUrl}/functions/v1/${registry.direct_function_name}`;
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          apikey: anonKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(t);
      const txt = await res.text();
      try { resultJson = JSON.parse(txt); } catch { resultJson = { raw: txt.slice(0, 1000) }; }
      if (!res.ok) {
        newStatus = "failed";
        errorText = `direct_${res.status}: ${txt.slice(0, 300)}`;
      } else {
        newStatus = "succeeded";
      }
    }
  } catch (e) {
    newStatus = "failed";
    errorText = (e as Error).message.slice(0, 500);
  }

  await admin
    .from("paige_workflow_runs")
    .update({
      status: newStatus,
      n8n_execution_id: executionId,
      error: errorText,
      result: resultJson as never,
      completed_at: newStatus === "running" ? null : new Date().toISOString(),
    })
    .eq("id", run.id);

  return jsonRes({
    run_id: run.id,
    status: newStatus,
    n8n_execution_id: executionId,
    error: errorText,
    result: resultJson,
  });
});
