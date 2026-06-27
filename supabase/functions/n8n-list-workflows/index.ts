// Pull workflows from an n8n instance and upsert them into paige_workflow_registry.
// Body: { connection_id?: string }  (defaults to is_default connection)
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { admin } = guard;

  const body = await req.json().catch(() => ({}));
  const connectionId: string | undefined = body?.connection_id;

  const conn = await (connectionId
    ? admin.from("paige_n8n_connections").select("*").eq("id", connectionId).maybeSingle()
    : admin.from("paige_n8n_connections").select("*").eq("is_default", true).maybeSingle());
  if (conn.error || !conn.data) return jsonResponse({ error: "n8n_connection_not_found" }, 404);

  const apiKey = conn.data.api_key_ref ? Deno.env.get(conn.data.api_key_ref) : Deno.env.get("N8N_API_KEY");
  if (!apiKey) return jsonResponse({ error: "n8n_api_key_missing" }, 500);

  const url = `${conn.data.base_url.replace(/\/$/, "")}/api/v1/workflows?active=true&limit=250`;
  const res = await fetch(url, { headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" } });
  if (!res.ok) {
    return jsonResponse({ error: `n8n_${res.status}`, detail: (await res.text()).slice(0, 500) }, 502);
  }
  const json = await res.json();
  const workflows: Array<{ id: string; name: string; active: boolean; tags?: { name: string }[] }> = json?.data ?? [];

  let upserted = 0;
  const now = new Date().toISOString();
  for (const wf of workflows) {
    const key = `n8n_${wf.id}`;
    const category = wf.tags?.find((t) => ["campaign", "customer_support", "admin", "analytics"].includes(t.name))?.name
      ?? "admin";
    const { error } = await admin
      .from("paige_workflow_registry")
      .upsert({
        key,
        label: wf.name,
        category,
        n8n_workflow_id: wf.id,
        connection_id: conn.data.id,
        is_active: wf.active,
        updated_at: now,
      }, { onConflict: "key" });
    if (!error) upserted += 1;
  }

  await admin
    .from("paige_n8n_connections")
    .update({ workflows_cache: workflows, last_sync_at: now })
    .eq("id", conn.data.id);

  return jsonResponse({ ok: true, total: workflows.length, upserted });
});
