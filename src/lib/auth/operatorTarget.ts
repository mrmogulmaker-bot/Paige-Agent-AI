/**
 * Where to land an authenticated platform operator after the God-tier door.
 *
 * Defaults to the God console. A `?next=` deep link wins ONLY when it is a same-origin path
 * inside the operator subtree — that is the round-trip `RequireOperator` sets up when a
 * signed-out operator opens a bookmarked `/operator/{section}` URL.
 *
 * The allowlist is deliberately narrow so this can never become an open redirect: a single
 * leading "/", then a literal `operator/`, and no protocol-relative `//` or backslash in the
 * next position. An attacker-supplied `next` can therefore only ever point at a surface the
 * operator guard already protects.
 *
 * Lives in its own module rather than inside the login page so the validator can be tested
 * directly, and so the page keeps a single component export (§18 — one home).
 */

/** The operator's default landing surface. */
export const GOD_CONSOLE = "/admin/platform/tenants";

export function operatorTarget(search: string): string {
  const raw = new URLSearchParams(search).get("next");
  if (!raw) return GOD_CONSOLE;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape is not a destination.
    return GOD_CONSOLE;
  }

  if (!/^\/operator\/[^/\\]/.test(decoded)) return GOD_CONSOLE;
  // Never bounce back to the door itself — that loops.
  if (/^\/operator\/login(\/|\?|$)/.test(decoded)) return GOD_CONSOLE;
  return decoded;
}
