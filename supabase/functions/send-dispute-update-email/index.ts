import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DEPRECATED — 2026-04-18 funding-intelligence repositioning.
 * No new dispute-update emails are sent.
 */
serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: "This service has been discontinued.",
      reposition_notice:
        "PaigeAgent.ai no longer sends dispute update emails.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
