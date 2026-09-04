// Workspace-bound Zapier Workflow API OAuth and contained read-only health test.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

const AUTHORIZE_URL = "https://api.zapier.com/v2/authorize";
const TOKEN_URL = "https://zapier.com/oauth/token/";
const ZAPS_URL = "https://api.zapier.com/v2/zaps?limit=1&offset=0";
// Deliberately excludes zap:write, zap:update, zap:delete, zap:pause, zap:all, action:run.
const READ_ONLY_SCOPES = "profile zap:account:all";
const PUBLIC_BASE = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://paigeagent.ai").replace(/\/$/, "");
const REDIRECT_URI = `${PUBLIC_BASE}/oauth/zapier/callback`;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function digest(value: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
function safeState() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return b64url(bytes); }
function configured() { return !!Deno.env.get("ZAPIER_API_CLIENT_ID") && !!Deno.env.get("ZAPIER_API_CLIENT_SECRET"); }
function tokenAuth() { return `Basic ${btoa(`${Deno.env.get("ZAPIER_API_CLIENT_ID")}:${Deno.env.get("ZAPIER_API_CLIENT_SECRET")}`)}`; }

// The project intentionally uses runtime RPCs that are introduced by the paired
// migration rather than generated database types. Keep the client boundary
// untyped here so Deno does not infer every new table and RPC as `never`.
type DatabaseClient = any;
type CheckResult = { ok: true; count: number | null } | { ok: false; state: string; code: string };

async function readiness(userClient: DatabaseClient, tenantId: string, canManage: boolean) {
  if (!configured()) return { tenant_id: tenantId, can_manage: canManage, state: "capability_unavailable", failure_code: "plan_or_api_unavailable", accessible_zap_count: null, last_checked_at: null, last_success_at: null,
    capabilities: [], limitations: ["Zapier API access requires a published Zapier integration and provider-issued OAuth credentials"] };
  const { data, error } = await userClient.rpc("get_zapier_api_readiness");
  return error ? null : data;
}

async function storeGrant(admin: DatabaseClient, tenantId: string, actorId: string, token: Record<string, unknown>, retainedRefresh = "") {
  const access = typeof token.access_token === "string" ? token.access_token : "";
  const refresh = typeof token.refresh_token === "string" && token.refresh_token ? token.refresh_token : retainedRefresh;
  const expires = typeof token.expires_in === "number" ? token.expires_in : Number(token.expires_in);
  const scopes = typeof token.scope === "string" ? token.scope.split(/\s+/).filter(Boolean) : READ_ONLY_SCOPES.split(" ");
  if (!access || !refresh || !Number.isFinite(expires) || expires <= 0 || !scopes.includes("profile") || !scopes.includes("zap:account:all")) return false;
  const { error } = await admin.rpc("zapier_api_store_grant", { _tenant: tenantId, _actor: actorId, _access: access, _refresh: refresh,
    _expires: new Date(Date.now() + expires * 1000).toISOString(), _scopes: scopes });
  return !error;
}

async function exchange(params: URLSearchParams) {
  try {
    const response = await fetch(TOKEN_URL, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: tokenAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: params });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch { return null; }
}

async function currentSecret(admin: DatabaseClient, tenantId: string, actorId: string) {
  const { data } = await admin.rpc("zapier_api_secret_for_service", { _tenant: tenantId });
  if (!data || typeof data.access_token !== "string" || typeof data.refresh_token !== "string") return null;
  if (Date.parse(String(data.expires_at)) > Date.now() + 120_000) return data as Record<string, unknown>;
  const next = await exchange(new URLSearchParams({ grant_type: "refresh_token", refresh_token: data.refresh_token }));
  if (!next || !await storeGrant(admin, tenantId, actorId, next, String(data.refresh_token))) return null;
  const { data: refreshed } = await admin.rpc("zapier_api_secret_for_service", { _tenant: tenantId });
  return refreshed && typeof refreshed.access_token === "string" ? refreshed as Record<string, unknown> : null;
}

