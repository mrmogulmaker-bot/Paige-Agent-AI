// call-zapier-action — per-tenant Zapier/MCP action caller (Wave 1 #240, Track B slice B2).
//
// Calls a Zapier MCP action (Streamable HTTP MCP JSON-RPC tools/call) using the
// CALLER'S OWN tenant credentials — the per-tenant replacement for the shared
// ZAPIER_MCP_TOKEN env var + platform-global paige_mcp_connections row.
//
// Body: { tool_name: string, arguments?: object }
//   (legacy `connection_id` is accepted-but-ignored — see §37 note below.)
//
// Security (§9 tenant isolation):
//  • The caller's JWT authenticates them; admin-gated (has_role admin).
//  • The tenant is derived SERVER-SIDE from the JWT (current_user_tenant_id, run in
//    the caller's JWT context) — a client-supplied tenant_id is NEVER trusted for the
//    secret read. Mirrors the proven paige-n8n pattern.
//  • The MCP server URL + bearer token are decrypted server-side ONLY, via the
//    service-role-only get_tenant_mcp_secret RPC. They never touch the browser and
//    are read only for the caller's OWN resolved tenant, never an arbitrary one.
//  • The tenant-supplied MCP server_url is SSRF-guarded (https-only + internal-host
//    blocklist with numeric IP validation + manual-redirect) so a tenant admin can't
//    point it at an internal target or DNS-rebind (§13).
//  • If the tenant has no configured/enabled connection → an honest structured
//    "not_connected" response (§13); NEVER a fallback to the shared env token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

// ── SSRF guard (mirrors paige-n8n) ────────────────────────────────────────────────
// String matching alone is bypassable (IPv4-mapped IPv6, DNS → internal, link-local),
// so we resolve the host and validate every resolved IP NUMERICALLY against private/
// loopback/link-local/ULA/mapped ranges. IP literals are validated directly.
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
  try { u = new URL(raw); } catch { throw new Error("Invalid MCP server URL"); }
  if (u.protocol !== "https:") throw new Error("MCP server URL must be https://");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("MCP server host is not allowed");
  if (ipv4ToInt(host) !== null || host.includes(":")) {
    if (ipUnsafe(host)) throw new Error("MCP server host is not allowed");
    return;
  }
  const ips: string[] = [];
  for (const kind of ["A", "AAAA"] as const) {
    try { ips.push(...await Deno.resolveDns(host, kind)); } catch { /* no records of this kind */ }
  }
  if (ips.length === 0) throw new Error("MCP server host could not be resolved");
  for (const ip of ips) if (ipUnsafe(ip)) throw new Error("MCP server URL resolves to a non-public address");
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
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return jsonResponse({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  if (!body?.tool_name) return jsonResponse({ error: "missing_tool_name" }, 400);

  // current_user_tenant_id runs in the caller's JWT context → their own tenant.
  // NEVER trust a client-supplied tenant_id for the secret read (§9).
  const { data: tenantId, error: tErr } = await userClient.rpc("current_user_tenant_id");
  if (tErr || !tenantId) return jsonResponse({ error: "no_tenant" }, 400);

  // 2. Pull the tenant's decrypted MCP creds (service-role-only RPC), scoped to the
  //    caller's OWN resolved tenant. Honest degrade if not configured/enabled (§13) —
  //    never a fallback to the shared ZAPIER_MCP_TOKEN env.
  const { data: secret, error: sErr } = await admin.rpc("get_tenant_mcp_secret", { _tenant_id: tenantId });
  if (sErr) return jsonResponse({ error: "secret_lookup_failed" }, 500);
  if (!secret?.configured) {
    return jsonResponse({ ok: false, error: "not_connected", detail: "This workspace hasn't connected a Zapier/MCP account yet. Connect one in Settings → Integrations → Zapier." });
  }
  if (secret.enabled === false) {
    return jsonResponse({ ok: false, error: "connection_disabled", detail: "This workspace's Zapier/MCP connection is turned off. Re-enable it in Settings → Integrations → Zapier." });
  }
  const serverUrl: string = secret.server_url;
  const token: string = secret.auth_token;
  if (!serverUrl || !token) return jsonResponse({ ok: false, error: "not_connected", detail: "The Zapier/MCP connection is missing its server URL or token. Reconnect it in Settings → Integrations → Zapier." });

  // 3. SSRF-guard the tenant-controlled server URL before the outbound POST.
  try {
    await assertSafeUrl(serverUrl);
  } catch (e) {
    return jsonResponse({ error: "unsafe_server_url", detail: e instanceof Error ? e.message : "blocked" }, 400);
  }

  // 4. Minimal MCP JSON-RPC over HTTP — Zapier's MCP server supports a single-shot tools/call.
  let callRes: Response;
  try {
    callRes = await fetch(serverUrl, {
      method: "POST",
      redirect: "manual",
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
  } catch (e) {
    return jsonResponse({ error: "mcp_request_failed", detail: e instanceof Error ? e.message : "fetch failed" }, 502);
  }
  const text = await callRes.text();
  if (!callRes.ok) return jsonResponse({ error: `mcp_${callRes.status}`, detail: text.slice(0, 500) }, 502);
  return jsonResponse({ ok: true, result: tryJson(text) });
});

function tryJson(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }
