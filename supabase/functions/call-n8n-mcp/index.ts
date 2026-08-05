// call-n8n-mcp — per-tenant OUTBOUND MCP caller for a tenant's n8n MCP Server Trigger (#267).
//
// The session-based sibling of call-zapier-action. Zapier's remote MCP server answers a
// stateless single-shot POST (call-zapier-action handles that, unchanged). n8n's MCP
// Server Trigger is SESSION-based — it needs an `initialize` handshake, a captured session
// id, and tools/list + tools/call over Streamable-HTTP or legacy HTTP+SSE. That compliant
// runtime lives in _shared/mcp-session-client.ts; this function is the tenant-scoped,
// SSRF-guarded, secret-resolving edge wrapper around it.
//
// Body (two shapes — mirrors call-zapier-action for a consistent contract, §37):
//   { action: "list" }                         → MCP tools/list (discover the tenant's tools)
//   { tool_name: string, arguments?: object }  → MCP tools/call (run one tool)
//
// Security (§9 tenant isolation — identical posture to call-zapier-action):
//  • Caller JWT authenticates; admin-gated (has_role admin).
//  • Tenant derived SERVER-SIDE from the JWT (current_user_tenant_id) — a client-supplied
//    tenant_id is NEVER trusted for the secret read.
//  • The n8n MCP server URL + bearer token are decrypted server-side ONLY via the
//    service-role-only get_tenant_mcp_secret RPC, scoped to vendor='n8n' and the caller's
//    OWN resolved tenant.
//  • The tenant-supplied URL is SSRF-guarded (shared assertPublicHttpUrl, §18 one home) AND
//    https-only, with manual-redirect inside the client.
//  • No configured/enabled n8n MCP connection → an honest structured response (§13), never
//    a fabricated success and never a fallback to another vendor's creds.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { assertPublicHttpUrl } from "../_shared/ssrf-guard.ts";
import { McpSessionClient, type McpTransport } from "../_shared/mcp-session-client.ts";

const VENDOR = "n8n";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 1. Authenticate the caller and resolve their tenant from the JWT.
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return jsonResponse({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const isList = body?.action === "list";
  if (!isList && !body?.tool_name) return jsonResponse({ error: "missing_tool_name" }, 400);

  // current_user_tenant_id runs in the caller's JWT context → their own tenant (§9).
  const { data: tenantId, error: tErr } = await userClient.rpc("current_user_tenant_id");
  if (tErr || !tenantId) return jsonResponse({ error: "no_tenant" }, 400);

  // 2. Pull the tenant's decrypted n8n-MCP creds (service-role-only RPC, vendor-scoped).
  const { data: secret, error: sErr } = await admin.rpc("get_tenant_mcp_secret", { _tenant_id: tenantId, _vendor: VENDOR });
  if (sErr) return jsonResponse({ error: "secret_lookup_failed" }, 500);
  if (!secret?.configured) {
    return jsonResponse({ ok: false, error: "not_connected", detail: "This workspace hasn't connected an n8n MCP endpoint yet. Add one in Settings → Integrations → n8n." });
  }
  if (secret.enabled === false) {
    return jsonResponse({ ok: false, error: "connection_disabled", detail: "This workspace's n8n MCP connection is turned off. Re-enable it in Settings → Integrations → n8n." });
  }
  const serverUrl: string = secret.server_url;
  const token: string = secret.auth_token;
  const transport: McpTransport = (secret.transport as McpTransport) ?? "http";
  if (!serverUrl || !token) return jsonResponse({ ok: false, error: "not_connected", detail: "The n8n MCP connection is missing its endpoint URL or token. Reconnect it in Settings → Integrations → n8n." });

  // 3. SSRF-guard the tenant-controlled URL (private/link-local/metadata blocked) + https-only.
  if (!/^https:\/\//i.test(serverUrl)) {
    return jsonResponse({ error: "unsafe_server_url", detail: "n8n MCP endpoint must be https://" }, 400);
  }
  try {
    await assertPublicHttpUrl(serverUrl);
  } catch (e) {
    return jsonResponse({ error: "unsafe_server_url", detail: e instanceof Error ? e.message : "blocked" }, 400);
  }

  // 4. Drive the session-based MCP client. Every degrade LOGS loudly (§32), never blanks.
  const client = new McpSessionClient({
    serverUrl,
    token,
    transport,
    clientName: "paige-n8n-mcp",
    log: (msg, extra) => console.log(`[call-n8n-mcp] ${msg}`, extra ? JSON.stringify(extra) : ""),
  });

  try {
    if (isList) {
      const tools = await client.listTools();
      // Cache the probed inventory on the connection row (display/routing hint) + mark connected.
      await admin.rpc("update_tenant_mcp_probe", {
        _tenant_id: tenantId, _status: "connected", _last_error: null,
        _tools_cache: tools.map((t) => ({ name: t.name, description: t.description })), _vendor: VENDOR,
      }).catch((e: unknown) => console.error("[call-n8n-mcp] probe_cache_failed", String(e)));
      return jsonResponse({ ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description })) });
    }
    const result = await client.callTool(String(body.tool_name), (body.arguments as Record<string, unknown>) ?? {});
    return jsonResponse({ ok: true, result });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "MCP call failed";
    console.error("[call-n8n-mcp] mcp_call_failed", detail);
    // Record the failure on the connection row so the operator UI can show WHY (§32/§13).
    await admin.rpc("update_tenant_mcp_probe", {
      _tenant_id: tenantId, _status: "error", _last_error: detail.slice(0, 500), _tools_cache: null, _vendor: VENDOR,
    }).catch(() => {});
    return jsonResponse({ ok: false, error: "mcp_call_failed", detail: detail.slice(0, 500) }, 502);
  }
});
