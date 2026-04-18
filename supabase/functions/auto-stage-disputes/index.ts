import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DEPRECATED — 2026-04-18 funding-intelligence repositioning.
 * See generate-dispute-letter/index.ts for full context.
 */
serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: "This service has been discontinued.",
      reposition_notice:
        "PaigeAgent.ai is now a funding intelligence platform and no longer auto-stages disputes.",
      cfpb_url:
        "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/",
      staged: 0,
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
