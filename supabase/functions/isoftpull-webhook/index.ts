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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyHmacSha256Hex } from "../_shared/webhookSig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-isoftpull-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const rawBody = await req.text();
    const signature = req.headers.get("x-isoftpull-signature");

    const isoftpullEnabled =
      (Deno.env.get("ISOFTPULL_ENABLED") ?? "false").toLowerCase() === "true";
    const secret = Deno.env.get("ISOFTPULL_WEBHOOK_SECRET");

    // When activated, require HMAC verification before any processing.
    if (isoftpullEnabled) {
      if (!secret) {
        console.error("isoftpull-webhook: ISOFTPULL_WEBHOOK_SECRET missing while enabled");
        return new Response(
          JSON.stringify({ error: "webhook_not_configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const ok = await verifyHmacSha256Hex(secret, rawBody, signature);
      if (!ok) {
        return new Response(
          JSON.stringify({ error: "invalid_signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let payload: unknown = null;
    try { payload = JSON.parse(rawBody); } catch { payload = null; }

    // Log inbound webhook for traceability (after sig check when enabled).
    await supabase.from("audit_logs").insert({
      user_id: null,
      entity: "isoftpull_webhook",
      action: "received",
      data: {
        payload,
        signature_present: !!signature,
        received_at: new Date().toISOString(),
      },
    });

    if (!isoftpullEnabled) {
      return new Response(
        JSON.stringify({ status: "received_pending_activation" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // TODO: normalize iSoftpull payload -> credit_accounts / credit_negative_items
    //       / credit_report_personal_info / credit_report_uploads
    // TODO: trigger calculate-credit-factors for the user

    return new Response(
      JSON.stringify({ status: "ok" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("isoftpull-webhook error:", err);
    return new Response(
      JSON.stringify({ status: "error_logged" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
