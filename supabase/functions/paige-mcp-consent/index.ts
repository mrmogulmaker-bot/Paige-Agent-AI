// Helper for the in-app /mcp/authorize consent screen.
// Action "lookup": returns client info + validated request params (no auth required — public client metadata).
// Action "approve": requires the user's Supabase JWT, mints an authz code, returns the redirect URL.
// Action "deny":    requires the user's JWT, returns the error redirect URL.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SUPPORTED_SCOPES = new Set([
  "crm.read", "crm.write", "workflows.run", "btf.read", "btf.write", "admin.read", "admin.write",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function randToken(bytes = 48) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = body.action;

  if (action === "lookup") {
    const { client_id, redirect_uri, scope, code_challenge, code_challenge_method } = body;
    if (!client_id || !redirect_uri || !code_challenge) return json({ error: "invalid_request" }, 400);
    if (code_challenge_method !== "S256") return json({ error: "unsupported_challenge_method" }, 400);
    const { data: client } = await admin
      .from("paige_mcp_oauth_clients")
      .select("client_id, client_name, client_uri, redirect_uris")
      .eq("client_id", client_id).maybeSingle();
    if (!client) return json({ error: "unknown_client" }, 404);
    if (!client.redirect_uris.includes(redirect_uri)) return json({ error: "invalid_redirect_uri" }, 400);
    const requested = String(scope ?? "crm.read").split(/\s+/).filter(Boolean);
    const valid = requested.filter((s: string) => SUPPORTED_SCOPES.has(s));
    if (valid.length === 0) return json({ error: "invalid_scope" }, 400);
    return json({
      client: { id: client.client_id, name: client.client_name, uri: client.client_uri },
      scopes: valid,
      redirect_uri,
    });
  }

  // approve / deny both need the user's session.
  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes.user;
  if (!user) return json({ error: "unauthenticated" }, 401);

  const { client_id, redirect_uri, scope, code_challenge, state } = body;

  if (action === "deny") {
    const u = new URL(redirect_uri);
    u.searchParams.set("error", "access_denied");
    if (state) u.searchParams.set("state", state);
    return json({ redirect_url: u.toString() });
  }

  if (action === "approve") {
    if (!client_id || !redirect_uri || !code_challenge) return json({ error: "invalid_request" }, 400);
    const { data: client } = await admin
      .from("paige_mcp_oauth_clients").select("redirect_uris").eq("client_id", client_id).maybeSingle();
    if (!client || !client.redirect_uris.includes(redirect_uri)) return json({ error: "invalid_redirect_uri" }, 400);
    const scopes = String(scope ?? "crm.read").split(/\s+/).filter((s) => SUPPORTED_SCOPES.has(s));
    if (scopes.length === 0) return json({ error: "invalid_scope" }, 400);

    const code = randToken(32);
    const code_hash = await sha256Hex(code);
    await admin.from("paige_mcp_oauth_codes").insert({
      code_hash, client_id, user_id: user.id, redirect_uri, scopes,
      code_challenge, code_challenge_method: "S256",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    const u = new URL(redirect_uri);
    u.searchParams.set("code", code);
    if (state) u.searchParams.set("state", state);
    return json({ redirect_url: u.toString() });
  }

  return json({ error: "unknown_action" }, 400);
});
