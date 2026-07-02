import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Sprint C.3 — MCC ecosystem exit (Doctrine §199).
// This surface is deprecated. The underlying `mcc_service_requests` table has
// been dropped. Any inbound request is answered with HTTP 410 Gone so callers
// migrate to the external MCC ecosystem instead of silently failing.

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      ok: false,
      error: "GONE",
      message:
        "MCC service requests have moved to the external MCC ecosystem (Doctrine §199). This endpoint is retired.",
      migrated_at: "2026-07-02",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
