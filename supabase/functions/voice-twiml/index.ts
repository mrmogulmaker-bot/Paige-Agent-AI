// #140 Slice A3 — the voice-twiml webhook. This is the URL the per-tenant TwiML
// Application's VoiceUrl already targets (see _shared/twilio.ts defaultVoiceTwimlUrl):
// ${SUPABASE_URL}/functions/v1/voice-twiml. Twilio POSTs application/x-www-form-urlencoded
// here on BOTH directions and we answer with TwiML:
//   • OUTBOUND — a browser Device did device.connect({params:{To}}). Twilio hits this with
//     From="client:<tenantId>.<userId>" (the AUTHENTICATED identity from the access-token
//     grant) + To=<dialed PSTN number>. We resolve the tenant FROM the identity, look up
//     that tenant's OWNED caller-ID number, and <Dial><Number> the callee presenting it.
//   • INBOUND — the tenant's Twilio number rang. Twilio hits this with To=<tenant number>
//     + From=<external caller>. We resolve the tenant that OWNS the To number, then
//     <Dial><Client> the tenant's registered browser seat(s).
//
// DOCTRINE
//  §9  Tenant isolation on BOTH directions, from a NON-forgeable field, never a trusted body:
//        - outbound tenant = the authenticated `client:` identity Twilio derived from the JWT
//          grant (the browser cannot forge another tenant's identity — the token is scoped);
//        - inbound tenant  = the OWNER of the dialed To number (tenant_phone_numbers), so a
//          caller is only ever bridged to seats of the tenant whose number they dialed. A
//          caller can NEVER reach another tenant's client.
//  §13 Honest degrade — no owned caller-ID / unknown number / no seat available speaks a plain
//      message and hangs up. Never a dial with a bogus callerId, never a silent 500, never a
//      fabricated bridge.
//  §18 verify_jwt=false (Twilio can't present a Supabase JWT). Reuses the ONE Twilio seam's
//      canonical validateTwilioSignature (no fourth inline copy) + the ONE phone normalizer.
//  §32 The request-shaping logic (direction, identity parse, TwiML) is PURE + unit-smoked
//      (./twiml.ts + scripts/voice-twiml-smoke.mts). Every degrade path LOGS loudly.
//  §3  Every spoken <Say> is plain and jargon-free (copy lives in ./twiml.ts).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateTwilioSignature } from "../_shared/twilio.ts";
import { normalizePhone } from "../_shared/pre-send-pipeline.ts";
import { mintStreamToken } from "../_shared/voice-stream-token.ts";
import {
  buildIdentity,
  buildInboundTwiml,
  buildOutboundTwiml,
  buildSayHangupTwiml,
  buildStreamStart,
  classifyDirection,
  parseClientCaller,
  CALL_UNAVAILABLE_MESSAGE,
  NO_CALLER_ID_MESSAGE,
  OUTBOUND_NO_NUMBER_MESSAGE,
  UNKNOWN_NUMBER_MESSAGE,
  VOICEMAIL_UNAVAILABLE_MESSAGE,
} from "./twiml.ts";

/**
 * #140 B1 — GATED live-call co-pilot fork. Returns the <Start><Stream> XML that forks call audio
 * to paige-stt, or "" (DEFAULT OFF) so the TwiML is byte-identical to A3 until co-pilot is
 * activated. Emits the stream ONLY when BOTH VOICE_STT_STREAM_URL (the paige-stt wss URL) AND
 * VOICE_STREAM_SECRET are set — never an UNauthenticated stream: if the URL is set but the secret
 * is missing we skip the fork and log loudly (§13) rather than expose an open media endpoint.
 * The token encodes { tenantId, callSid } and is HMAC-signed; paige-stt derives the tenant from
 * it (§9), never from a raw parameter. tenantId here is the SAME non-forgeable value already
 * resolved for the bridge (outbound = authenticated client identity, inbound = number owner).
 */
