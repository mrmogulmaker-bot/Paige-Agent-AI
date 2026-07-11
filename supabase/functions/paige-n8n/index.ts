// paige-n8n — per-tenant n8n control surface. One tenant-scoped edge function
// that lets the operator (and Paige, on their behalf) drive their OWN n8n
// instance: test, list, get, create, update, activate/deactivate, delete
// workflows, and read executions — via the n8n public REST API (/api/v1,
// header X-N8N-API-KEY).
//
// Security:
//  • The caller's JWT resolves their tenant (current_user_tenant_id); admin-gated.
//    A tenant can only ever reach ITS OWN connection — never another tenant's.
//  • The n8n API key is decrypted server-side only, via the service-role-only
//    get_tenant_n8n_secret RPC. It never touches the browser or Paige's context.
//  • The tenant-supplied instance URL is SSRF-guarded (https-only + internal-host
//    blocklist + manual-redirect re-validation) so it can't be pointed at an
//    internal target or DNS-rebind.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// SSRF blocklist — identical to kb-ingest-url / fetch-url-content. Do not weaken.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./, /^::1$/, /^0\.0\.0\.0$/, /^fc00:/i, /^fd00:/i, /\.local$/i, /\.internal$/i,
];
function unsafeReason(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "Invalid instance URL"; }
  if (u.protocol !== "https:") return "Instance URL must be https://";
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(u.hostname.toLowerCase()))) return "Instance URL host is not allowed";
  return null;
}

// One n8n REST call, SSRF-validated, no auto-redirect (n8n API shouldn't 3xx;
// following one blindly could bounce to an internal host).
async function n8nFetch(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1${path}`;
  const bad = unsafeReason(url);
  if (bad) throw new Error(bad);
  return await fetch(url, {
    ...init,
    redirect: "manual",
    headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 1. Authenticate the caller and resolve their tenant from the JWT.
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden", detail: "n8n control is admin-only." }, 403);

  // current_user_tenant_id runs in the caller's JWT context → their own tenant.
  const { data: tenantId, error: tErr } = await userClient.rpc("current_user_tenant_id");
  if (tErr || !tenantId) return json({ error: "no_tenant" }, 400);

  const body = await req.json().catch(() => ({}));
  const action: string = body?.action ?? "";

  // 2. Pull the tenant's decrypted n8n creds (service-role-only RPC).
  const { data: secret, error: sErr } = await admin.rpc("get_tenant_n8n_secret", { _tenant_id: tenantId });
  if (sErr) return json({ error: "secret_lookup_failed" }, 500);
  if (!secret?.configured) {
    return json({ error: "not_connected", detail: "This workspace hasn't connected an n8n account yet. Connect one in Settings → Integrations → n8n." }, 409);
  }
  const baseUrl: string = secret.base_url;
  const apiKey: string = secret.api_key;

  const preflight = unsafeReason(`${baseUrl.replace(/\/$/, "")}/api/v1`);
  if (preflight) return json({ error: "unsafe_instance_url", detail: preflight }, 400);

  const markSync = (status: string, lastError: string | null, count: number | null) =>
    admin.rpc("update_tenant_n8n_sync", { _tenant_id: tenantId, _status: status, _last_error: lastError, _workflow_count: count }).then(() => {}, () => {});

  try {
    switch (action) {
      case "test":
      case "list": {
        const res = await n8nFetch(baseUrl, apiKey, "/workflows?limit=200");
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 300);
          await markSync("error", `n8n ${res.status}`, null);
          return json({ error: `n8n_${res.status}`, detail }, 502);
        }
        const data = await res.json();
        const items = (data?.data ?? []).map((w: any) => ({
          id: w.id, name: w.name, active: !!w.active,
          tags: (w.tags ?? []).map((t: any) => t.name), updatedAt: w.updatedAt,
        }));
        await markSync("connected", null, items.length);
        return json(action === "test"
          ? { ok: true, connected: true, workflow_count: items.length }
          : { ok: true, workflows: items, count: items.length });
      }
      case "get": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const res = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`);
        if (!res.ok) return json({ error: `n8n_${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
        return json({ ok: true, workflow: await res.json() });
      }
      case "executions": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
        const res = await n8nFetch(baseUrl, apiKey, `/executions?workflowId=${encodeURIComponent(body.workflow_id)}&limit=${limit}`);
        if (!res.ok) return json({ error: `n8n_${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
        const data = await res.json();
        const runs = (data?.data ?? []).map((e: any) => ({
          id: e.id, finished: e.finished, mode: e.mode, status: e.status,
          startedAt: e.startedAt, stoppedAt: e.stoppedAt,
        }));
        return json({ ok: true, executions: runs, count: runs.length });
      }
      case "create": {
        if (!body.name || !body.nodes) return json({ error: "name_and_nodes_required", detail: "Provide name plus a valid n8n workflow (nodes + connections)." }, 400);
        // Create INACTIVE by default — authored workflows must be reviewed and
        // explicitly activated, never auto-live.
        const payload = {
          name: body.name,
          nodes: body.nodes,
          connections: body.connections ?? {},
          settings: body.settings ?? {},
        };
        const res = await n8nFetch(baseUrl, apiKey, "/workflows", { method: "POST", body: JSON.stringify(payload) });
        if (!res.ok) return json({ error: `n8n_${res.status}`, detail: (await res.text()).slice(0, 400) }, 502);
        const wf = await res.json();
        return json({ ok: true, workflow_id: wf?.id, name: wf?.name, active: !!wf?.active });
      }
      case "update": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const payload: Record<string, unknown> = {};
        for (const k of ["name", "nodes", "connections", "settings"]) if (body[k] !== undefined) payload[k] = body[k];
        if (Object.keys(payload).length === 0) return json({ error: "nothing_to_update" }, 400);
        const res = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`, { method: "PUT", body: JSON.stringify(payload) });
        if (!res.ok) return json({ error: `n8n_${res.status}`, detail: (await res.text()).slice(0, 400) }, 502);
        const wf = await res.json();
        return json({ ok: true, workflow_id: wf?.id, name: wf?.name, active: !!wf?.active });
      }
      case "activate":
      case "deactivate": {
        if (!body.workflow_id) return json({ error: "workflow_id_required" }, 400);
        const res = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}/${action}`, { method: "POST" });
        if (!res.ok) return json({ error: `n8n_${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
        const wf = await res.json();
        return json({ ok: true, workflow_id: wf?.id, active: !!wf?.active });
      }
      default:
        return json({ error: "unknown_action", detail: `Unknown n8n action: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "n8n_request_failed";
    await markSync("error", msg.slice(0, 300), null);
    return json({ error: "n8n_request_failed", detail: msg }, 502);
  }
});
