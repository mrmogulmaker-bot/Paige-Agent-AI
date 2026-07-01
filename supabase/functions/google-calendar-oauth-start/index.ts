// Starts Google OAuth for per-user Calendar connection.
// Returns { authorization_url } for the client to redirect to.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    if (!clientId) {
      return new Response(JSON.stringify({ error: "google_oauth_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const origin = body.origin as string | undefined;
    if (!origin) {
      return new Response(JSON.stringify({ error: "origin_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectUri = `${origin.replace(/\/$/, "")}/auth/google-calendar/callback`;
    // Signed state = base64(json{ user_id, nonce, ts }) — verified on callback via user_id match + freshness.
    const state = btoa(JSON.stringify({
      u: user.id,
      n: crypto.randomUUID(),
      t: Date.now(),
      r: origin,
    }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });

    const authorization_url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
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
