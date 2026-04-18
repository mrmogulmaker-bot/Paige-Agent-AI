import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * DEPRECATED — 2026-04-18 funding-intelligence repositioning.
 *
 * PaigeAgent.ai no longer offers credit dispute services and is not a Credit
 * Repair Organization (CRO) under CROA. This function is permanently disabled.
 *
 * Users seeking to dispute information on their credit reports should use the
 * CFPB's free self-help dispute resources at:
 *   https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/
 */
serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "This service has been discontinued.",
      reposition_notice:
        "PaigeAgent.ai is now a business funding intelligence platform and no longer provides credit dispute services.",
      cfpb_url:
        "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/",
    }),
    {
      status: 410, // Gone
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
