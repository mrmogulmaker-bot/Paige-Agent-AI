// AES-GCM encryption for calendar OAuth refresh tokens and CalDAV passwords.
// Uses CALENDAR_ENCRYPTION_KEY (64-char hex-ish string) hashed to 32 bytes.

const enc = new TextEncoder();
const dec = new TextDecoder();

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CALENDAR_ENCRYPTION_KEY");
  if (!secret) throw new Error("CALENDAR_ENCRYPTION_KEY not configured");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  const bytes = new Uint8Array(iv.length + ct.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...bytes));
}

export async function decryptSecret(payload: string): Promise<string> {
  const key = await getKey();
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}
