// paige-operator-sms-inbound — Twilio inbound SMS webhook for the OPERATOR number
// (+1 (470) 200-3444 on the "Paige Agent AI LLC" Twilio account's A2P Messaging Service).
//
// This is the OPERATOR counterpart to handle-inbound-sms (which serves TENANT numbers).
// It persists inbound SMS to the operator-private store (operator_conversations /
// operator_messages) — NEVER any tenant's conversations (§9). Config: verify_jwt = false
// (Twilio cannot send a Supabase JWT); trust is established by validating the Twilio
// request signature (X-Twilio-Signature) BEFORE the payload is read as truth (§13 spoof
// guard) using the operator account Auth Token via the ONE shared validator (§18).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateOperatorTwilioSignature, operatorInboundAuthToken } from "../_shared/operator-twilio.ts";
import { normalizePhone } from "../_shared/pre-send-pipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_KEYWORDS = ["START", "YES", "UNSTOP"];

function twiml(message?: string): Response {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(xml, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/xml" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const rawBody = await req.text();

  // ── Signature validation FIRST (§13 spoof/SSRF guard). Twilio signs with the operator
  // account Auth Token. If the token is unset we degrade like the platform's other inbound
  // handlers (accept-unsigned + LOUD warning) so the surface still works before the owner
  // pastes it — but a mismatch when the token IS set is a hard 401. ─────────────────────
  const token = operatorInboundAuthToken();
  if (token) {
    const sig = req.headers.get("x-twilio-signature");
    const valid = await validateOperatorTwilioSignature(sig, req.url, rawBody);
    if (!valid) return new Response("invalid_signature", { status: 401 });
  } else {
    console.warn("[paige-operator-sms-inbound] TWILIO_OPERATOR_AUTH_TOKEN not set — accepting unsigned (set it to enforce signature validation)");
  }

  const params = new URLSearchParams(rawBody);
  const fromPhone = params.get("From") ?? "";
  const toPhone = params.get("To") ?? "";
  const messageSid = params.get("MessageSid") ?? crypto.randomUUID();
  const bodyRaw = (params.get("Body") ?? "").trim();
  const bodyUpper = bodyRaw.toUpperCase();

  if (!fromPhone) return twiml();
  const fromNorm = normalizePhone(fromPhone);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Keyword handling. Opt-out state for the operator number is enforced by Twilio's own
  // Advanced Opt-Out on the Messaging Service; here we acknowledge and still THREAD the
  // message so the operator has the full record (§13 — we never drop a real inbound).
  if (STOP_KEYWORDS.includes(bodyUpper)) {
    await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, "opt_out");
    return twiml();
  }
  if (START_KEYWORDS.includes(bodyUpper)) {
    await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, "opt_in");
    return twiml("You are re-subscribed to Paige Agent AI SMS. Reply STOP to opt out.");
  }
  if (bodyUpper === "HELP" || bodyUpper === "INFO") {
    await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, "help");
    return twiml("Paige Agent AI support: support@paigeagent.ai. Reply STOP to unsubscribe.");
  }

  await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, null);
  return twiml();
});

// deno-lint-ignore no-explicit-any
type Admin = any;

// Upsert the operator thread for the sender, then insert the inbound message (idempotent
// on the Twilio MessageSid via the partial unique index — a re-delivery is a no-op).
async function persistInbound(
  admin: Admin,
  fromNorm: string,
  toPhone: string,
  body: string,
  messageSid: string,
  intent: "opt_out" | "opt_in" | "help" | null,
): Promise<void> {
  try {
    const { data: convo, error: convoErr } = await admin
      .from("operator_conversations")
      .upsert(
        { channel: "sms", counterparty_phone: fromNorm },
        { onConflict: "channel,counterparty_phone", ignoreDuplicates: false },
      )
      .select("id, unread_count")
      .single();
    if (convoErr || !convo) {
      console.error("[paige-operator-sms-inbound] conversation upsert failed:", convoErr?.message);
      return;
    }
    const conversationId = convo.id as string;

    const { error: msgErr } = await admin.from("operator_messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      body: body || "(empty)",
      status: "received",
      provider_message_id: messageSid,
      from_phone: fromNorm,
      to_phone: toPhone || null,
      metadata: intent ? { intent } : {},
    });
    // 23505 = the same MessageSid already landed (Twilio re-delivery). Treat as success.
    if (msgErr && msgErr.code !== "23505") {
      console.error("[paige-operator-sms-inbound] message insert failed:", msgErr.code, msgErr.message);
      return;
    }
    if (msgErr && msgErr.code === "23505") return; // already threaded — don't double-bump unread

    await admin
      .from("operator_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_direction: "inbound",
        last_preview: (body || "").slice(0, 140),
        unread_count: (convo.unread_count ?? 0) + 1,
      })
      .eq("id", conversationId);
  } catch (e) {
    console.error("[paige-operator-sms-inbound] persistInbound fault (twiml still 200):", (e as Error)?.message);
  }
}
