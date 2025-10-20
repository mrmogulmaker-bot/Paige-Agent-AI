import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("elevenlabs-signed-url function invoked");

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY not configured");
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional body with agentId override
    let agentIdFromBody: string | undefined;
    try {
      const body = await req.json();
      agentIdFromBody = body?.agentId;
    } catch (_) {
      // ignore missing/invalid JSON
    }

    const agentId = agentIdFromBody || Deno.env.get("ELEVENLABS_AGENT_ID");
    console.log("Agent ID:", agentId ? "found" : "missing");
    
    if (!agentId) {
      console.error("Missing ElevenLabs Agent ID");
      return new Response(JSON.stringify({ error: "Missing ElevenLabs Agent ID. Set ELEVENLABS_AGENT_ID secret or pass { agentId } in request body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user context (optional)
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || "" } }
    });

    const { data: { user } } = await supabase.auth.getUser();

    // Get profile for personalization (best-effort)
    let userName = "there";
    if (user) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.full_name) userName = profile.full_name;
      } catch (_) { /* ignore */ }
    }

    // Request signed URL from ElevenLabs
    console.log("Requesting signed URL from ElevenLabs...");
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: "GET",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      const status = response.status === 401 || response.status === 403 ? 502 : 500;
      return new Response(JSON.stringify({ error: "Failed to get signed URL", details: errorText }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    console.log("Successfully got signed URL");

    return new Response(
      JSON.stringify({ signedUrl: data.signed_url, userName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("elevenlabs-signed-url error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
