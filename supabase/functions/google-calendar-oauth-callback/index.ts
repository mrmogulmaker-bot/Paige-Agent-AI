// Exchanges Google OAuth authorization code for tokens, encrypts + persists
// the refresh token in staff_calendar_settings for the calling user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/calendarCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const enc = new TextEncoder();

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

function calendarRedirectOrigin(fallbackOrigin: string): string {
  return (Deno.env.get("CALENDAR_OAUTH_REDIRECT_ORIGIN") || fallbackOrigin).replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userSupa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userSupa.auth.getUser();

    const { code, state, origin } = await req.json();
    if (!code || !state || !origin) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify state
    let parsed: any;
    try { parsed = await verifyState(state); } catch {
      parsed = null;
    }
    if (!parsed) {
      return new Response(JSON.stringify({ error: "invalid_state" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (user && parsed.u !== user.id) {
      return new Response(JSON.stringify({ error: "state_user_mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Date.now() - Number(parsed.t) > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "state_expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const redirectUri = `${calendarRedirectOrigin(String(origin))}/auth/google-calendar/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.refresh_token) {
      return new Response(JSON.stringify({ error: "token_exchange_failed", detail: tokenJson }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user email
    let googleEmail: string | null = null;
    try {
      const uRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (uRes.ok) {
        const u = await uRes.json();
        googleEmail = u.email ?? null;
      }
    } catch { /* non-fatal */ }

    const refreshEnc = await encryptSecret(String(tokenJson.refresh_token));

    // Resolve tenant_id from profiles
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: prof } = await admin
      .from("profiles").select("tenant_id").eq("id", parsed.u).maybeSingle();

    const { error } = await admin
      .from("staff_calendar_settings")
      .upsert({
        user_id: parsed.u,
        tenant_id: prof?.tenant_id ?? null,
        google_calendar_connected: true,
        google_refresh_token_encrypted: refreshEnc,
        google_email: googleEmail,
        google_calendar_id: "primary",
      }, { onConflict: "user_id" });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, google_email: googleEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
