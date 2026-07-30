// _shared/voice-stream-token.ts — the SHORT-lived, HMAC-signed stream token that binds a
// Twilio <Stream> media fork to the tenant + call it was minted for (#140 B1). This is the
// §9 gate for the paige-stt media-stream endpoint.
//
// WHY A TOKEN (§9/§13): a Twilio Media Stream connects to paige-stt as a raw WebSocket and
// hands us a "start" frame whose customParameters are attacker-influenceable in principle
// (anyone who can reach the wss URL can send any JSON). So paige-stt MUST NOT trust a raw
// tenantId in the body. Instead voice-twiml — which ALREADY resolved the tenant non-forgeably
// (outbound = authenticated client identity, inbound = OWNER of the dialed number) — MINTS a
// token that ENCODES { tenantId, callSid } and HMAC-signs it with VOICE_STREAM_SECRET (a
// server-only secret). paige-stt VERIFIES the signature + expiry and derives the tenant FROM
// the verified payload, never from a separate raw parameter. A missing/tampered/expired token
// ⇒ the socket is closed and Deepgram is never opened. The token also carries the callSid so
// paige-stt can cross-check it against Twilio's own start-frame callSid (defense in depth).
//
// FORMAT (compact, self-contained — no DB round-trip on the hot path):
//   v1.<b64url(payloadJson)>.<b64url(HMAC_SHA256(secret, "v1." + b64url(payloadJson)))>
//   payload = { t: tenantId, c: callSid, iat: <unix s>, exp: <unix s> }
//
// PURE + TESTABLE (§32): mint/verify are deterministic functions of (secret, payload/token).
// A Node smoke (scripts/voice-stt-smoke.mts) mints with a known secret and asserts verify
// accepts it and REJECTS a tampered signature, a wrong secret, an expired token, and a
// call-SID mismatch — the §9 gate, exercised headless. Uses only Web Crypto + btoa/atob,
// which exist in BOTH Deno and Node 20+, so the smoke needs no Deno global for this module.
//
// SECURITY (§13): the secret is used ONLY as the HMAC key — never logged, echoed, or returned.

/** SHORT-lived by default — a leaked token must expire fast (§9). The stream starts within
 *  seconds of the call bridging and the token is checked exactly ONCE, at stream-start, so the
 *  default only needs to cover the ring→bridge→stream-start window. 300s is generous for that
 *  and keeps the replay window tight; a long CALL is unaffected (the token isn't re-checked
 *  mid-call). The callSid binding already prevents reuse across different calls. */
export const STREAM_TOKEN_DEFAULT_TTL_SECONDS = 300; // 5 min — covers ring→bridge→stream-start
export const STREAM_TOKEN_MIN_TTL_SECONDS = 60;
export const STREAM_TOKEN_MAX_TTL_SECONDS = 21600; // 6h hard cap — a body value can only shorten within this

const TOKEN_VERSION = "v1";

interface StreamTokenPayload {
  /** tenant_id — the ONLY authority for §9 tenant scoping downstream. */
  t: string;
  /** Twilio CallSid this token is bound to (cross-checked against the start frame). */
  c: string;
  iat: number;
  exp: number;
}

/** base64url (no padding) of a UTF-8 string or raw bytes. */
function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a base64url string back to UTF-8 text. Returns null on malformed input. */
function b64urlDecodeToString(s: string): string | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/** Constant-time-ish compare of two base64url digests (length-then-xor; the secret is the HMAC
 *  key, never revealed by comparing two public digests — mirrors validateTwilioSignature). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Clamp a requested TTL into [MIN, MAX], defaulting when unset/invalid. */
export function clampStreamTtl(requested?: number): number {
  const n = typeof requested === "number" && Number.isFinite(requested)
    ? Math.floor(requested)
    : STREAM_TOKEN_DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(n, STREAM_TOKEN_MIN_TTL_SECONDS), STREAM_TOKEN_MAX_TTL_SECONDS);
}

export interface MintStreamTokenInput {
  secret: string;
  tenantId: string;
  callSid: string;
  ttlSeconds?: number;
  /** Injectable clock for deterministic tests; defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Mint a signed stream token for (tenantId, callSid). Throws on a blank secret/tenant/call —
 * a caller that reached here without those has a bug, and we must NEVER mint an unbound token
 * (that would defeat the §9 gate). Returns the compact `v1.<payload>.<sig>` string.
 */
export async function mintStreamToken(input: MintStreamTokenInput): Promise<string> {
  const { secret, tenantId, callSid } = input;
  if (!secret) throw new Error("stream_token_secret_required");
  if (!tenantId) throw new Error("stream_token_tenant_required");
  if (!callSid) throw new Error("stream_token_call_required");
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const payload: StreamTokenPayload = {
    t: tenantId,
    c: callSid,
    iat: nowSec,
    exp: nowSec + clampStreamTtl(input.ttlSeconds),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${TOKEN_VERSION}.${payloadB64}`;
  const sig = b64url(await hmacSha256(secret, signingInput));
  return `${signingInput}.${sig}`;
}

export type VerifyStreamTokenResult =
  | { ok: true; tenantId: string; callSid: string; expiresAt: number }
  | { ok: false; reason: string };

export interface VerifyStreamTokenOpts {
  /** When set, the token's bound callSid MUST equal this (Twilio's start-frame CallSid). */
  expectedCallSid?: string;
  nowMs?: number;
}

/**
 * Verify a stream token against the secret. Returns the tenant + call it is bound to, or a
 * typed failure reason (never throws for a bad token — a bad token is expected input, not an
 * exception). Rejects: wrong shape/version, bad signature, wrong secret, expired, and (when
 * expectedCallSid is supplied) a call-SID mismatch. This is the §9 gate paige-stt runs before
 * it opens Deepgram or derives ANY tenant scope.
 */
export async function verifyStreamToken(
  secret: string,
  token: string | null | undefined,
  opts: VerifyStreamTokenOpts = {},
): Promise<VerifyStreamTokenResult> {
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!token) return { ok: false, reason: "no_token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, payloadB64, sig] = parts;
  if (version !== TOKEN_VERSION) return { ok: false, reason: "bad_version" };

  const signingInput = `${version}.${payloadB64}`;
  const expectedSig = b64url(await hmacSha256(secret, signingInput));
  if (!safeEqual(expectedSig, sig)) return { ok: false, reason: "bad_signature" };

  const json = b64urlDecodeToString(payloadB64);
  if (!json) return { ok: false, reason: "bad_payload" };
  let payload: StreamTokenPayload;
  try {
    payload = JSON.parse(json) as StreamTokenPayload;
  } catch {
    return { ok: false, reason: "bad_payload_json" };
  }
  if (!payload.t || !payload.c || typeof payload.exp !== "number") {
    return { ok: false, reason: "incomplete_payload" };
  }

  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (payload.exp <= nowSec) return { ok: false, reason: "expired" };

  if (opts.expectedCallSid && opts.expectedCallSid !== payload.c) {
    return { ok: false, reason: "call_sid_mismatch" };
  }

  return { ok: true, tenantId: payload.t, callSid: payload.c, expiresAt: payload.exp };
}
