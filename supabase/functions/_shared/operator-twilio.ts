// _shared/operator-twilio.ts — the operator (God/Super-Admin) Twilio credential seam.
//
// The OPERATOR SMS surface is the PLATFORM's OWN outbound identity, so it sends from the
// platform MASTER Twilio account — the SAME account that already powers phone calls and
// the tenant number registry today. It therefore REUSES the existing master creds
// (`masterCreds()` in twilio.ts, §18 one home) — NO new account/auth secret needs to be
// pasted. `TWILIO_OPERATOR_*` remain OPTIONAL overrides: if a full operator trio is set it
// wins; otherwise the master creds are used.
//
// The ONE thing the master config does NOT already cover is an A2P **Messaging Service**
// (an `MG…` SID — Twilio's A2P best-practice sender for 10DLC). The existing platform SMS
// path sends from a raw `From`/`TWILIO_PHONE_NUMBER` (tenant sends resolve their MG SID
// per-tenant from `tenant_a2p_registrations`, not from an env), so there is no master MG
// env to reuse. The operator MG SID is resolved from `TWILIO_OPERATOR_MESSAGING_SERVICE_SID`
// or a generic `TWILIO_MESSAGING_SERVICE_SID` if one exists — and if genuinely absent it is
// the SINGLE owner-owed secret (the operator send degrades to needs_config until it's set,
// never a raw-From A2P violation, §13).
//
// SECRET NAMES (code references NAMES only, §34):
//   Master (ALREADY set — reused, no new paste):
//     TWILIO_ACCOUNT_SID       AC… — master account (URL path).
//     TWILIO_API_KEY_SID       SK… — Basic-auth USERNAME (preferred).
//     TWILIO_API_KEY_SECRET          Basic-auth PASSWORD (preferred).
//     TWILIO_AUTH_TOKEN              account Auth Token — the secret Twilio signs inbound
//                                    webhooks with (X-Twilio-Signature validation) + legacy
//                                    Basic-auth fallback.
//   Operator OVERRIDES (optional — used only if explicitly set):
//     TWILIO_OPERATOR_ACCOUNT_SID / _API_KEY_SID / _API_KEY_SECRET / _AUTH_TOKEN
//   A2P Messaging Service (the single possibly-owed secret):
//     TWILIO_OPERATOR_MESSAGING_SERVICE_SID  MG… (preferred), or generic TWILIO_MESSAGING_SERVICE_SID.
//
// This EXTENDS the ONE Twilio client (twilio.ts) — it reuses `sendSms`,
// `validateTwilioSignature`, and `masterCreds`; it does NOT fork a second HTTP client, a
// second signature implementation, or a second cred resolver (§18 one home).

import { sendSms, validateTwilioSignature, masterCreds, type TwilioResult } from "./twilio.ts";

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
 * Resolve the operator A2P Messaging Service SID: operator override → generic master
 * messaging-service env → "" when neither is set (the single owner-owed secret).
 */
export function operatorMessagingServiceSid(): string {
  return (
    Deno.env.get("TWILIO_OPERATOR_MESSAGING_SERVICE_SID") ??
    Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ??
    ""
  );
}

/**
 * The E.164 caller-ID an OPERATOR outbound VOICE call presents (Phase 3, §9/§53). The operator's own
 * A2P number lives on the platform MASTER account (+1 (470) 200-3444). Resolved from env (NAMES only,
 * §34), in precedence order:
 *   TWILIO_OPERATOR_CALLER_ID (preferred, dedicated) → TWILIO_OPERATOR_PHONE_NUMBER →
 *   generic TWILIO_PHONE_NUMBER (the master account's own number the legacy platform SMS path used).
 * Returns "" when none is set — the caller then honest-degrades (speaks a message, NEVER dials with a
 * bogus/placeholder callerId, §13).
 *
 * HONEST NOTE (§13): operator SMS sends through an `MG…` A2P Messaging Service SID, which CANNOT be a
 * voice caller-id — a `<Dial callerId>` needs a real E.164 number — so the voice caller-id is resolved
 * SEPARATELY here, not from operatorMessagingServiceSid(). If none of the three env names is set, the
 * operator voice caller-id is an OWED secret (the number exists on the master account; it just isn't
 * exposed to the edge runtime yet).
 */
export function operatorVoiceCallerId(): string {
  return (
    Deno.env.get("TWILIO_OPERATOR_CALLER_ID") ??
    Deno.env.get("TWILIO_OPERATOR_PHONE_NUMBER") ??
    Deno.env.get("TWILIO_PHONE_NUMBER") ??
    ""
  );
}

