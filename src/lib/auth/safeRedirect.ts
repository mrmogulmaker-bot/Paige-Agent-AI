/**
 * Safe redirect validation.
 *
 * Mitigates open-redirect / XSS-via-redirect (GHSA-2w69-qvjg-hvjx style).
 * Any redirect target derived from a URL param, backend payload, or
 * untrusted source MUST pass through `isSafeRedirectPath` before being
 * handed to `navigate()` / `window.location` / `<Navigate to=...>`.
 *
 * Rules:
 *  - Must be a non-empty string
 *  - Must start with a single "/"
 *  - Must NOT start with "//" or "/\\" (protocol-relative)
 *  - Must NOT contain control chars, "javascript:", or "data:"
 *  - Path prefix must be on the allowlist of known app sections
 */

const ALLOWED_PREFIXES = [
  "/app",
  "/admin",
  "/auth",
  "/onboard",
  "/join",
  "/accept-invite",
  "/client",
  "/coach",
  "/broker",
  "/affiliate",
  "/dashboard",
  "/settings",
  "/portal",
  "/legal",
  "/agreements",
  "/checkout",
  "/billing",
  "/intake",
  "/contacts",
  "/leads",
  "/members",
  "/knowledge",
  "/reports",
  "/funding",
  "/credit",
  "/profile",
] as const;

export function isSafeRedirectPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.length > 2048) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(path)) return false;
  const lower = path.toLowerCase();
  if (lower.includes("javascript:") || lower.includes("data:") || lower.includes("vbscript:")) {
    return false;
  }
  // Allow bare "/"
  if (path === "/") return true;
  // Must match an allowed top-level section.
  return ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
  );
}

/**
 * Returns the path if safe, otherwise the provided fallback.
 */
export function safeRedirectOr(path: unknown, fallback: string = "/app"): string {
  return isSafeRedirectPath(path) ? path : fallback;
}
