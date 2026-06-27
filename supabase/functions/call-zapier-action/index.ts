// Call a Zapier MCP action.
// Body: { connection_id?: string, tool_name: string, arguments: object }
// Uses Streamable HTTP MCP protocol with a saved bearer token.
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { admin } = guard;

  const body = await req.json().catch(() => ({}));
  if (!body?.tool_name) return jsonResponse({ error: "missing_tool_name" }, 400);

  const conn = await (body.connection_id
    ? admin.from("paige_mcp_connections").select("*").eq("id", body.connection_id).maybeSingle()
    : admin.from("paige_mcp_connections").select("*").eq("enabled", true).limit(1).maybeSingle());
  if (conn.error || !conn.data) return jsonResponse({ error: "mcp_connection_not_found" }, 404);

  const token = conn.data.auth_token_ref ? Deno.env.get(conn.data.auth_token_ref) : Deno.env.get("ZAPIER_MCP_TOKEN");
  if (!token) return jsonResponse({ error: "mcp_token_missing" }, 500);

  // Minimal MCP JSON-RPC over HTTP — Zapier's MCP server supports a single-shot tools/call.
  const callRes = await fetch(conn.data.server_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: body.tool_name, arguments: body.arguments ?? {} },
    }),
  });
  const text = await callRes.text();
  if (!callRes.ok) return jsonResponse({ error: `mcp_${callRes.status}`, detail: text.slice(0, 500) }, 502);
  return jsonResponse({ ok: true, result: tryJson(text) });
});

function tryJson(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }
