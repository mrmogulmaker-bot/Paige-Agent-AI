// Twilio inbound SMS webhook receiver — Paige OS Phase 1.
// Handles STOP/START/HELP keywords inline; otherwise inserts into paige_conversations
// and fires customer_support_intake to the MMA OS bridge so n8n CS Triage can draft a reply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fireAndForgetBridge } from "../_shared/mmaOsBridge.ts";

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

async function verifyTwilio(req: Request, rawBody: string): Promise<boolean> {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!token) {
    console.warn("[handle-inbound-sms] TWILIO_AUTH_TOKEN not set — accepting unsigned");
    return true;
  }
  const sig = req.headers.get("x-twilio-signature");
  if (!sig) return false;
  const url = req.url;
  const params = new URLSearchParams(rawBody);
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const concatenated = url + sorted.map(([k, v]) => k + v).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(concatenated));
  const computed = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return computed === sig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const rawBody = await req.text();
  const verified = await verifyTwilio(req, rawBody);
  if (!verified) return new Response("invalid_signature", { status: 401 });

  const params = new URLSearchParams(rawBody);
  const fromPhone = params.get("From") ?? "";
  const messageSid = params.get("MessageSid") ?? crypto.randomUUID();
  const bodyRaw = (params.get("Body") ?? "").trim();
  const bodyUpper = bodyRaw.toUpperCase();

  // Keyword handling — preserve existing twilio-inbound-webhook behavior
  if (STOP_KEYWORDS.includes(bodyUpper)) {
    const { data: prefs } = await admin
      .from("communication_preferences")
      .select("user_id")
      .eq("sms_phone_number", fromPhone)
      .maybeSingle();
    if (prefs?.user_id) {
      await admin.from("communication_preferences")
        .update({ sms_enabled: false }).eq("user_id", prefs.user_id);
    }
    return twiml();
  }
  if (START_KEYWORDS.includes(bodyUpper)) {
    const { data: prefs } = await admin
      .from("communication_preferences")
      .select("user_id")
      .eq("sms_phone_number", fromPhone)
      .maybeSingle();
    if (prefs?.user_id) {
      await admin.from("communication_preferences")
        .update({ sms_enabled: true }).eq("user_id", prefs.user_id);
    }
    return twiml("You are re-subscribed to PaigeAgent SMS. Reply STOP to opt out.");
  }
  if (bodyUpper === "HELP" || bodyUpper === "INFO") {
    return twiml("PaigeAgent support: support@paigeagent.ai. Reply STOP to unsubscribe.");
  }

  // Look up contact by phone
  let contactId: string | null = null;
  const { data: prefs } = await admin
    .from("communication_preferences")
    .select("user_id")
    .eq("sms_phone_number", fromPhone)
    .maybeSingle();
  if (prefs?.user_id) {
    const { data: c } = await admin.from("clients").select("id").eq("linked_user_id", prefs.user_id).maybeSingle();
    contactId = c?.id ?? null;
  }
  if (!contactId) {
    const { data: c } = await admin.from("clients").select("id").eq("phone", fromPhone).maybeSingle();
    contactId = c?.id ?? null;
  }

  const { data: convo, error: insertErr } = await admin
    .from("paige_conversations")
    .insert({
      channel: "sms",
      contact_id: contactId,
      direction: "inbound",
      body: bodyRaw,
      source_message_id: messageSid,
      status: "new",
      metadata: { from: fromPhone, to: params.get("To") ?? null },
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") return twiml(); // already processed
    console.error("[handle-inbound-sms] insert_error", insertErr);
    return twiml();
  }

  fireAndForgetBridge("customer_support_intake", {
    conversation_id: convo.id,
    contact_phone: fromPhone,
    channel: "sms",
    body: bodyRaw,
  });

  // ── Paige Context Rail — COMMS emitter: file 'comms.inbound' when a real client
  // SMS arrives, so the OWNER rail AND the client's OWN live feed both reflect the
  // two-way conversation in real time (§7/§8). comms.inbound is a client_visible
  // kind, so record_rail_event correctly broadcasts it to both the client feed and
  // the owner rail. Telemetry ONLY (§13): the whole emit is wrapped so a rail
  // failure can NEVER affect the Twilio response or the real message handling. We
  // emit AFTER the conversation row was actually inserted (a real inbound), and
  // ONLY when the sender's contact resolved above (contactId) — no contact means we
  // SKIP rather than fabricate one (§13 truthful). We read the contact's tenant to
  // pass p_tenant_id explicitly, because inside record_rail_event this service-role
  // call has auth.uid() = NULL (trusted service path).
  if (contactId) {
    try {
      const { data: contactRow } = await admin
        .from("clients")
        .select("tenant_id")
        .eq("id", contactId)
        .maybeSingle();
      const tenantId = contactRow?.tenant_id ?? null;
      if (tenantId) {
        const preview = bodyRaw.length > 140 ? bodyRaw.slice(0, 137) + "…" : bodyRaw;
        await admin.rpc("record_rail_event", {
          p_contact_id: contactId,
          p_event_kind: "comms.inbound",
          p_surface: "client_portal",
          p_actor_type: "client",
          p_title: "Message received",
          p_summary: preview,
          p_ref_table: "paige_conversations",
          p_ref_id: convo.id,
          p_from_department: "client_experience",
          p_tenant_id: tenantId,
        });
      }
    } catch (e) {
      console.warn("[handle-inbound-sms] comms.inbound rail emit skipped:", (e as Error)?.message);
    }
  }

  return twiml();
});
