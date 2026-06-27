// HMAC-SHA256 signature verification helpers using Web Crypto.

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^sha256=/i, "").trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
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

/** Verify "sha256=<hex>" signature header (Meta, Cal.com, generic). */
export async function verifyHmacSha256Hex(
  secret: string,
  body: string,
  headerValue: string | null,
): Promise<boolean> {
  if (!headerValue) return false;
  const expected = await hmacSha256(secret, body);
  const provided = hexToBytes(headerValue);
  return constantTimeEqual(expected, provided);
}

/** Verify DocuSign Connect HMAC1 (base64 of HMAC-SHA256). */
export async function verifyDocuSignHmac(
  secret: string,
  body: string,
  headerValue: string | null,
): Promise<boolean> {
  if (!headerValue) return false;
  const expected = await hmacSha256(secret, body);
  const expectedB64 = btoa(String.fromCharCode(...expected));
  // constant-time compare on equal-length strings
  if (expectedB64.length !== headerValue.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedB64.length; i++) diff |= expectedB64.charCodeAt(i) ^ headerValue.charCodeAt(i);
  return diff === 0;
}
