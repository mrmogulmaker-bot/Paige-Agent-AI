// Trigger an n8n workflow registered in paige_workflow_registry.
// Inserts a paige_workflow_runs row, POSTs payload to n8n webhook, updates status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: user.id, _role: "coach" });
  if (!isAdmin && !isCoach) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { registry_key: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body?.registry_key) {
    return new Response(JSON.stringify({ error: "missing_registry_key" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: registry, error: regErr } = await admin
    .from("paige_workflow_registry")
    .select("*")
    .eq("key", body.registry_key)
    .eq("is_active", true)
    .maybeSingle();
  if (regErr || !registry) {
    return new Response(JSON.stringify({ error: "workflow_not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = body.payload ?? {};

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
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: "run_insert_failed", detail: runErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fire to n8n
  let newStatus: "running" | "failed" = "running";
  let errorText: string | null = null;
  let executionId: string | null = null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
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
      const json = await res.json().catch(() => ({}));
      executionId = json?.executionId ?? json?.execution_id ?? null;
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
      completed_at: newStatus === "failed" ? new Date().toISOString() : null,
    })
    .eq("id", run.id);

  return new Response(JSON.stringify({
    run_id: run.id,
    status: newStatus,
    n8n_execution_id: executionId,
    error: errorText,
  }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
