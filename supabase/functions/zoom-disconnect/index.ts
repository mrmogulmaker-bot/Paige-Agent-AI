// Clears the caller's Zoom connection (mirror of google-calendar-disconnect).
// Best-effort revoke at Zoom is attempted but never blocks the local clear.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/calendarCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization") ?? "";
  const userSupa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userSupa.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Best-effort revoke at Zoom before we drop the ciphertext (non-fatal).
  try {
    const clientId = Deno.env.get("ZOOM_CLIENT_ID");
    const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
    const { data: row } = await admin
      .from("staff_calendar_settings")
      .select("zoom_refresh_token_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (clientId && clientSecret && row?.zoom_refresh_token_encrypted) {
      const refresh = await decryptSecret(row.zoom_refresh_token_encrypted);
      await fetch("https://zoom.us/oauth/revoke", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token: refresh }),
      });
    }
  } catch { /* non-fatal — always clear locally */ }

  const { error } = await admin.from("staff_calendar_settings").update({
    zoom_connected: false,
    zoom_user_id: null,
    zoom_email: null,
    zoom_refresh_token_encrypted: null,
    zoom_access_token_encrypted: null,
    zoom_token_expires_at: null,
  }).eq("user_id", user.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
