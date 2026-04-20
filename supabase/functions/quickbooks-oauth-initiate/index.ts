import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { QB_AUTHORIZE_URL, QB_SCOPES, getRedirectUri } from "../_shared/quickbooks-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { businessId, environment = "sandbox" } = await req.json().catch(() => ({}));
    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
    if (!clientId) throw new Error("QUICKBOOKS_CLIENT_ID not configured");

    // Encode state: user_id|business_id|env|nonce — JWT-style would be safer but base64 is fine for short-lived OAuth state.
    const nonce = crypto.randomUUID();
    const stateRaw = JSON.stringify({ uid: user.id, bid: businessId || null, env: environment, n: nonce });
    const state = btoa(stateRaw);

    // Persist nonce so callback can validate
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      entity: "quickbooks_oauth",
      action: "initiate",
      data: { nonce, environment, business_id: businessId || null },
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      scope: QB_SCOPES,
      redirect_uri: getRedirectUri(),
      state,
    });

    const authUrl = `${QB_AUTHORIZE_URL}?${params.toString()}`;
    return new Response(JSON.stringify({ authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[qb-initiate]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
