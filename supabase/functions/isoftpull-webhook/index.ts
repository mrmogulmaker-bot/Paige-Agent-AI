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

const MAX_BODY_BYTES = 256 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-isoftpull-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function readBodyWithLimit(req: Request): Promise<string> {
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("payload_too_large");
  }

  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("payload_too_large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let rawBody: string;
    try {
      rawBody = await readBodyWithLimit(req);
    } catch (error) {
      if (error instanceof Error && error.message === "payload_too_large") {
        return new Response(JSON.stringify({ error: "payload_too_large" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw error;
    }
    const signature = req.headers.get("x-isoftpull-signature");

    const isoftpullEnabled =
      (Deno.env.get("ISOFTPULL_ENABLED") ?? "false").toLowerCase() === "true";
    const secret = Deno.env.get("ISOFTPULL_WEBHOOK_SECRET");

    // A disabled integration must not permit anonymous audit-log writes.
    if (!isoftpullEnabled) {
      return new Response(
        JSON.stringify({ status: "received_pending_activation" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // When activated, require HMAC verification before any processing or write.
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

    // A raw-body digest provides replay protection even if the provider payload
    // does not expose a stable event id. Signed redeliveries are acknowledged
    // without repeating database writes or downstream processing.
    const replayKey = await sha256Hex(rawBody);
    const { data: priorDelivery } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("entity", "isoftpull_webhook")
      .contains("data", { replay_key: replayKey })
      .limit(1)
      .maybeSingle();
    if (priorDelivery) {
      return new Response(JSON.stringify({ status: "duplicate_ignored" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log inbound webhook for traceability (after sig check when enabled).
    await supabase.from("audit_logs").insert({
      user_id: null,
      entity: "isoftpull_webhook",
      action: "received",
      data: {
        payload,
        replay_key: replayKey,
        signature_present: !!signature,
        received_at: new Date().toISOString(),
      },
    });

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
