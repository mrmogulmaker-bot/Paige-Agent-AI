// Starts Zoom OAuth for a per-HOST Zoom connection (User-managed OAuth app).
// Mirrors google-calendar-oauth-start: authed, HMAC-signed state carrying the
// connecting user id + return origin, returns { authorization_url } for the client.
//
// Unlike Google (which redirects to a frontend page), Zoom's redirect_uri points
// straight at the zoom-oauth-callback edge function — Zoom's browser redirect can't
// carry a Supabase JWT, so the SIGNED state is the only thing that identifies the
// connecting host (§9: a host can only ever attach THEIR OWN Zoom; forging the state
// to attach a Zoom account to another user is prevented by the HMAC signature).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const enc = new TextEncoder();

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? enc.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signState(payload: Record<string, unknown>): Promise<string> {
  const secret = Deno.env.get("CALENDAR_ENCRYPTION_KEY");
  if (!secret) throw new Error("CALENDAR_ENCRYPTION_KEY not configured");
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payloadPart)));
  return `${payloadPart}.${base64UrlEncode(sig)}`;
}

function allowedReturnOrigin(origin: string): string | null {
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

// Fixed redirect URI — must match the Zoom app config exactly.
function zoomRedirectUri(): string {
  const explicit = Deno.env.get("ZOOM_OAUTH_REDIRECT_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${supabaseUrl}/functions/v1/zoom-oauth-callback`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("ZOOM_CLIENT_ID");
    if (!clientId) {
      return new Response(JSON.stringify({ error: "zoom_oauth_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const origin = body.origin as string | undefined;
    const returnOrigin = origin ? allowedReturnOrigin(origin) : null;
    if (!returnOrigin) {
      return new Response(JSON.stringify({ error: "origin_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = await signState({
      u: user.id,
      n: crypto.randomUUID(),
      t: Date.now(),
      r: returnOrigin,
    });

    // Scopes are granted by the Zoom app config (meeting:write, user:read).
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: zoomRedirectUri(),
      state,
    });

    const authorization_url = `https://zoom.us/oauth/authorize?${params.toString()}`;
    return new Response(JSON.stringify({ authorization_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
