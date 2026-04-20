// iSoftpull soft credit pull — STUB
// Awaiting iSoftpull API credentials and contract docs.
// Once provisioned: store ISOFTPULL_API_KEY + ISOFTPULL_PARTNER_ID as secrets,
// then replace the mocked block with the real POST to iSoftpull's pull endpoint.

import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PullRequest {
  consent_text_version: string;       // e.g. "v1.0"
  consent_acknowledged_at: string;    // ISO timestamp from client
  ssn_last_4?: string;                // optional preview only — full SSN never stored
  date_of_birth?: string;
  full_legal_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as PullRequest;
    if (!body.consent_text_version || !body.consent_acknowledged_at) {
      return new Response(
        JSON.stringify({ error: "Consent acknowledgement required (FCRA §604)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Log FCRA-compliant consent record
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      entity: "isoftpull_soft_pull",
      action: "consent_logged",
      data: {
        consent_text_version: body.consent_text_version,
        consent_acknowledged_at: body.consent_acknowledged_at,
        ip: req.headers.get("x-forwarded-for") ?? "unknown",
        ua: req.headers.get("user-agent") ?? "unknown",
      },
    });

    const apiKey = Deno.env.get("ISOFTPULL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          status: "pending_provisioning",
          message:
            "Soft pull authorization recorded. iSoftpull API integration is being finalized — your report will be processed as soon as the connection goes live.",
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // TODO once credentials land:
    // const result = await fetch("https://api.isoftpull.com/v1/soft-pull", { ... });
    // Persist scores into credit_report_uploads / credit_factors.

    return new Response(
      JSON.stringify({ status: "pending_provisioning", message: "Stub — replace with live call." }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("isoftpull-soft-pull error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
