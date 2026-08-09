// _shared/operator-twilio.ts — the operator (God/Super-Admin) Twilio credential seam.
//
// The OPERATOR is Paige Agent AI LLC's own Twilio account ("Paige Agent AI LLC"),
// distinct from the platform MASTER creds (TWILIO_*) used to provision tenant
// subaccounts and from any tenant's own subaccount. Operator SMS is sent through the
// operator account's A2P **Messaging Service** (an `MG…` SID — Twilio's A2P
// best-practice sender) so 10DLC campaign registration, sticky sender, and opt-out
// handling are enforced by Twilio — never a bare `From:` number.
//
// SECRET NAMES (owner pastes the VALUES into Supabase; code only references NAMES, §34):
//   TWILIO_OPERATOR_ACCOUNT_SID            AC… — the operator account (URL path).
//   TWILIO_OPERATOR_MESSAGING_SERVICE_SID  MG… — the A2P Messaging Service to send through.
//   TWILIO_OPERATOR_API_KEY_SID            SK… — Basic-auth USERNAME (preferred, best-practice).
//   TWILIO_OPERATOR_API_KEY_SECRET               Basic-auth PASSWORD for the API Key path.
//   TWILIO_OPERATOR_AUTH_TOKEN             (fallback) account Auth Token — Basic-auth password
//                                          when no API Key is set, AND the secret Twilio signs
//                                          inbound webhooks with (X-Twilio-Signature validation).
//
// This EXTENDS the ONE Twilio client (twilio.ts) — it reuses `sendSms` and
// `validateTwilioSignature`; it does NOT fork a second HTTP client or a second
// signature implementation (§18 one home).

import { sendSms, validateTwilioSignature, type TwilioResult } from "./twilio.ts";

/** Resolved operator Twilio credentials from env. Read at CALL time (rotation-safe). */
export interface OperatorTwilioCreds {
  /** AC… — the operator account SID (URL path + legacy Basic-auth username). */
  accountSid: string;
  /** MG… — the A2P Messaging Service SID outbound SMS is sent through. */
  messagingServiceSid: string;
  /** Basic-auth PASSWORD: the API Key Secret (preferred) or the account Auth Token (fallback). */
  authToken: string;
  /** SK… — Basic-auth USERNAME when the API-Key path is used; undefined on the auth-token fallback. */
  apiKeySid?: string;
}

/**
 * Resolve operator Twilio creds from env, or null when not configured (honest degrade,
 * §13 — callers surface `needs_config`, never send with an empty credential). Prefers the
 * API-Key trio; falls back to the account Auth Token per the owner's brief.
 */
export function operatorTwilioCreds(): OperatorTwilioCreds | null {
  const accountSid = Deno.env.get("TWILIO_OPERATOR_ACCOUNT_SID") ?? "";
  const messagingServiceSid = Deno.env.get("TWILIO_OPERATOR_MESSAGING_SERVICE_SID") ?? "";
  if (!accountSid || !messagingServiceSid) return null;

  const apiKeySid = Deno.env.get("TWILIO_OPERATOR_API_KEY_SID") ?? "";
  const apiKeySecret = Deno.env.get("TWILIO_OPERATOR_API_KEY_SECRET") ?? "";
  if (apiKeySid && apiKeySecret) {
    return { accountSid, messagingServiceSid, authToken: apiKeySecret, apiKeySid };
  }
  const authTokenFallback = Deno.env.get("TWILIO_OPERATOR_AUTH_TOKEN") ?? "";
  if (authTokenFallback) {
    return { accountSid, messagingServiceSid, authToken: authTokenFallback };
  }
  return null;
}

/**
 * The Twilio account Auth Token used to VALIDATE an inbound webhook's X-Twilio-Signature.
 * Twilio signs webhooks with the account's Auth Token (NOT an API Key secret), so the
 * inbound handler must read TWILIO_OPERATOR_AUTH_TOKEN specifically. Returns "" when unset —
 * the caller then degrades honestly (rejects, or accepts-unsigned with a loud warning),
 * matching the existing handle-inbound-sms / voice-twiml posture.
 */