/**
 * Dedicated bearer proof for the operator TwiML Application. It is deliberately independent
 * of the Twilio API-key secret: rotating provider credentials must not invalidate the URL that
 * Twilio has already stored. An explicit independently-rotatable proof may be configured; the
 * service-role secret is the existing stable fallback. Only a purpose-bound HMAC leaves this
 * process, never either source credential itself.
 */
export async function deriveOperatorVoiceWebhookSecret(): Promise<string | null> {
  const creds = masterCreds();
  if (!creds?.accountSid) return null;
  const proofKey = Deno.env.get("TWILIO_OPERATOR_WEBHOOK_SECRET")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
  if (!proofKey) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(proofKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`paige:operator:voice-webhook:v1:${creds.accountSid}`),
  ));
  const encoded = btoa(String.fromCharCode(...signed))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `ov1_${encoded}`;
}

/**
 * Resolve operator Twilio creds from env, or null when not configured (honest degrade,
 * §13 — callers surface `needs_config`, never send with an empty credential).
 *
 * REUSE-FIRST (§30, owner correction 2026-08-09): account+auth come from the platform
 * MASTER creds by default (already set — powers phone calls / number registry today), so
 * ZERO new account/auth pastes are needed. `TWILIO_OPERATOR_*` override ONLY when a full
 * operator trio (or account+auth-token) is explicitly set. The one piece the master config
 * doesn't cover is the A2P Messaging Service SID — without it we return null (needs_config),
 * never a raw-From A2P violation.
 */
export function operatorTwilioCreds(): OperatorTwilioCreds | null {
  // A2P Messaging Service SID is REQUIRED (A2P best-practice: never a bare From).
  const messagingServiceSid = operatorMessagingServiceSid();
  if (!messagingServiceSid) return null;

  // Explicit operator OVERRIDE — API-Key trio wins, then account+auth-token.
  const opAccountSid = Deno.env.get("TWILIO_OPERATOR_ACCOUNT_SID") ?? "";
  const opApiKeySid = Deno.env.get("TWILIO_OPERATOR_API_KEY_SID") ?? "";
  const opApiKeySecret = Deno.env.get("TWILIO_OPERATOR_API_KEY_SECRET") ?? "";
  if (opAccountSid && opApiKeySid && opApiKeySecret) {
    return { accountSid: opAccountSid, messagingServiceSid, authToken: opApiKeySecret, apiKeySid: opApiKeySid };
  }
  const opAuthToken = Deno.env.get("TWILIO_OPERATOR_AUTH_TOKEN") ?? "";
  if (opAccountSid && opAuthToken) {
    return { accountSid: opAccountSid, messagingServiceSid, authToken: opAuthToken };
  }

  // DEFAULT: reuse the platform MASTER account/auth (no new paste). masterCreds() prefers
  // the API-Key trio (TWILIO_API_KEY_SID/SECRET) and falls back to TWILIO_AUTH_TOKEN.
  const master = masterCreds();
  if (!master) return null;
  return {
    accountSid: master.accountSid,
    messagingServiceSid,
    authToken: master.authToken,
    apiKeySid: master.apiKeySid,
  };
}

/**
 * The Twilio account Auth Token used to VALIDATE an inbound webhook's X-Twilio-Signature.
 * Twilio signs webhooks with the ACCOUNT Auth Token — and because the operator number lives
 * on the MASTER account, the master `TWILIO_AUTH_TOKEN` (already set; the same one
 * handle-inbound-sms uses) validates operator inbound with NO new paste. A
 * `TWILIO_OPERATOR_AUTH_TOKEN` override wins if explicitly set. Returns "" only when BOTH
 * are unset — the caller then fails closed.
 */
export function operatorInboundAuthToken(): string {
  return (
    Deno.env.get("TWILIO_OPERATOR_AUTH_TOKEN") ??
    Deno.env.get("TWILIO_AUTH_TOKEN") ??
    ""
  );
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
    // Precise §13 reason: with master creds already set, the only realistic gap is the A2P
    // Messaging Service SID (the single owner-owed secret). Name it so the owner knows the
    // ONE thing to paste — not a blanket 5-secret request.
    const error = !operatorMessagingServiceSid()
      ? "operator_messaging_service_not_configured" // owner-owed: A2P Messaging Service SID (MG…)
      : "operator_twilio_not_configured";
    return { ok: false, status: 0, error, data: null, needs_config: true };
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
