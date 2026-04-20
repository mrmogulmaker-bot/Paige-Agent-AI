// iSoftpull webhook receiver — STUB
// Public webhook URL (provide to iSoftpull when registering):
//   https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/isoftpull-webhook
//
// When live: validate signature, look up user by reference id, then normalize
// the iSoftpull payload into:
//   - credit_accounts
//   - credit_negative_items
//   - credit_report_personal_info
//   - credit_report_uploads (mark as completed)

import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let payload: unknown = null;
    try {
      payload = await req.json();
    } catch {
      payload = null;
    }

    // Always log inbound webhook for traceability — never block iSoftpull retries
    await supabase.from("audit_logs").insert({
      user_id: null,
      entity: "isoftpull_webhook",
      action: "received",
      data: {
        payload,
        signature: req.headers.get("x-isoftpull-signature") ?? null,
        received_at: new Date().toISOString(),
      },
    });

    const isoftpullEnabled =
      (Deno.env.get("ISOFTPULL_ENABLED") ?? "false").toLowerCase() === "true";

    if (!isoftpullEnabled) {
      // Acknowledge so iSoftpull doesn't retry, but don't process yet
      return new Response(
        JSON.stringify({ status: "received_pending_activation" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // TODO: signature verification (HMAC) using ISOFTPULL_WEBHOOK_SECRET
    // TODO: normalize iSoftpull payload -> credit_accounts / credit_negative_items
    //       / credit_report_personal_info / credit_report_uploads
    // TODO: trigger calculate-credit-factors for the user

    return new Response(
      JSON.stringify({ status: "ok" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("isoftpull-webhook error:", err);
    // Return 200 so iSoftpull doesn't infinitely retry — we already logged the payload
    return new Response(
      JSON.stringify({ status: "error_logged" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
