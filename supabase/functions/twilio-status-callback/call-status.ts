// #168 — PURE Twilio CallStatus mapping for the VOICE branch of twilio-status-callback.
//
// WHY A SEPARATE MODULE (§32): a live call can't be driven in CI, so the call-status request-shaping
// logic (status map, SID matching, duration parse) is factored OUT of the Deno.serve handler into these
// PURE, side-effect-free functions. scripts/voice-conversations-smoke.mjs imports them directly and
// asserts the mapping — catching a "compiles but maps the wrong status / drops the duration" defect
// before it ships, not on a live call. No Deno/network imports here, so it loads cleanly under Node.

/**
 * Twilio CallStatus → messages.status enum (draft/queued/sent/delivered/failed/received/read).
 * A connected-and-ended call is 'delivered'; every unsuccessful terminal (busy/no-answer/failed/
 * canceled) is 'failed'; intermediates stay 'queued'. NOTE (§13): 'initiated' is NOT a valid
 * messages.status value — the voice row starts life as 'queued' (see voice-twiml), and this map
 * advances it. Anything unmapped ⇒ null (the caller acks 200 and does not guess).
 */
export const CALL_STATUS_MAP: Record<string, string> = {
  queued: "queued",
  initiated: "queued",
  ringing: "queued",
  "in-progress": "queued",
  answered: "queued",
  completed: "delivered",
  busy: "failed",
  "no-answer": "failed",
  failed: "failed",
  canceled: "failed",
};

export function mapCallStatus(callStatus: string | null | undefined): string | null {
  return CALL_STATUS_MAP[String(callStatus ?? "").trim().toLowerCase()] ?? null;
}

/**
 * The provider_message_id(s) a call-status callback could match. The voice row stored the PARENT call
 * SID (voice-twiml used params.CallSid). A <Number>/<Client> child-leg statusCallback posts the CHILD
 * CallSid PLUS ParentCallSid = that parent SID. Try both (parent first) so matching works whether the
 * callback is child-leg (has ParentCallSid) or a future parent-level callback (CallSid == our stored
 * SID). De-duped; empties dropped so a missing field never produces an over-broad `in ('')` filter.
 */
export function callMatchSids(
  callSid: string | null | undefined,
  parentCallSid: string | null | undefined,
): string[] {
  return [...new Set(
    [parentCallSid, callSid].map((s) => String(s ?? "").trim()).filter((s) => s.length > 0),
  )];
}

/** Parse Twilio CallDuration (whole seconds, as a string) → a non-negative integer, or null if absent/invalid. */
export function parseCallDuration(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
