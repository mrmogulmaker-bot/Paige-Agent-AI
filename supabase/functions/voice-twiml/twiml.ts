// #140 Slice A3 — PURE TwiML builders + identity/direction parsing for voice-twiml.
//
// WHY A SEPARATE MODULE (§32): the voice-twiml webhook cannot be driven headless by a
// real inbound/outbound PSTN call, so its request-shaping logic is factored OUT of the
// Deno.serve handler into these PURE, side-effect-free functions. A Node smoke
// (scripts/voice-twiml-smoke.mts) imports them directly and asserts the exact XML for
// representative outbound / inbound / no-number / bad-identity inputs — catching a
// "compiles but emits wrong/broken TwiML" defect before it ships, not on a live call.
//
// DOCTRINE
//  §9  Direction + tenant scoping is decided from Twilio-populated, non-forgeable fields
//      (the outbound From is the AUTHENTICATED `client:<identity>` Twilio derived from the
//      access-token grant; the inbound To is the dialed number). These builders only shape
//      XML — the resolver (index.ts) enforces that a caller is only ever bridged to the
//      tenant that owns the number. No trusted-body tenant anywhere.
//  §3  Every <Say> is plain, human, jargon-free — no backend/table names, no "AI-powered".
//  §13 The "not set up" / "no one available" paths speak an honest message and hang up —
//      never dial a bogus callerId, never silently drop.

/** XML-escape a value interpolated into TwiML (callerId, dialed number, identity, message). */
export function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Direction of a Twilio Voice webhook hit. OUTBOUND = a browser Device placed a call
 * (Twilio sets From to the authenticated `client:<identity>`). INBOUND = an external
 * caller dialed the tenant's Twilio number (From is a PSTN number, not a client).
 */
export type VoiceDirection = "outbound" | "inbound";

/** Twilio prefixes an authenticated browser-client caller as `client:<identity>`. */
const CLIENT_PREFIX = "client:";

/** Classify the webhook by the From field. `client:` ⇒ outbound-from-browser; else inbound. */
export function classifyDirection(from: string | null | undefined): VoiceDirection {
  return (from ?? "").startsWith(CLIENT_PREFIX) ? "outbound" : "inbound";
}

export interface ParsedIdentity {
  tenantId: string;
  userId: string;
}

/**
 * Parse the A1 identity format `${tenantId}.${userId}` (both UUIDs; UUIDs contain no
 * dots, so the FIRST dot is the unambiguous separator). Returns null when the shape is
 * not two non-empty parts — the caller then degrades honestly (§13) rather than dialing.
 */
export function parseIdentity(identity: string | null | undefined): ParsedIdentity | null {
  const id = (identity ?? "").trim();
  const dot = id.indexOf(".");
  if (dot <= 0 || dot >= id.length - 1) return null;
  const tenantId = id.slice(0, dot);
  const userId = id.slice(dot + 1);
  if (!tenantId || !userId) return null;
  return { tenantId, userId };
}

/**
 * Parse the authenticated outbound caller `client:<tenantId>.<userId>` → identity parts.
 * Strips the `client:` scheme, then reuses parseIdentity. Returns null on any malformed
 * value so index.ts can speak an honest error instead of dialing with a guessed tenant.
 */
export function parseClientCaller(from: string | null | undefined): ParsedIdentity | null {
  const f = (from ?? "").trim();
  if (!f.startsWith(CLIENT_PREFIX)) return null;
  return parseIdentity(f.slice(CLIENT_PREFIX.length));
}

/** Build the identity string `${tenantId}.${userId}` (A1 format) for a <Client> dial. */
export function buildIdentity(tenantId: string, userId: string): string {
  return `${tenantId}.${userId}`;
}

/**
 * OUTBOUND: bridge the browser caller to the dialed PSTN number, presenting the tenant's
 * OWN caller-ID. Both values are XML-escaped. answerOnBridge keeps the caller hearing
 * ringing (not silence) until the callee answers.
 */
export function buildOutboundTwiml(callerId: string, to: string): string {
  return (
    `${XML_PROLOG}<Response>` +
    `<Dial answerOnBridge="true" callerId="${escapeXml(callerId)}">` +
    `<Number>${escapeXml(to)}</Number>` +
    `</Dial></Response>`
  );
}

/**
 * INBOUND: ring the tenant's registered browser seat(s). Multiple <Client> entries in ONE
 * <Dial> ring simultaneously; the first to answer wins and Twilio cancels the rest. The
 * caller (index.ts) passes ONLY identities belonging to the tenant that owns the dialed
 * number (§9) — this builder never sees another tenant's identity. Empty list is a caller
 * bug; guard by returning the honest voicemail message instead.
 */
export function buildInboundTwiml(identities: string[]): string {
  const clients = identities.filter((i) => i && i.length > 0);
  if (clients.length === 0) {
    return buildSayHangupTwiml(VOICEMAIL_UNAVAILABLE_MESSAGE);
  }
  const inner = clients.map((id) => `<Client>${escapeXml(id)}</Client>`).join("");
  return (
    `${XML_PROLOG}<Response>` +
    `<Dial answerOnBridge="true">${inner}</Dial>` +
    `</Response>`
  );
}

/**
 * Speak a short message, then hang up. Used for every honest-degrade path (§13/§32): no
 * owned caller-ID, unknown/unowned number, no seat available, malformed identity, or a
 * signature we could not verify. NOTE: this is <Say>+<Hangup>, NOT <Say>+<Reject> — Twilio
 * ignores any verb placed AFTER <Reject>, so a <Say> before a <Reject> would never be heard;
 * <Say>+<Hangup> actually delivers the words then ends the call (the honest behavior).
 */
export function buildSayHangupTwiml(message: string): string {
  return (
    `${XML_PROLOG}<Response>` +
    `<Say>${escapeXml(message)}</Say>` +
    `<Hangup/>` +
    `</Response>`
  );
}

// §3 — plain, human, jargon-free spoken copy. No product/table names, no "AI".
export const NO_CALLER_ID_MESSAGE =
  "Calling isn't set up for this practice yet. Please add a phone number before making calls.";
export const OUTBOUND_NO_NUMBER_MESSAGE =
  "Sorry, we couldn't place this call. Please try again.";
export const VOICEMAIL_UNAVAILABLE_MESSAGE =
  "Thanks for calling. No one is available to take your call right now. Please try again later.";
export const UNKNOWN_NUMBER_MESSAGE =
  "Sorry, this number isn't able to take calls right now.";
export const CALL_UNAVAILABLE_MESSAGE =
  "We're unable to connect your call right now. Please try again.";