export function operatorInboundAuthToken(): string {
  return Deno.env.get("TWILIO_OPERATOR_AUTH_TOKEN") ?? "";
}

/**
 * Send an operator SMS through the operator account's A2P Messaging Service SID. Reuses
 * the ONE authenticated Twilio seam (`sendSms`). `data.sid` is the Twilio message SID.
 * Returns needs_config when operator creds are unset (never a fabricated send, §13).
 */
export async function sendOperatorSms(
  to: string,
  body: string,
  opts: { statusCallback?: string } = {},
): Promise<TwilioResult> {
  const creds = operatorTwilioCreds();
  if (!creds) {
    return { ok: false, status: 0, error: "operator_twilio_not_configured", data: null, needs_config: true };
  }
  return await sendSms(
    creds.accountSid, // URL path addresses the operator account
    creds.authToken,  // API-Key secret (or auth-token fallback) = Basic-auth password
    {
      to,
      body,
      // A2P best-practice: send through the Messaging Service, never a raw From.
      messagingServiceSid: creds.messagingServiceSid,
      // `from` is required by the SendSmsOptions type but IGNORED when messagingServiceSid
      // is set (sendSms prefers MessagingServiceSid). Kept empty to make that explicit.
      from: "",
      statusCallback: opts.statusCallback,
    },
    creds.apiKeySid, // API Key SID as Basic-auth username; undefined → username = accountSid (fallback)
  );
}

/**
 * Validate an inbound Twilio request signature for the OPERATOR account. Thin wrapper over
 * the canonical validateTwilioSignature keyed by the operator Auth Token (§18 one home).
 * Returns false when no auth token is configured OR the signature does not match.
 */
export async function validateOperatorTwilioSignature(
  signature: string | null | undefined,
  url: string,
  rawBody: string,
): Promise<boolean> {
  const token = operatorInboundAuthToken();
  if (!token) return false;
  return await validateTwilioSignature(token, signature, url, rawBody);
}

/** The trust decision for an inbound operator SMS webhook request. */
export interface OperatorInboundGate {
  /** true → persist the message; false → reject and write nothing. */
  accept: boolean;
  /** HTTP status to return when rejected (401); 0 when accepted. */
  status: number;
  /** Human-readable reason (logged; also the 401 response body). */
  reason: string;
}

/**
 * Decide whether an inbound operator SMS webhook request is trusted enough to persist —
 * FAIL CLOSED (§9 spoof/DoS guard). This is the ONE gate the handler AND the smoke both
 * drive, so the smoke reflects the deployed HANDLER's behavior, not just the raw validator
 * (§18 one home, §32). Accept paths are EXACTLY two:
 *   (a) the operator Auth Token is set AND the X-Twilio-Signature validates, or
 *   (b) no token is set AND the explicit dev-only ALLOW_UNSIGNED_OPERATOR_SMS=true flag is on.
 * Every other case — token set but signature invalid/missing, or token unset without the flag
 * — rejects 401 and NOTHING is written. There is NO path where the handler accepts while the
 * validator would reject.
 */
export async function decideOperatorInboundGate(
  signature: string | null | undefined,
  url: string,
  rawBody: string,
): Promise<OperatorInboundGate> {
  const token = operatorInboundAuthToken();
  const allowUnsigned = (Deno.env.get("ALLOW_UNSIGNED_OPERATOR_SMS") ?? "").toLowerCase() === "true";
  if (token) {
    const valid = await validateTwilioSignature(token, signature, url, rawBody);
    return valid
      ? { accept: true, status: 0, reason: "valid_signature" }
      : { accept: false, status: 401, reason: "invalid_signature" };
  }
  if (allowUnsigned) {
    return { accept: true, status: 0, reason: "unsigned_dev_escape_hatch" };
  }
  return { accept: false, status: 401, reason: "signature_validation_unavailable" };
}
