// Sync n8n workflows -> paige_workflow_registry.
// Strategy:
//   1. Auto-discovered n8n rows (key starts with "n8n_") get full upsert.
//   2. Curated rows (any other key) get matched by exact case-insensitive label.
//      On match: clear needs_n8n_link, set n8n_workflow_id, n8n_webhook_url, connection_id.
//      NEVER overwrite label, description, parameters_schema, requires_approval, category, sort_order.
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
  const workflows: Array<{
    id: string;
    name: string;
    active: boolean;
    tags?: { name: string }[];
    nodes?: Array<{ type: string; webhookId?: string; parameters?: { path?: string } }>;
  }> = json?.data ?? [];

  const now = new Date().toISOString();
  const baseHost = conn.data.base_url.replace(/\/$/, "");

  // Build a lookup of webhook URL per workflow when a Webhook trigger is present.
  const inferWebhookUrl = (wf: typeof workflows[number]): string | null => {
    const node = wf.nodes?.find((n) => n.type?.toLowerCase().includes("webhook"));
    const path = node?.parameters?.path;
    if (!path) return null;
    return `${baseHost}/webhook/${path.replace(/^\//, "")}`;
  };

  // 1) Fetch curated rows (rows whose key does NOT start with "n8n_") that still need an n8n link.
  const { data: curated } = await admin
    .from("paige_workflow_registry")
    .select("id, key, label, n8n_workflow_id, needs_n8n_link")
    .or("needs_n8n_link.eq.true,n8n_workflow_id.is.null");

  const wfByLabel = new Map<string, typeof workflows[number]>();
  for (const wf of workflows) {
    wfByLabel.set(wf.name.trim().toLowerCase(), wf);
  }

  let linked = 0;
  for (const row of curated ?? []) {
    if (row.key?.startsWith("n8n_")) continue;
    const match = wfByLabel.get((row.label ?? "").trim().toLowerCase());
    if (!match) continue;
    const webhookUrl = inferWebhookUrl(match);
    const { error } = await admin
      .from("paige_workflow_registry")
      .update({
        n8n_workflow_id: match.id,
        n8n_webhook_url: webhookUrl,
        connection_id: conn.data.id,
        needs_n8n_link: !webhookUrl,
        updated_at: now,
      })
      .eq("id", row.id);
    if (!error) linked += 1;
  }

  // 2) Upsert auto-discovered rows (anything not already curated by label).
  const curatedLabels = new Set((curated ?? []).map((r) => (r.label ?? "").trim().toLowerCase()));
  let upserted = 0;
  for (const wf of workflows) {
    if (curatedLabels.has(wf.name.trim().toLowerCase())) continue;
    const key = `n8n_${wf.id}`;
    const allowedCategories = ["campaign", "campaigns", "customer_support", "admin", "analytics", "editorial", "funding", "observability"];
    const tagCategory = wf.tags?.map((t) => t.name).find((n) => allowedCategories.includes(n));
    const webhookUrl = inferWebhookUrl(wf);
    const { error } = await admin
      .from("paige_workflow_registry")
      .upsert({
        key,
        label: wf.name,
        category: tagCategory ?? "admin",
        n8n_workflow_id: wf.id,
        n8n_webhook_url: webhookUrl,
        connection_id: conn.data.id,
        is_active: wf.active,
        needs_n8n_link: !webhookUrl,
        provider: "n8n",
        updated_at: now,
      }, { onConflict: "key" });
    if (!error) upserted += 1;
  }

  await admin
    .from("paige_n8n_connections")
    .update({ workflows_cache: workflows, last_sync_at: now })
    .eq("id", conn.data.id);

  return jsonResponse({
    ok: true,
    total_workflows: workflows.length,
    curated_linked: linked,
    auto_upserted: upserted,
  });
});
