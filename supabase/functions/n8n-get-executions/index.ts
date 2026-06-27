// Recent executions for an n8n workflow.
// Body: { workflow_id: string, limit?: number, connection_id?: string }
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { admin } = guard;

  const body = await req.json().catch(() => ({}));
  if (!body?.workflow_id) return jsonResponse({ error: "missing_workflow_id" }, 400);
  const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);

  const conn = await (body.connection_id
    ? admin.from("paige_n8n_connections").select("*").eq("id", body.connection_id).maybeSingle()
    : admin.from("paige_n8n_connections").select("*").eq("is_default", true).maybeSingle());
  if (conn.error || !conn.data) return jsonResponse({ error: "n8n_connection_not_found" }, 404);
  const apiKey = conn.data.api_key_ref ? Deno.env.get(conn.data.api_key_ref) : Deno.env.get("N8N_API_KEY");
  if (!apiKey) return jsonResponse({ error: "n8n_api_key_missing" }, 500);

  const url = `${conn.data.base_url.replace(/\/$/, "")}/api/v1/executions?workflowId=${encodeURIComponent(body.workflow_id)}&limit=${limit}`;
  const res = await fetch(url, { headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" } });
  if (!res.ok) return jsonResponse({ error: `n8n_${res.status}`, detail: (await res.text()).slice(0, 500) }, 502);
  const json = await res.json();
  return jsonResponse({ ok: true, executions: json?.data ?? [] });
});
