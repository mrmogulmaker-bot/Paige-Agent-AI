// Comms C-2v — Voice Access Token mint (#140 Slice A1). JWT-gated; a tenant admin/coach
// (or the platform owner) requests a SHORT-lived Twilio Voice Access Token so their
// browser can register with Twilio and place/receive calls billed to the tenant's OWN
// Twilio subaccount. This is the callable token seam (§10) — the future dial-pad UI (A2)
// is just one caller; Paige's headless agent is another (service-role bearer).
//
// DOCTRINE
//  §9  The token is a bearer credential (whoever holds it can call as `identity` on the
//      tenant subaccount). So BOTH the tenant AND the identity are SERVER-DERIVED from
//      the caller JWT, never the body: tenant = current_user_tenant_id(); identity =
//      `${tenantId}:${userId}`. A body cannot widen scope, name another tenant, or set
//      the identity — it can only (optionally) SHORTEN the TTL within the server cap.
//      Mirrors comms-search-numbers' §9 pattern exactly (getUser → role gate →
//      current_user_tenant_id → service-role for Vault).
//  §13 Honest: needs_config (not a fake token) when the subaccount / TwiML app is not
//      provisioned, or master/subaccount creds are missing. The token TTL is SHORT
//      (default 600s, hard-capped 3600s) and the identity is non-forgeable.
//  §18 Reuses the ONE Twilio seam (_shared/twilio.ts mintVoiceAccessToken) — no inline
//      JWT signing here, no second Twilio client, no new npm dep (Deno-native HMAC).
//  §34 Twilio is the last-mile commodity behind our seam. No voice-intelligence vendor
//      (Deepgram = Slice B1; Vapi = Marketplace #154) is touched here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mintVoiceAccessToken, type SupabaseAdminLike } from "../_shared/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Request body — the ONLY tunable is an optional TTL, and the server CLAMPS it to
 * [60, 3600] (default 600). Tenant and identity are NEVER read from here (§9): a body
 * value can only shorten the token's life within the cap, never widen its scope.
 */
interface TokenBody {
  ttl_seconds?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── AuthN + admin/coach gate (§9). Tenant + identity are derived from the JWT, never the body. ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  // Platform owner OR a tenant admin/coach may mint (same authority that owns the number).
  const { data: isOwner } = await userClient.rpc("is_platform_owner");
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: user.id, _role: "coach" });
  if (isOwner !== true && isAdmin !== true && isCoach !== true) {
    return json({ error: "forbidden" }, 403);
  }

  // §9: the tenant is the caller's OWN tenant (JWT-scoped), never a body value.
  const { data: tenantId } = await userClient.rpc("current_user_tenant_id");
  if (!tenantId || typeof tenantId !== "string") {
    return json({ needs_config: true, error: "tenant_not_resolved" });
  }

  let body: TokenBody = {};
  try { body = (await req.json()) as TokenBody; } catch { body = {}; }
  const ttlSeconds = typeof body.ttl_seconds === "number" ? body.ttl_seconds : undefined;

  // §9/§13: identity is derived SERVER-SIDE from the verified JWT (tenant + user), NEVER
  // the body. Stable per (tenant, user) so a token can only ever act as this principal;
  // the tenant prefix means it can never register under another tenant's namespace.
  // Separator is a DOT, not a colon: Twilio Client identities are embedded into the
  // `client:IDENTITY` address and must stay in [A-Za-z0-9_-.] — a colon collides with the
  // `client:` scheme and breaks inbound <Client> dial-by-identity in A2/A3. The format is
  // baked in here NOW because those later slices route on it (crew verifier + compliance).
  const identity = `${tenantId}.${user.id}`;

  const minted = await mintVoiceAccessToken(admin as unknown as SupabaseAdminLike, {
    tenantId,
    identity,
    ttlSeconds,
  });
  if (!minted.ok || !minted.data) {
    // Honest degrade (§13): a subaccount/TwiML-app that isn't provisioned yields
    // needs_config (200, so the UI shows a "not set up yet" state, not an error toast);
    // a real failure is a 502. Never a fabricated token.
    return json({
      needs_config: minted.needs_config === true,
      error: minted.error ?? "voice_token_unavailable",
      message: minted.needs_config
        ? "Voice isn't set up for this practice yet. Once your phone number is provisioned you'll be able to call from the browser."
        : "Voice token is temporarily unavailable.",
    }, minted.needs_config ? 200 : 502);
  }

  return json({
    token: minted.data.token,
    identity: minted.data.identity,
    expiresAt: minted.data.expiresAt,
    ttlSeconds: minted.data.ttlSeconds,
  });
});
