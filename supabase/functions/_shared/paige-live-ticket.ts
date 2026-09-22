/**
 * Opaque, short-lived, one-use relay admission ticket. The database stores only
 * a digest in paige_live_sessions.provider_session_ref while no provider session
 * exists; the consume UPDATE clears that field atomically before WS upgrade.
 * This module has exactly two deployed importers: paige-live-session and
 * paige-live-relay. It contains no tenant selection or provider transport.
 */
export const RELAY_TICKET_TTL_MS = 45_000;

/** Platform-owned workspace availability; never a client-supplied scope or role. */
export function isLiveAudioPilotEnabled(row: unknown): boolean {
  return !!row && typeof row === "object" && !Array.isArray(row) &&
    (row as Record<string, unknown>).enabled === true;
}

export interface RelayTicket {
  value: string;
  storedDigest: string;
  expiresAt: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validRelaySessionId(value: string): boolean {
  return uuid.test(value);
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueRelayTicket(now = Date.now()): Promise<RelayTicket> {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const expiresAt = now + RELAY_TICKET_TTL_MS;
  const value = Array.from(nonce, (byte) => byte.toString(16).padStart(2, "0")).join("") + "." + expiresAt;
  return { value, storedDigest: "ticket:" + await digest(value), expiresAt };
}

export async function validateRelayTicket(value: string, now = Date.now()): Promise<RelayTicket | null> {
  if (!/^[0-9a-f]{64}\.[0-9]{13}$/.test(value)) return null;
  const expiresAt = Number(value.split(".")[1]);
  if (!Number.isSafeInteger(expiresAt) || now >= expiresAt || expiresAt - now > RELAY_TICKET_TTL_MS) return null;
  return { value, storedDigest: "ticket:" + await digest(value), expiresAt };
}

/** consume must be an atomic conditional update, returning a row only once. */
export async function consumeRelayTicket<T>(
  token: string,
  sessionId: string,
  store: { consume(sessionId: string, storedDigest: string): Promise<T | null> },
  now = Date.now(),
): Promise<T | null> {
  if (!validRelaySessionId(sessionId)) return null;
  const ticket = await validateRelayTicket(token, now);
  if (!ticket) return null;
  return store.consume(sessionId, ticket.storedDigest);
}
