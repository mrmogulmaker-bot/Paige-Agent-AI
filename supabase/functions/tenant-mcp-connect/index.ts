// tenant-mcp-connect — connect, verify and disconnect a workspace's own MCP server.
//
// WHY THIS IS AN EDGE FUNCTION AND NOT AN RPC. Saving a connection is a database write
// and lives in `set_tenant_n8n_mcp_connection`, which is where its authority belongs.
// But a saved connection is only a claim: the address may be unreachable, the credential
// wrong, the endpoint not an MCP server at all. Proving it needs an outbound request,
// which Postgres cannot make. So the setter writes `pending_verification`, and this
// function — the only holder of the service-role probe writer — is the only thing that
// can move a row to `connected`. A workspace never sees a green state it has not earned.
//
// AUTHORITY (§9/§59). The caller's JWT authenticates them and their tenant is resolved
// SERVER-SIDE from that JWT; a tenant id in the request body is never trusted. Writes go
// through the user's own client so the RPC's in-body tenant-admin check is what gates
// them — the service-role client is used only to read the decrypted secret for the
// already-resolved tenant and to write the probe result.
//
// SECRET DISCIPLINE. The server URL and credential are decrypted server-side, held for
// the duration of one probe, and dropped. Nothing in any response contains them, and no
// provider error text is returned raw: failures come back as a stable code, which the
// browser renders in the product's own words.
//
// SSRF (§13). Every outbound request runs through `_shared/mcp-client.ts` → `safeFetch`:
// https only, no embedded credentials, public addresses only, redirects refused rather
// than followed, bounded wall clock, bounded response size, fail-closed on every branch.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { mcpProbe, type McpAuth, type McpErrorCode } from "../_shared/mcp-client.ts";

/** Providers this function can connect. Zapier arrives through OAuth, not a pasted token. */
const CONNECTABLE = new Set(["n8n"]);

type ProbeOutcome = { status: "connected"; toolCount: number } | { status: "error"; code: McpErrorCode };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const provider = typeof body.provider === "string" ? body.provider : "";
  if (!CONNECTABLE.has(provider)) return jsonResponse({ error: "unsupported_provider" }, 400);

  // The tenant comes from the caller's own JWT context, never from the body (§9).
  const { data: tenantId, error: tErr } = await userClient.rpc("current_user_tenant_id");
  if (tErr || !tenantId) return jsonResponse({ error: "no_tenant" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  if (action === "disconnect") {
    // Authority lives in the RPC: it raises unless the caller is an admin of this tenant.
    const { error } = await userClient.rpc("clear_tenant_mcp_connection", { _provider: provider });
    if (error) {
      const code = writeCode(error.message);
      return jsonResponse({ error: "write_failed", code }, code === "MCP_FORBIDDEN" ? 403 : 400);
    }
    return jsonResponse({ ok: true, status: "unconfigured" });
  }

  if (action === "connect") {
    const serverUrl = typeof body.server_url === "string" ? body.server_url.trim() : "";
    const authToken = typeof body.auth_token === "string" ? body.auth_token : "";
    const transport = typeof body.transport === "string" ? body.transport : "http";
    const authKind = typeof body.auth_kind === "string" ? body.auth_kind : "bearer";
    const headerName = typeof body.header_name === "string" ? body.header_name.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";

    // The setter validates shape and enforces tenant-admin in its own body, and writes
    // `pending_verification`. Running it as the USER is what makes that check apply.
    const { error } = await userClient.rpc("set_tenant_n8n_mcp_connection", {
      _server_url: serverUrl,
      _auth_token: authToken,
      _transport: transport,
      _auth_kind: authKind,
      _header_name: headerName || undefined,
      _label: label || undefined,
    });
    if (error) {
      const code = writeCode(error.message);
      return jsonResponse({ error: "write_failed", code }, code === "MCP_FORBIDDEN" ? 403 : 400);
    }
    return jsonResponse({ ok: true, ...(await probeAndRecord(admin, tenantId, provider)) });
  }

  if (action === "verify") {
    // No write happens here, so the admin check the setter would have applied has to be
    // made explicitly rather than assumed.
    const { data: isAdmin } = await userClient.rpc("is_current_user_tenant_admin");
    if (isAdmin !== true) return jsonResponse({ error: "forbidden" }, 403);
    return jsonResponse({ ok: true, ...(await probeAndRecord(admin, tenantId, provider)) });
  }

  return jsonResponse({ error: "unknown_action" }, 400);
});

/**
 * Reads the tenant's own decrypted connection, proves it, and records the outcome.
 *
 * A failed probe is recorded as `error` and reported as one. It is never reported as
 * "not connected", because a workspace that has saved a connection and a workspace that
 * has none are different situations and must not look the same (§13).
 */
async function probeAndRecord(
  // deno-lint-ignore no-explicit-any
  admin: any,
  tenantId: string,
  provider: string,
): Promise<ProbeOutcome> {
  const { data: secret, error } = await admin.rpc("get_tenant_mcp_secret", {
    _tenant_id: tenantId,
    _provider: provider,
  });
  if (error || !secret?.configured || secret?.enabled === false || !secret?.server_url || !secret?.auth_token) {
    await record(admin, tenantId, provider, "error", "connection is missing its address or credential");
    return { status: "error", code: "mcp_protocol_error" };
  }

  const auth: McpAuth = secret.auth_kind === "header" && secret.auth_header_name
    ? { kind: "header", name: secret.auth_header_name, token: secret.auth_token }
    : { kind: "bearer", token: secret.auth_token };

  const result = await mcpProbe({ serverUrl: secret.server_url, auth });

  if (!result.ok) {
    // The stable code is retained for the operator. Provider text is not carried here:
    // it is unbounded external content and has no reader that needs it.
    await record(admin, tenantId, provider, "error", result.httpStatus ? `${result.code} (${result.httpStatus})` : result.code);
    return { status: "error", code: result.code };
  }

  // Only this line, reached only after a real MCP exchange, writes `connected`.
  await record(admin, tenantId, provider, "connected", null);
  return { status: "connected", toolCount: result.toolCount };
}

async function record(
  // deno-lint-ignore no-explicit-any
  admin: any,
  tenantId: string,
  provider: string,
  status: "connected" | "error",
  lastError: string | null,
): Promise<void> {
  await admin.rpc("update_tenant_mcp_probe", {
    _tenant_id: tenantId,
    _provider: provider,
    _status: status,
    _last_error: lastError,
    // `tools_cache` is deliberately left alone. Nothing in this slice may act on an
    // unpinned tool list, and the registry read derives its tool count from
    // `tools_cache -> 'tools'` — so writing any other shape here would publish a
    // permanent "0 tools" that is worse than the honest absence of a number. The
    // pinned cache belongs with the allowlist that will actually read it.
    _tools_cache: undefined,
  });
}

/**
 * Maps the setter's prefixed, non-sensitive exception codes to a stable code for the
 * browser. Raw database text never crosses this boundary.
 */
function writeCode(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  for (const code of ["MCP_NO_URL", "MCP_INSECURE_URL", "MCP_URL_CREDENTIALS", "MCP_NO_TOKEN",
                      "MCP_BAD_TRANSPORT", "MCP_BAD_AUTH_KIND", "MCP_NO_HEADER_NAME",
                      "MCP_FORBIDDEN", "MCP_NO_TENANT", "MCP_BAD_PROVIDER"]) {
    if (s.includes(code)) return code;
  }
  return "MCP_WRITE_FAILED";
}
