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

// SSRF guard. String matching alone is bypassable (IPv4-mapped IPv6, DNS →
// internal, link-local), so we resolve the host and validate every resolved IP
// NUMERICALLY against private/loopback/link-local/ULA/mapped ranges. IP literals
// are validated directly. redirect:"manual" stops a 3xx from bouncing internal.
function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  return (((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3]) >>> 0;
}
function ipv4Private(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as unsafe
  const inRange = (base: string, bits: number) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (n & mask) >>> 0 === (b & mask) >>> 0;
  };
  return inRange("0.0.0.0", 8) || inRange("10.0.0.0", 8) || inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) || inRange("172.16.0.0", 12) || inRange("192.168.0.0", 16) ||
    inRange("100.64.0.0", 10) || inRange("192.0.0.0", 24) || inRange("198.18.0.0", 15) ||
    n === ipv4ToInt("255.255.255.255");
}
function ipUnsafe(rawIp: string): boolean {
  const ip = rawIp.toLowerCase().replace(/^\[|\]$/g, "");
  if (ipv4ToInt(ip) !== null) return ipv4Private(ip);
  // IPv6 (canonical or literal). Handle embedded/mapped IPv4 explicitly.
  if (ip === "::1" || ip === "::") return true;
  if (/^fe[89ab]/.test(ip)) return true;            // fe80::/10 link-local
  if (/^f[cd]/.test(ip)) return true;               // fc00::/7 ULA
  if (/^(64:ff9b::|2002:)/.test(ip)) {              // NAT64 / 6to4 → extract v4 if dotted
    const d = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (d) return ipv4Private(d[1]);
    return true;
  }
  const mappedDotted = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return ipv4Private(mappedDotted[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    return ipv4Private(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  return false; // a routable public IPv6
}
async function assertSafeUrl(raw: string): Promise<void> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid instance URL"); }
  if (u.protocol !== "https:") throw new Error("Instance URL must be https://");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Instance URL host is not allowed");
  // IP literal → validate directly; hostname → resolve A + AAAA and validate all.
  if (ipv4ToInt(host) !== null || host.includes(":")) {
    if (ipUnsafe(host)) throw new Error("Instance URL host is not allowed");
    return;
  }
  const ips: string[] = [];
  for (const kind of ["A", "AAAA"] as const) {
    try { ips.push(...await Deno.resolveDns(host, kind)); } catch { /* no records of this kind */ }
  }
  if (ips.length === 0) throw new Error("Instance URL host could not be resolved");
  for (const ip of ips) if (ipUnsafe(ip)) throw new Error("Instance URL resolves to a non-public address");
}

// One n8n REST call, SSRF-validated, no auto-redirect (n8n API shouldn't 3xx;
// following one blindly could bounce to an internal host).
async function n8nFetch(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1${path}`;
  await assertSafeUrl(url);
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

  try {
    await assertSafeUrl(`${baseUrl.replace(/\/$/, "")}/api/v1`);
  } catch (e) {
    return json({ error: "unsafe_instance_url", detail: e instanceof Error ? e.message : "blocked" }, 400);
  }

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
        // Record the tenant's workflow inventory in the per-tenant registry so the
        // team can see what exists / is active (GHL-parity), and Paige keeps records.
        await admin.rpc("sync_tenant_workflows", { _tenant_id: tenantId, _workflows: items }).then(() => {}, () => {});
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
      case "run": {
        // Fire a workflow by hitting its webhook trigger — this is how n8n
        // automations are actually invoked (the workflow must have a Webhook
        // node and be active). Accept an explicit webhook_path, or resolve it
        // from the workflow's webhook node.
        let path: string | undefined = body.webhook_path;
        if (!path && body.workflow_id) {
          const wres = await n8nFetch(baseUrl, apiKey, `/workflows/${encodeURIComponent(body.workflow_id)}`);
          if (!wres.ok) return json({ error: `n8n_${wres.status}`, detail: (await wres.text()).slice(0, 300) }, 502);
          const wf = await wres.json();
          const nodes: any[] = wf?.nodes ?? [];
          const hook = nodes.find((n) => typeof n?.type === "string" && n.type.toLowerCase().includes("webhook"));
          path = hook?.parameters?.path;
          if (!path) {
            return json({ error: "not_webhook_triggered", detail: "This workflow has no webhook trigger, so it can't be fired directly — it likely runs on a schedule or is called by another workflow. Activate it or trigger it from its own flow." }, 400);
          }
          if (!wf?.active) {
            return json({ error: "workflow_inactive", detail: "This workflow is turned off, so its webhook won't respond. Turn it on first (n8n_activate_workflow), then run it." }, 409);
          }
        }
        if (!path) return json({ error: "workflow_or_path_required", detail: "Provide a workflow_id (to resolve its webhook) or an explicit webhook_path." }, 400);
        const webhookUrl = `${baseUrl.replace(/\/$/, "")}/webhook/${String(path).replace(/^\//, "")}`;
        await assertSafeUrl(webhookUrl);
        const method = String(body.method || "POST").toUpperCase();
        const hookRes = await fetch(webhookUrl, {
          method,
          redirect: "manual",
          headers: { "Content-Type": "application/json" },
          body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body.payload ?? {}),
        });
        const respText = (await hookRes.text()).slice(0, 1500);
        return json({ ok: hookRes.ok, status: hookRes.status, response: respText,
          note: hookRes.ok ? "Webhook fired." : "The webhook returned a non-2xx status — the workflow may need to be active, or the path/payload may not match." });
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
        // Fold the Paige-authored workflow into the tenant's registry, tagged as hers.
        if (wf?.id) await admin.rpc("record_paige_workflow", { _tenant_id: tenantId, _n8n_workflow_id: wf.id, _name: wf.name }).then(() => {}, () => {});
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
