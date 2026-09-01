// paige-operator-sms-inbound — Twilio inbound SMS webhook for the OPERATOR number
// (+1 (470) 200-3444, on the A2P Messaging Service of the Twilio account still named
// "Paige Agent AI LLC" — vendor account name pending rename to Paige Agent AI Inc. per the
// 2026-08-11 C-Corp conversion, owner-owed).
//
// This is the OPERATOR counterpart to handle-inbound-sms (which serves TENANT numbers).
// It persists inbound SMS to the operator-private store (operator_conversations /
// operator_messages) — NEVER any tenant's conversations (§9). Config: verify_jwt = false
// (Twilio cannot send a Supabase JWT); trust is established by validating the Twilio
// request signature (X-Twilio-Signature) BEFORE the payload is read as truth (§13 spoof
// guard) using the operator account Auth Token via the ONE shared validator (§18).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { decideOperatorInboundGate } from "../_shared/operator-twilio.ts";
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

  // ── Signature gate FIRST — FAIL CLOSED (§9 spoof/DoS guard). Twilio signs every inbound
  // webhook with the operator account Auth Token. This handler is net-new with NO legitimate
  // unsigned caller, so anything the gate does not explicitly trust is rejected 401 and
  // NOTHING is written. decideOperatorInboundGate is the ONE decision the handler and the
  // headless smoke both drive (§18 one home, §32): it accepts only a valid signature (token
  // set) or the explicit dev-only ALLOW_UNSIGNED_OPERATOR_SMS=true escape hatch (token unset);
  // a token-unset request WITHOUT that flag, or a bad/missing signature, rejects. ──────────
  const gate = await decideOperatorInboundGate(
    req.headers.get("x-twilio-signature"),
    req.url,
    rawBody,
  );
  if (!gate.accept) {
    console.error(`[paige-operator-sms-inbound] REJECTED unsigned/untrusted inbound (${gate.reason}) — fail closed, nothing written. Set TWILIO_OPERATOR_AUTH_TOKEN to enforce signatures.`);
    return new Response(gate.reason, { status: gate.status });
  }
  if (gate.reason === "unsigned_dev_escape_hatch") {
    console.warn("[paige-operator-sms-inbound] ALLOW_UNSIGNED_OPERATOR_SMS=true and no auth token — accepting UNSIGNED inbound (dev-only escape hatch; do NOT use in prod).");
  }

  const params = new URLSearchParams(rawBody);
  const fromPhone = params.get("From") ?? "";
  const toPhone = params.get("To") ?? "";
  const messageSid = params.get("MessageSid") ?? crypto.randomUUID();
  const bodyRaw = (params.get("Body") ?? "").trim();
  const bodyUpper = bodyRaw.toUpperCase();
  const optOutType = (params.get("OptOutType") ?? "").trim().toUpperCase();
  const keyword = optOutType || bodyUpper;

  if (!fromPhone) return twiml();
  const fromNorm = normalizePhone(fromPhone);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Keyword handling. Opt-out state for the operator number is enforced by Twilio's own
  // Advanced Opt-Out on the Messaging Service; here we acknowledge and still THREAD the
  // message so the operator has the full record (§13 — we never drop a real inbound).
  if (optOutType === "STOP" || STOP_KEYWORDS.includes(keyword)) {
    await revokePlatformSmsConsent(admin, fromNorm);
    await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, "opt_out");
    return twiml();
  }
  if (optOutType === "START" || START_KEYWORDS.includes(keyword)) {
    const restored = await restorePlatformSmsConsent(admin, fromNorm);
    await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, "opt_in");
    if (optOutType) return twiml();
    return restored
      ? twiml("Paige Agent AI: You are subscribed to recurring account and service text messages. Message frequency varies. Reply HELP for help or STOP to opt out.")
      : twiml("Paige Agent AI: We could not restore text messages for this number. Sign in at https://paigeagent.ai/auth?mode=login or email support@paigeagent.ai for help.");
  }
  if (optOutType === "HELP" || keyword === "HELP" || keyword === "INFO") {
    await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, "help");
    return optOutType
      ? twiml()
      : twiml("Paige Agent AI: For help, email support@paigeagent.ai. Reply STOP to opt out.");
  }

  await persistInbound(admin, fromNorm, toPhone, bodyRaw, messageSid, null);
  return twiml();
});

type Admin = ReturnType<typeof createClient>;

async function revokePlatformSmsConsent(admin: Admin, phone: string): Promise<void> {
  const { error } = await admin
    .from("communications_consents")
    .update({ revoked_at: new Date().toISOString(), withdrawn_reason: "sms_stop_keyword" })
    .eq("phone", phone)
    .is("tenant_id", null)
    .is("contact_id", null)
    .not("consent_granted_at", "is", null)
    .is("revoked_at", null);
  if (error) console.error("[paige-operator-sms-inbound] consent revocation failed:", error.message);
}

async function restorePlatformSmsConsent(admin: Admin, phone: string): Promise<boolean> {
  const { data: active } = await admin
    .from("communications_consents")
    .select("id")
    .eq("phone", phone)
    .is("tenant_id", null)
    .is("contact_id", null)
    .not("consent_granted_at", "is", null)
    .is("revoked_at", null)
    .is("withdrawn_at", null)
    .limit(1)
    .maybeSingle();
  if (active) return true;

  const { data: prior, error: priorError } = await admin
    .from("communications_consents")
    .select("user_id,email")
    .eq("phone", phone)
    .is("tenant_id", null)
    .is("contact_id", null)
    .not("consent_granted_at", "is", null)
    .order("consent_granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorError || !prior?.user_id) return false;

  const now = new Date().toISOString();
  const { error } = await admin.from("communications_consents").insert({
    user_id: prior.user_id,
    email: prior.email,
    phone,
    sms_transactional: true,
    sms_marketing: false,
    source: "sms_start_keyword",
    source_url: "https://paigeagent.ai/sms-terms#start",
    disclosure_version: "paige-platform-account-service-v1-2026-08-31",
    consent_granted_at: now,
    user_agent: "Twilio inbound START/UNSTOP keyword",
  });
  if (error) {
    console.error("[paige-operator-sms-inbound] consent restore failed:", error.message);
    return false;
  }
  return true;
}

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
