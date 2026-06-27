// Trigger an n8n workflow by ID via REST API (not webhook).
// Body: { workflow_id: string, payload?: object, connection_id?: string }
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { admin, userId } = guard;

  const body = await req.json().catch(() => ({}));
  if (!body?.workflow_id) return jsonResponse({ error: "missing_workflow_id" }, 400);

  const conn = await (body.connection_id
    ? admin.from("paige_n8n_connections").select("*").eq("id", body.connection_id).maybeSingle()
    : admin.from("paige_n8n_connections").select("*").eq("is_default", true).maybeSingle());
  if (conn.error || !conn.data) return jsonResponse({ error: "n8n_connection_not_found" }, 404);

  const apiKey = conn.data.api_key_ref ? Deno.env.get(conn.data.api_key_ref) : Deno.env.get("N8N_API_KEY");
  if (!apiKey) return jsonResponse({ error: "n8n_api_key_missing" }, 500);

  const url = `${conn.data.base_url.replace(/\/$/, "")}/api/v1/workflows/${body.workflow_id}/execute`;

  // Optional: log a run row (when this workflow is in the registry)
  const reg = await admin
    .from("paige_workflow_registry")
    .select("id")
    .eq("n8n_workflow_id", body.workflow_id)
    .maybeSingle();

  const run = reg.data
    ? await admin.from("paige_workflow_runs").insert({
        registry_id: reg.data.id,
        triggered_by_user_id: userId,
        payload: body.payload ?? {},
        status: "queued",
      }).select("id").single()
    : { data: null };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body.payload ?? {}),
    });
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 500);
      if (run.data) await admin.from("paige_workflow_runs").update({
        status: "failed", error: `n8n_${res.status}: ${errText}`, completed_at: new Date().toISOString(),
      }).eq("id", run.data.id);
      return jsonResponse({ error: `n8n_${res.status}`, detail: errText }, 502);
    }
    const json = await res.json();
    const executionId = json?.data?.executionId ?? json?.executionId ?? null;
    if (run.data) await admin.from("paige_workflow_runs").update({
      status: "running", n8n_execution_id: executionId,
    }).eq("id", run.data.id);
    return jsonResponse({ ok: true, execution_id: executionId, run_id: run.data?.id ?? null });
  } catch (e) {
    if (run.data) await admin.from("paige_workflow_runs").update({
      status: "failed", error: (e as Error).message.slice(0, 500), completed_at: new Date().toISOString(),
    }).eq("id", run.data.id);
    return jsonResponse({ error: "n8n_fetch_failed", detail: (e as Error).message }, 502);
  }
});
