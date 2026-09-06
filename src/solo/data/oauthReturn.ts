/**
 * Where a provider OAuth round-trip should put the browser back.
 *
 * The connect handshake leaves the app entirely — the browser goes to Google,
 * comes back to `/auth/google-calendar/callback`, and that page then decides
 * where to land. It has always decided from ROLE alone (`/admin/calendar` for
 * staff, `/app/settings?tab=accounts` otherwise), which is correct for the
 * surfaces that existed when it was written and wrong for anyone who started the
 * handshake somewhere else: they connect successfully and are then dropped on a
 * different page than the one they were configuring.
 *
 * So the surface that STARTS the handshake records where it wants to be returned
 * to, and the callback honours it. Two rules keep that from becoming an open
 * redirect:
 *
 *   1. Only a same-origin ABSOLUTE PATH is ever stored or returned. A value with
 *      a scheme, a protocol-relative `//host` prefix, or a backslash is refused
 *      at BOTH ends — writing it and reading it — so a poisoned entry written by
 *      some other code path still cannot navigate anyone off-origin.
 *   2. It lives in `sessionStorage` and expires. It is scoped to the one tab that
 *      began the handshake, and a stale entry from an abandoned attempt is
 *      ignored rather than replayed onto an unrelated later visit.
 *
 * `take` is deliberately a read-and-clear: a return address is used once.
 */
const KEY = "paige.oauth.return";
const MAX_AGE_MS = 15 * 60_000;

/** A same-origin absolute path, and nothing else. */
export function isSafeReturnPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 2 || value.length > 512) return false;
  if (!value.startsWith("/")) return false;
  // `//host` is protocol-relative and leaves the origin; a backslash is treated
  // as a separator by some parsers, so `/\evil.com` would too.
  if (value.startsWith("//") || value.includes("\\")) return false;
  if (value.includes("://")) return false;
  return !/^\/admin(?:\/|\?|#|$)/i.test(value);
}

export function rememberOAuthReturn(path: string): void {
  if (!isSafeReturnPath(path)) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Private mode, or storage disabled. The callback then falls back to the
    // destination it has always used — a worse landing, never a broken connect.
  }
}

/**
 * Drop a stored return path without reading it. Used when the handshake that
 * would have consumed it never starts, so an address for a journey that was
 * abandoned cannot be picked up by an unrelated later one.
 */
export function clearOAuthReturn(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable — there was nothing to clear.
  }
}

/** Read the stored return path once, clearing it whether or not it was usable. */
export function takeOAuthReturn(): string | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) return null;
    return isSafeReturnPath(parsed.path) ? parsed.path : null;
  } catch {
    return null;
  }
}

/**
 * Arm the return store for a Google handshake that is about to start.
 *
 * The invariant has ONE home because it has two producers: this surface, which
 * supplies a return path, and the admin connectors panel, which does not. Only
 * remembering — never clearing — left an entry alive whenever a handshake
 * simply never came back: abandoning Google's consent page produces no callback
 * at all, so nothing on the error paths runs, and the address survived its full
 * TTL. The next Google handshake, wanting no return, then consumed it and
 * landed that person on a surface they were never on.
 *
 * So starting a handshake without a return path is itself a statement: there is
 * nowhere to come back to, and any address still lying around is stale.
 */
export function armOAuthReturn(returnTo?: string | null): void {
  if (returnTo) rememberOAuthReturn(returnTo);
  else clearOAuthReturn();
}
