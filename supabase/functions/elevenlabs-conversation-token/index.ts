import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Returns a single-use ElevenLabs WebRTC conversation token.
 * WebRTC is more reliable than WebSocket on mobile (especially iOS Safari)
 * because it uses the browser's native media pipeline and doesn't require
 * a second getUserMedia call from the SDK.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let agentIdFromBody: string | undefined;
    try {
      const body = await req.json();
      agentIdFromBody = body?.agentId;
    } catch (_) {
      // ignore
    }

    const agentId = agentIdFromBody || Deno.env.get("ELEVENLABS_AGENT_ID");
    if (!agentId) {
      return new Response(
        JSON.stringify({
          error: "Missing ElevenLabs Agent ID. Set ELEVENLABS_AGENT_ID secret or pass { agentId } in body.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Requesting WebRTC conversation token for agent:", agentId);
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      {
        method: "GET",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs token API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to get conversation token", details: errorText, status: response.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify({ token: data.token, agentId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("elevenlabs-conversation-token error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