async function buildCoPilotStreamXml(
  admin: Admin,
  tenantId: string,
  callSid: string,
  counterpartyPhone: string,
): Promise<string> {
  const streamUrl = Deno.env.get("VOICE_STT_STREAM_URL") ?? "";
  if (!streamUrl) return ""; // co-pilot not activated — default OFF, changes nothing
  const secret = Deno.env.get("VOICE_STREAM_SECRET") ?? "";
  if (!secret) {
    console.warn("[voice-twiml] VOICE_STT_STREAM_URL set but VOICE_STREAM_SECRET missing — NOT forking an unauthenticated stream");
    return "";
  }
  if (!tenantId || !callSid) {
    console.warn("[voice-twiml] co-pilot fork skipped — missing tenantId/callSid", { hasTenant: !!tenantId, hasCall: !!callSid });
    return "";
  }
  try {
    // §9/§13 — resolve the call's CLIENT counterparty phone → a TENANT-SCOPED contact id so the
    // co-pilot can link commitments/at-risk flags to the client AND the auto-drafted follow-up can
    // resolve a recipient. No match ⇒ null (honest degrade — we NEVER invent/auto-create a contact
    // here; the copilot no-ops contact-linking when null). Gated behind the stream checks above so a
    // contact lookup only runs when the co-pilot fork is actually being minted.
    const contactId = await resolveContactByPhone(admin, tenantId, counterpartyPhone);
    const token = await mintStreamToken({ secret, tenantId, callSid, contactId });
    // tenantId/callSid are ALSO stamped for logging/debug, but paige-stt trusts ONLY the token (the
    // contactId rides INSIDE the signed token, never as a forgeable <Parameter>).
    return buildStreamStart(streamUrl, { streamToken: token, tenantId, callSid });
  } catch (e) {
    console.error("[voice-twiml] co-pilot token mint failed — bridging without stream", (e as Error)?.message);
    return "";
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

/** Answer Twilio with a TwiML document (always 200 so Twilio plays it, not a retry). */
function twiml(xml: string): Response {
  return new Response(xml, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/xml" } });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * §9 — the tenant's OWN caller-ID number for an OUTBOUND call. Scoped to the tenant we
 * resolved from the authenticated identity; prefers the primary number, then any active
 * one. Returns the E.164 string, or null when the tenant owns no active number (→ honest
 * "not set up" spoken message, never a dial with a bogus callerId, §13).
 */
async function resolveTenantCallerId(admin: Admin, tenantId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("tenant_phone_numbers")
    .select("phone_number, is_primary")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[voice-twiml] caller-id lookup failed:", error.code, error.message);
    return null;
  }
  return (data?.phone_number as string | undefined) ?? null;
}

/**
 * §9/§13 — resolve the call's CLIENT counterparty phone → a TENANT-SCOPED contact id. The tenant is
 * the SAME non-forgeable value already resolved for the bridge (outbound = authenticated identity,
 * inbound = number owner); the contact is only ever looked up WITHIN that tenant, so a call can never
 * link to another tenant's client. Matches the stored phone in both the raw (Twilio-E.164) and
 * normalized forms (defensive against stored-format drift) — the SAME pattern the inbound-SMS reader
 * uses (§18 one lookup). Returns null when no contact matches — we NEVER invent/auto-create a contact
 * here; a null contact is an honest degrade the copilot handles (it files the action contactless).
 */
async function resolveContactByPhone(admin: Admin, tenantId: string, phone: string): Promise<string | null> {
  if (!phone || !tenantId) return null;
  const norm = normalizePhone(phone);
  const { data, error } = await admin
    .from("clients")
    .select("id")
    .eq("tenant_id", tenantId)
    .or(`phone.eq.${phone},phone.eq.${norm}`)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[voice-twiml] tenant-scoped contact lookup failed — proceeding contactless:", error.code, error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * §9 — resolve the tenant that OWNS the dialed (To) number for an INBOUND call. The To
 * number is the ONLY key; the tenant is derived from it, never trusted from any body field.
 * Returns the tenant_id, or null when no tenant owns it (e.g. the +1 470 platform number,
 * which has no tenant) → honest "can't take calls" message rather than a wrong-tenant bridge.
 */
async function resolveOwningTenant(admin: Admin, toNumber: string): Promise<string | null> {
  if (!toNumber) return null;
  const norm = normalizePhone(toNumber);
  const { data, error } = await admin
    .from("tenant_phone_numbers")
    .select("tenant_id")
    .eq("phone_number", norm)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.error("[voice-twiml] owning-tenant lookup failed:", error.code, error.message);
    return null;
  }
  return (data?.tenant_id as string | undefined) ?? null;
}

/**
 * §9 — the browser-seat identities to ring for an INBOUND call: the tenant's active
 * owner/admin/coach members, each as `${tenantId}.${userId}` (the A1 identity format).
 * Scoped to the ONE resolved tenant — never another tenant's members. Empty array when
 * the tenant has no reachable seat (→ honest voicemail-ish message).
 */
async function resolveTenantSeatIdentities(admin: Admin, tenantId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("tenant_members")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "coach"]);
  if (error) {
    console.error("[voice-twiml] seat lookup failed:", error.code, error.message);
    return [];
  }
  const ids = (data ?? [])
    .map((r: { user_id?: string | null }) => r.user_id)
    .filter((u: string | null | undefined): u is string => typeof u === "string" && u.length > 0)
    .map((userId: string) => buildIdentity(tenantId, userId));
  // De-dupe defensively (a member could hold two of the three roles across rows).
  return [...new Set(ids)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const rawBody = await req.text();

  // ── §32 signature validation. Twilio signs with the Auth Token of the account that owns
  //    the resource. We validate against TWILIO_AUTH_TOKEN when present (mirrors the three
  //    SMS/DLR webhooks exactly, via the ONE shared helper). HONEST CAVEAT (§13): prod runs
  //    the API-Key credential model where the master TWILIO_AUTH_TOKEN is intentionally
  //    ABSENT and per-subaccount Auth Tokens are not retained, so cryptographic validation
  //    of a subaccount-scoped voice webhook is not yet possible; we degrade the SAME way the
  //    SMS siblings already do (warn loudly + accept) rather than reject every legitimate
  //    call. Per-subaccount signature validation is the tracked follow-up. When the token IS
  //    set (single-account/dev, or once subaccount tokens are wired) a bad signature is a
  //    hard 403 — never a silent accept.
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (authToken) {
    const sig = req.headers.get("x-twilio-signature");
    const ok = await validateTwilioSignature(authToken, sig, req.url, rawBody);
    if (!ok) {
      console.error("[voice-twiml] REJECTED: invalid x-twilio-signature", { hasSig: !!sig, url: req.url });
      return new Response("invalid_signature", { status: 403 });
    }
  } else {
    console.warn("[voice-twiml] TWILIO_AUTH_TOKEN not set — accepting unsigned (see §13 caveat in header)");
  }

  const params = new URLSearchParams(rawBody);
  const from = params.get("From") ?? "";
  const to = params.get("To") ?? "";
  const callSid = params.get("CallSid") ?? ""; // #140 B1 — binds the co-pilot stream token to this call
  const direction = classifyDirection(from);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (direction === "outbound") {
      // §9: tenant is the AUTHENTICATED client identity Twilio populated From with.
      const caller = parseClientCaller(from);
      if (!caller) {
        console.error("[voice-twiml] outbound: unparseable client identity", { from });
        return twiml(buildSayHangupTwiml(OUTBOUND_NO_NUMBER_MESSAGE));
      }
      if (!to) {
        console.error("[voice-twiml] outbound: missing To (dialed number)", { tenantId: caller.tenantId });
        return twiml(buildSayHangupTwiml(OUTBOUND_NO_NUMBER_MESSAGE));
      }
      const callerId = await resolveTenantCallerId(admin, caller.tenantId);
      if (!callerId) {
        // §13: no owned number → speak the honest "not set up" message; NEVER dial with a
        // bogus/placeholder callerId (Twilio would reject or spoof).
        console.warn("[voice-twiml] outbound: tenant owns no active number — honest degrade", {
          tenantId: caller.tenantId,
        });
        return twiml(buildSayHangupTwiml(NO_CALLER_ID_MESSAGE));
      }
      // #140 B1: GATED co-pilot fork (default OFF) — non-blocking, before the <Dial> bridge.
      // OUTBOUND: the CLIENT counterparty is the dialed number (To) — resolve it to a contact (§9/§13).
      const streamXml = await buildCoPilotStreamXml(admin, caller.tenantId, callSid, to);
      console.log("[voice-twiml] outbound bridge", { tenantId: caller.tenantId, coPilot: streamXml.length > 0 });
      return twiml(buildOutboundTwiml(callerId, to, streamXml));
    }

    // ── INBOUND ──────────────────────────────────────────────────────────────────
    // §9: the tenant is the OWNER of the dialed number — derived from To, never a body.
    const tenantId = await resolveOwningTenant(admin, to);
    if (!tenantId) {
      console.warn("[voice-twiml] inbound: To number owned by no active tenant — honest degrade", { to });
      return twiml(buildSayHangupTwiml(UNKNOWN_NUMBER_MESSAGE));
    }
    const identities = await resolveTenantSeatIdentities(admin, tenantId);
    if (identities.length === 0) {
      // A3 keeps voicemail minimal: speak an honest "no one available" message and hang up.
      // Real voicemail capture (<Record>/transcription) is a tracked follow-up.
      console.warn("[voice-twiml] inbound: tenant has no reachable seat — voicemail message", { tenantId });
      return twiml(buildSayHangupTwiml(VOICEMAIL_UNAVAILABLE_MESSAGE));
    }
    // #140 B1: GATED co-pilot fork (default OFF) — non-blocking, before the <Dial> ring.
    // INBOUND: the CLIENT counterparty is the external caller (From) — resolve it to a contact (§9/§13).
    const streamXml = await buildCoPilotStreamXml(admin, tenantId, callSid, from);
    console.log("[voice-twiml] inbound ring", { tenantId, seats: identities.length, coPilot: streamXml.length > 0 });
    return twiml(buildInboundTwiml(identities, streamXml));
  } catch (e) {
    // §32: never a silent 500 — a runtime fault still answers with a spoken, graceful hangup
    // so the caller/browser hears something, and we log the real cause loudly.
    console.error("[voice-twiml] unhandled error — degrading to spoken hangup:", (e as Error)?.message, (e as Error)?.stack);
    return twiml(buildSayHangupTwiml(CALL_UNAVAILABLE_MESSAGE));
  }
});
