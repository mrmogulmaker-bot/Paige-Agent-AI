// Zoom OAuth callback. Zoom redirects the host's browser straight here (the
// redirect_uri configured on the Zoom app == this function), so there is NO
// Supabase JWT on the request — the connecting host is identified SOLELY by the
// HMAC-signed `state` minted in zoom-oauth-start (§9: the signature is what stops
// a forged state from attaching a Zoom account to another user).
//
// Mirrors google-calendar-oauth-callback: verify state, exchange the code, fetch
// the Zoom user, encrypt refresh + access tokens (calendarCrypto), upsert onto
// staff_calendar_settings for the connecting host, then 302 back to the Connectors
// page with ?zoom=connected|error. verify_jwt=false for this function (config.toml).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/calendarCrypto.ts";

const enc = new TextEncoder();

// Hard fallback if the state is unverifiable (we can't trust its return origin).
const FALLBACK_APP_ORIGIN = "https://app.paigeagent.ai";

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function verifyState(state: string): Promise<Record<string, unknown> | null> {
  const secret = Deno.env.get("CALENDAR_ENCRYPTION_KEY");
  if (!secret) throw new Error("CALENDAR_ENCRYPTION_KEY not configured");
  const [payloadPart, signaturePart] = state.split(".");
  if (!payloadPart || !signaturePart) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payloadPart))));
  if (expected !== signaturePart) return null;
  return JSON.parse(base64UrlDecode(payloadPart));
}

function allowedReturnOrigin(origin: unknown): string | null {
  if (typeof origin !== "string") return null;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const allowed =
      url.protocol === "http:" && host === "localhost" ||
      url.protocol === "https:" && (
        host === "paigeagent.ai" ||
        host === "www.paigeagent.ai" ||
        host === "app.paigeagent.ai" ||
        host === "portal.mogulmakeracademy.com" ||
        host.endsWith(".vercel.app") ||
        host.endsWith(".lovable.app") ||
        host.endsWith(".lovableproject.com")
      );
    return allowed ? url.origin : null;
  } catch {
    return null;
  }
}

function zoomRedirectUri(): string {
  const explicit = Deno.env.get("ZOOM_OAUTH_REDIRECT_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${supabaseUrl}/functions/v1/zoom-oauth-callback`;
}

function redirectTo(origin: string, status: "connected" | "error", detail?: string): Response {
  const url = new URL(`${origin.replace(/\/$/, "")}/admin/settings`);
  url.searchParams.set("tab", "connectors");
  url.searchParams.set("zoom", status);
  if (detail) url.searchParams.set("zoom_detail", detail);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

// Role-aware success landing (shared redirect contract): a staff user (admin,
// coach, or super_admin) lands on the admin connectors surface; a client/consumer
// lands on their own portal settings. Errors always use redirectTo() above — only
// the *success* path is role-aware. On any role-lookup failure we fail toward the
// safe non-admin surface so an admin route is never leaked to a client.
async function redirectConnectedForUser(
  admin: ReturnType<typeof createClient>,
  origin: string,
  userId: string,
): Promise<Response> {
  let isStaff = false;
  try {
    const { data, error } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "coach", "super_admin", "platform_admin"])
      .limit(1);
    if (!error && data && data.length > 0) isStaff = true;
  } catch {
    isStaff = false; // fail toward the client (non-admin) surface
  }

  const base = origin.replace(/\/$/, "");
  const url = isStaff
    ? (() => { const u = new URL(`${base}/admin/settings`); u.searchParams.set("tab", "connectors"); return u; })()
    : (() => { const u = new URL(`${base}/app/settings`); u.searchParams.set("tab", "accounts"); return u; })();
  url.searchParams.set("zoom", "connected");
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  // Zoom sends a browser GET with ?code=&state= (or ?error= on denial).
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const stateParam = reqUrl.searchParams.get("state");
  const oauthError = reqUrl.searchParams.get("error");

  // Verify state first so we know where to send the host back.
  let parsed: Record<string, unknown> | null = null;
  if (stateParam) {
    try { parsed = await verifyState(stateParam); } catch { parsed = null; }
  }
  const returnOrigin = allowedReturnOrigin(parsed?.r) ?? FALLBACK_APP_ORIGIN;

  try {
    if (oauthError) return redirectTo(returnOrigin, "error", "access_denied");
    if (!code || !stateParam) return redirectTo(returnOrigin, "error", "missing_params");
    if (!parsed) return redirectTo(returnOrigin, "error", "invalid_state");
    if (Date.now() - Number(parsed.t) > 10 * 60 * 1000) {
      return redirectTo(returnOrigin, "error", "state_expired");
    }
    const hostUserId = String(parsed.u);
    if (!hostUserId) return redirectTo(returnOrigin, "error", "invalid_state");

    const clientId = Deno.env.get("ZOOM_CLIENT_ID");
    const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
    if (!clientId || !clientSecret) return redirectTo(returnOrigin, "error", "zoom_oauth_not_configured");

    // Exchange the authorization code (Basic auth header, form body).
    const basic = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: zoomRedirectUri(),
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.access_token || !tokenJson.refresh_token) {
      return redirectTo(returnOrigin, "error", "token_exchange_failed");
    }

    // Fetch the connected Zoom user for id + email (non-fatal on failure).
    let zoomUserId: string | null = null;
    let zoomEmail: string | null = null;
    try {
      const meRes = await fetch("https://api.zoom.us/v2/users/me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        zoomUserId = me.id ?? null;
        zoomEmail = me.email ?? null;
      }
    } catch { /* non-fatal */ }

    const refreshEnc = await encryptSecret(String(tokenJson.refresh_token));
    const accessEnc = await encryptSecret(String(tokenJson.access_token));
    const expiresAt = new Date(Date.now() + Number(tokenJson.expires_in ?? 3600) * 1000).toISOString();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: prof } = await admin
      .from("profiles").select("tenant_id").eq("id", hostUserId).maybeSingle();

    const { error } = await admin
      .from("staff_calendar_settings")
      .upsert({
        user_id: hostUserId,
        tenant_id: prof?.tenant_id ?? null,
        zoom_connected: true,
        zoom_user_id: zoomUserId,
        zoom_email: zoomEmail,
        zoom_refresh_token_encrypted: refreshEnc,
        zoom_access_token_encrypted: accessEnc,
        zoom_token_expires_at: expiresAt,
      }, { onConflict: "user_id" });

    if (error) return redirectTo(returnOrigin, "error", "persist_failed");

    return await redirectConnectedForUser(admin, returnOrigin, hostUserId);
  } catch {
    return redirectTo(returnOrigin, "error", "unexpected");
  }
});
