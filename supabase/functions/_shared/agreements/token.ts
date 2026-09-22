// _shared/agreements/token.ts — the signer's access token (INT-163).
//
// THE WHOLE SECURITY MODEL OF THE PUBLIC SIGNING ENDPOINT IS THIS FILE. That endpoint runs with
// `verify_jwt = false` because the person signing has no account on this platform and never will,
// so there is no session to check. The token IS the authorization, which means its properties are
// not conveniences — each one is load-bearing:
//
//   · 32 random bytes (256 bits) from crypto.getRandomValues. Guessing is not a threat model at
//     this width; the rate limits on the endpoint exist for cost and abuse, not for brute force.
//   · Stored ONLY as its SHA-256. The plaintext leaves this process once, inside the email to the
//     signer, and is never written to a row, a log line, a tool result or an error message. A
//     dumped database therefore yields no working signing link.
//   · Bound to exactly ONE signer on ONE agreement by the row it hashes to. Tenant, agreement and
//     signer are read FROM THAT ROW — never from anything the caller sent. This is the precise
//     inverse of the docusign-send-envelope defect, where a body-supplied contact_id is resolved
//     with the service-role client and no tenant filter.
//   · Expiring and revocable, checked at USE. A sweeper that flips rows to Expired is bookkeeping;
//     if the only thing stopping an expired token were a scheduled job, then the day the job stops
//     running is the day expired links start working again (§68's anchoring case, exactly).
//
// The shape is the one `email_unsubscribe_tokens` already proves in production: mint 32 bytes, hand
// out the hex, store sha256Hex of it, look up by hash. No second token scheme (§18).

/** SHA-256 as lowercase hex. The one hashing helper for this engine — tokens and documents both. */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  // `crypto.subtle.digest` wants a BufferSource, whose TS definition is pinned to ArrayBuffer-backed
  // views; a Uint8Array handed back by a PDF library is typed over the wider ArrayBufferLike. Taking
  // a fresh view over the SAME memory satisfies the signature without copying the document.
  const source = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 256 bits of CSPRNG entropy as hex. Returned once, to be emailed and then forgotten. */
export function mintSignerToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Default signing window. The brief's thirty days, in one place so it is not retyped per caller. */
export const SIGNING_TOKEN_TTL_DAYS = 30;

/**
 * How long a signer may still fetch their completed copy after signing.
 *
 * WHY THIS IS SEPARATE FROM THE SIGNING WINDOW. ESIGN requires the retained record to stay
 * available to BOTH parties, and the counterparty has no account to log into. Our transactional
 * sender cannot carry attachments — verified, not assumed: `send-transactional-email` builds
 * {from,to,subject,html,text} and never passes an `attachments` key, and widening that shared
 * contract would drag a §37 producer inventory across every template caller. So the completion
 * email carries a LINK, and this window is how long that link keeps working. It is deliberately far
 * longer than the signing window and deliberately still finite: an eternal bearer URL to a signed
 * contract is its own problem.
 */
export const RETRIEVAL_TOKEN_TTL_DAYS = 365;

export type TokenState =
  | { usable: true }
  | { usable: false; reason: "unknown" | "revoked" | "expired" };

/**
 * Is this token live RIGHT NOW? Called on every use, before anything is read or written.
 *
 * Deliberately returns a coarse reason. The endpoint collapses `unknown` and `revoked` into one
 * response so a caller cannot tell a token that never existed from one that was withdrawn — that
 * difference is only useful to someone probing.
 */
export function tokenState(
  row: { token_hash: string | null; token_expires_at: string | null; token_revoked_at: string | null } | null,
  now: Date,
): TokenState {
  if (!row || !row.token_hash) return { usable: false, reason: "unknown" };
  if (row.token_revoked_at) return { usable: false, reason: "revoked" };
  // A token with no expiry is treated as ALREADY expired, never as eternal. The schema forbids the
  // row (pas_token_needs_expiry_ck), so reaching here means something is wrong — and the safe
  // reading of "wrong" on the only credential in the system is closed, not open.
  if (!row.token_expires_at) return { usable: false, reason: "expired" };
  if (new Date(row.token_expires_at).getTime() <= now.getTime()) {
    return { usable: false, reason: "expired" };
  }
  return { usable: true };
}

/** `now + days`, as an ISO string. Server clock only — a client's clock is evidence, never a time. */
export function expiryFromNow(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