async function checkProvider(admin: DatabaseClient, tenantId: string, actorId: string): Promise<CheckResult> {
  const secret = await currentSecret(admin, tenantId, actorId);
  if (!secret) return { ok: false, state: "authorization_expired", code: "authorization_expired" };
  try {
    const response = await fetch(ZAPS_URL, { redirect: "error", signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${secret.access_token}`, Accept: "application/json" } });
    if (response.status === 401) return { ok: false, state: "authorization_expired", code: "authorization_expired" };
    if (response.status === 403) return { ok: false, state: "capability_unavailable", code: "plan_or_api_unavailable" };
    if (response.status === 429 || response.status >= 500) return { ok: false, state: "provider_unavailable", code: "provider_unavailable" };
    if (!response.ok) return { ok: false, state: "needs_attention", code: "response_invalid" };
    const body = await response.json().catch(() => null) as { meta?: { count?: unknown }; data?: unknown } | null;
    if (!body || !Array.isArray(body.data)) return { ok: false, state: "needs_attention", code: "response_invalid" };
    const count = typeof body.meta?.count === "number" && Number.isSafeInteger(body.meta.count) && body.meta.count >= 0 ? body.meta.count : null;
    return { ok: true, count };
  } catch { return { ok: false, state: "provider_unavailable", code: "provider_unavailable" }; }
}

async function record(admin: DatabaseClient, tenantId: string, actorId: string, outcome: string) {
  await admin.from("paige_workspace_events").insert({ tenant_id: tenantId, actor_id: actorId, source_kind: "zapier_api_connection", source_id: crypto.randomUUID(), source_revision: 0, outcome });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "status";
  const { data: tenantId } = await userClient.rpc("current_user_tenant_id");
  if (!tenantId) return jsonResponse({ error: "no_tenant" }, 400);
  const expected = typeof body.expected_tenant_id === "string" ? body.expected_tenant_id : null;
  if (expected && expected !== tenantId) return jsonResponse({ error: "tenant_changed" }, 409);
  const { data: canManage } = await userClient.rpc("is_tenant_owner", { _user_id: user.id, _tenant_id: tenantId });
  if (action === "status") return jsonResponse({ ok: true, connection: await readiness(userClient, tenantId, canManage === true) });
  if (canManage !== true) return jsonResponse({ error: "forbidden" }, 403);
  if (!configured() && action !== "cancel" && action !== "disconnect") return jsonResponse({ error: "capability_unavailable", connection: await readiness(userClient, tenantId, true) }, 503);

  if (action === "cancel") {
    await admin.from("tenant_zapier_api_oauth_attempts").update({ status: "cancelled" }).eq("tenant_id", tenantId).eq("actor_id", user.id).in("status", ["pending", "exchanging"]);
    return jsonResponse({ ok: true, outcome: "cancelled", connection: await readiness(userClient, tenantId, true) });
  }

  if (action === "oauth_begin") {
    const state = safeState();
    await admin.from("tenant_zapier_api_oauth_attempts").update({ status: "cancelled" }).eq("tenant_id", tenantId).in("status", ["pending", "exchanging"]);
    const { error } = await admin.from("tenant_zapier_api_oauth_attempts").insert({ tenant_id: tenantId, actor_id: user.id, state_hash: await digest(state) });
    if (error) return jsonResponse({ error: "start_failed" }, 500);
    const url = new URL(AUTHORIZE_URL); url.search = new URLSearchParams({ response_type: "code", client_id: Deno.env.get("ZAPIER_API_CLIENT_ID")!, redirect_uri: REDIRECT_URI,
      scope: READ_ONLY_SCOPES, response_mode: "query", state }).toString();
    return jsonResponse({ ok: true, authorize_url: url.toString() });
  }

  if (action === "oauth_complete") {
    const state = typeof body.state === "string" ? body.state : ""; const code = typeof body.code === "string" ? body.code : "";
    if (!state || !code) return jsonResponse({ error: "oauth_bad_callback" }, 400);
    const hash = await digest(state);
    const { data: attempt } = await admin.from("tenant_zapier_api_oauth_attempts").select("id,tenant_id,actor_id,status,expires_at").eq("state_hash", hash).maybeSingle();
    if (!attempt || attempt.actor_id !== user.id || attempt.tenant_id !== tenantId || attempt.status !== "pending" || Date.parse(attempt.expires_at) <= Date.now()) return jsonResponse({ error: "oauth_state_invalid" }, 409);
    await admin.from("tenant_zapier_api_oauth_attempts").update({ status: "exchanging" }).eq("id", attempt.id).eq("status", "pending");
    const token = await exchange(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }));
    if (!token || !await storeGrant(admin, tenantId, user.id, token)) {
      await admin.from("tenant_zapier_api_oauth_attempts").update({ status: "failed" }).eq("id", attempt.id);
      return jsonResponse({ error: "oauth_exchange_failed" }, 502);
    }
    await admin.from("tenant_zapier_api_oauth_attempts").update({ status: "success" }).eq("id", attempt.id);
    const result = await checkProvider(admin, tenantId, user.id);
    const now = new Date().toISOString();
    await admin.from("tenant_zapier_api_connections").update(result.ok ? { status: "connected", failure_code: null, accessible_zap_count: result.count, last_checked_at: now, last_success_at: now }
      : { status: result.state, failure_code: result.code, accessible_zap_count: null, last_checked_at: now }).eq("tenant_id", tenantId);
    await record(admin, tenantId, user.id, result.ok ? "zapier_api_connected" : "zapier_api_test_failed");
    return jsonResponse({ ok: true, outcome: result.ok ? "connected" : "needs_attention", connection: await readiness(userClient, tenantId, true) });
  }

  if (action === "test") {
    const result = await checkProvider(admin, tenantId, user.id); const now = new Date().toISOString();
    await admin.from("tenant_zapier_api_connections").update(result.ok ? { status: "connected", failure_code: null, accessible_zap_count: result.count, last_checked_at: now, last_success_at: now }
      : { status: result.state, failure_code: result.code, accessible_zap_count: null, last_checked_at: now }).eq("tenant_id", tenantId);
    await record(admin, tenantId, user.id, result.ok ? "zapier_api_test_succeeded" : "zapier_api_test_failed");
    return jsonResponse({ ok: result.ok, outcome: result.ok ? "succeeded" : "failed", error: result.ok ? undefined : result.code, connection: await readiness(userClient, tenantId, true) });
  }

  if (action === "disconnect") {
    // Zapier documents token deletion through the user's authorized-apps page, not a revocation endpoint.
    // Local access is removed immediately; the UI truthfully tells the owner how to revoke provider-side access.
    await admin.from("tenant_zapier_api_connections").delete().eq("tenant_id", tenantId);
    await admin.from("tenant_zapier_api_oauth_attempts").update({ status: "cancelled" }).eq("tenant_id", tenantId).in("status", ["pending", "exchanging"]);
    await record(admin, tenantId, user.id, "zapier_api_disconnected");
    return jsonResponse({ ok: true, outcome: "disconnected", provider_revoke_required: true, connection: await readiness(userClient, tenantId, true) });
  }
  return jsonResponse({ error: "unsupported_action" }, 400);
});
