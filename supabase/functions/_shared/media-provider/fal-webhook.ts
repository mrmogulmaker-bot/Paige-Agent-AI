/**
 * fal.ai callback verification — extracted dependency-free so vitest can
 * exercise the REAL signature path (not a mocked boolean).
 *
 * Scheme (fal docs, read 2026-09-12): ED25519 asymmetric signatures over
 *   requestId \n userId \n timestamp \n sha256hex(rawBody)
 * verified against fal's JWKS (https://rest.fal.ai/.well-known/jwks.json — each
 * key's `x` is a base64url Ed25519 public key; try every key, keys rotate, cache
 * ≤24h). NOT HMAC, and the verifying side holds NO secret. Replay window: the
 * docs mandate rejecting timestamps ±300s out.
 *
 * Fail-closed contract: ANY verification failure returns { ok: false } — the
 * receiver 401s and completion falls back to sweeper polling. An optional
 * FAL_WEBHOOK_USER_ID pin (owner-set) rejects callbacks from any other fal
 * account before signature work.
 */

const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
export const FAL_WEBHOOK_TOLERANCE_SECONDS = 300;

// Environment read guarded so vitest (no Deno global) imports this module.
function env(name: string): string | undefined {
  const d = (globalThis as { Deno?: { env?: { get(n: string): string | undefined } } }).Deno;
  return d?.env?.get(name);
}

function b64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const raw = atob(b64 + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The exact string fal signs (exported for tests): rid \n uid \n ts \n sha256(body). */
export function falWebhookSignedMessage(requestId: string, userId: string, timestamp: string, bodySha256Hex: string): string {
  return `${requestId}\n${userId}\n${timestamp}\n${bodySha256Hex}`;
}

interface MinimalJwk {
  x: string;
}

// JWKS cache — never longer than 24 hours (fal docs: keys rotate).
let jwksCache: { keys: MinimalJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchFalJwks(fetcher?: () => Promise<MinimalJwk[]>): Promise<MinimalJwk[]> {
  const resolved = fetcher ?? (async () => {
    const resp = await fetch(JWKS_URL);
    if (!resp.ok) throw new Error(`jwks fetch failed (${resp.status})`);
    const data = await resp.json();
    const keys = (data?.keys ?? []).filter((k: MinimalJwk) => typeof k?.x === "string");
    if (!keys.length) throw new Error("jwks carried no usable keys");
    return keys as MinimalJwk[];
  });
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const keys = await resolved();
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/** Test seam: clear the JWKS cache between isolated tests. */
export function __clearFalJwksCacheForTests(): void {
  jwksCache = null;
}

export type FalCallbackVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Verify one fal callback against the real ED25519 scheme. Returns { ok: false }
 * on ANY failure — never throws for a bad callback (throwing is for JWKS
 * infrastructure errors, which the caller maps to a fail-closed 401 too).
 */
export async function verifyFalCallback(input: {
  requestId: string | null;
  userId: string | null;
  timestamp: string | null;
  signatureHex: string | null;
  body: string;
  nowMs?: number;
  jwksFetcher?: () => Promise<MinimalJwk[]>;
}): Promise<FalCallbackVerdict> {
  const { requestId, userId, timestamp, signatureHex, body } = input;
  if (!requestId || !userId || !timestamp || !signatureHex) {
    return { ok: false, reason: "missing_headers" };
  }
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > FAL_WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_outside_window" };
  }
  const pinned = env("FAL_WEBHOOK_USER_ID");
  if (pinned && userId !== pinned) return { ok: false, reason: "user_id_mismatch" };

  const message = falWebhookSignedMessage(requestId, userId, timestamp, await sha256Hex(body));
  const signature = hexToBytes(signatureHex);
  const keys = await fetchFalJwks(input.jwksFetcher);
  for (const key of keys) {
    try {
      const pub = await crypto.subtle.importKey(
        "raw",
        b64UrlToBytes(key.x).buffer as ArrayBuffer,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      const valid = await crypto.subtle.verify(
        "Ed25519",
        pub,
        signature.buffer as ArrayBuffer,
        new TextEncoder().encode(message).buffer as ArrayBuffer,
      );
      if (valid) return { ok: true };
    } catch {
      // A key that cannot be imported/verified is skipped — the next may match.
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}
