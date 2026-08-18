/**
 * Where to land an authenticated platform operator after the God-tier door.
 *
 * Defaults to the God console. A `?next=` deep link wins ONLY when it is a same-origin path
 * inside the operator subtree — that is the round-trip `RequireOperator` sets up when a
 * signed-out operator opens a bookmarked `/operator/{section}` URL.
 *
 * WHY THE CHECK IS SEGMENT-WISE AND NOT A PREFIX REGEX. The first version of this tested
 * `/^\/operator\/[^/\\]/`, which only inspects the character immediately after `/operator/`.
 * A `.` passes that, so `/operator/../../book/evil-slug` was accepted — and react-router
 * normalizes it to `/book/evil-slug`, landing a freshly-authenticated operator on a
 * tenant-authored page, on the real domain, the instant after they type their password. The
 * §39 peer-gate caught it and I reproduced it before fixing. So the path is now decomposed
 * into segments and every one is checked: the prefix must be exactly `operator`, no segment
 * may be `.` or `..`, and no segment may be empty (which is what a protocol-relative `//`
 * and a `/operator//x` both look like after a split).
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

  // Reject anything that isn't a plain same-origin path before we even look at segments:
  // a scheme, a backslash (some parsers fold "\" to "/"), or an embedded control character.
  if (!decoded.startsWith("/")) return GOD_CONSOLE;
  if (decoded.includes("\\")) return GOD_CONSOLE;
  // Codepoint scan rather than a control-character regex, which is exactly what
  // `no-control-regex` exists to flag.
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return GOD_CONSOLE;
  }

  // Split off any query/hash — only the PATH is subject to the subtree rule; a query string
  // is carried through untouched because it cannot change which route matches.
  const pathEnd = decoded.search(/[?#]/);
  const pathname = pathEnd === -1 ? decoded : decoded.slice(0, pathEnd);

  // `"/a/b".split("/")` → ["", "a", "b"], so drop the leading empty and require the rest to
  // be real, non-traversing segments. An empty segment here means a doubled slash.
  const segments = pathname.split("/").slice(1);
  if (segments.length < 2) return GOD_CONSOLE; // "/operator" alone is the door, not a surface
  if (segments[0] !== "operator") return GOD_CONSOLE;
  if (segments.some((s) => s === "" || s === "." || s === "..")) return GOD_CONSOLE;

  // Never bounce back to the door itself — that loops. Case-insensitive because react-router
  // matches paths case-insensitively, so `/operator/LOGIN` resolves to the login route too.
  if (segments[1].toLowerCase() === "login") return GOD_CONSOLE;

  return decoded;
}
