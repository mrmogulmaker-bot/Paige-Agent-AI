/**
 * Host split: marketing on the apex, the product on app.paigeagent.ai.
 *
 * GHL-style: paigeagent.ai is the storefront (landing, pricing, legal); the
 * authenticated product AND all auth flows live on app.paigeagent.ai so the
 * Supabase session is born on the same origin the app runs on. Public,
 * tenant-facing routes (/book, /store, growth pages) stay reachable on both
 * hosts — they're shown to a coach's clients, never behind app login.
 *
 * DORMANT until the subdomain is live. Redirecting to a host that doesn't
 * resolve yet would break navigation, so nothing here acts until
 * HOST_SPLIT_ENABLED is flipped true (after app.paigeagent.ai resolves in
 * Vercel and app.* is added to Supabase Auth + Google OAuth redirect URLs).
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const MARKETING_HOST = "paigeagent.ai";
export const APP_HOST = "app.paigeagent.ai";

// Flip to true once app.paigeagent.ai is live + auth redirect URLs updated.
// TEMPORARILY REVERTED TO DORMANT: activating this before app.paigeagent.ai
// resolves and app.* is registered in Supabase Auth + Google OAuth redirect
// URLs breaks navigation — on the app host every in-app nav to "/" was 301'd to
// /auth (logo/"back to home" loop) and auth/admin routes bounced toward a host
// that isn't wired yet, locking the operator out of the God console. Re-enable
// only as a deliberate cutover once those preconditions are confirmed live.
export const HOST_SPLIT_ENABLED = false;

// Routes that belong on app.paigeagent.ai (product + auth). Hit on the apex → 301.
const APP_PREFIXES = [
  "/auth", "/operator", "/join-platform", "/signup", "/reset-password",
  "/accept-invite", "/join/", "/mcp/authorize", "/app", "/dashboard",
  "/admin", "/onboard", "/broker/app", "/workspace",
];

// Marketing-only routes. Hit on the app host → send back to the apex (canonical).
const MARKETING_ONLY_PREFIXES = [
  "/pricing", "/about", "/blog", "/terms", "/privacy", "/legal", "/affiliates",
];

// Prefix match on path segments: "/app" matches "/app" and "/app/x", not "/appt".
function matches(path: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return path.startsWith(prefix);
  return path === prefix || path.startsWith(prefix + "/");
}

export function isAppRoute(path: string): boolean {
  return APP_PREFIXES.some((p) => matches(path, p));
}
export function isMarketingOnlyRoute(path: string): boolean {
  return MARKETING_ONLY_PREFIXES.some((p) => matches(path, p));
}

/**
 * The absolute URL to redirect to, or null to stay put. Pure so it's testable.
 * No-ops on any host other than the two production hosts (localhost, Vercel
 * previews, custom tenant domains) so dev/preview builds are never redirected.
 */
export function computeHostRedirect(hostname: string, path: string, search: string, hash: string): string | null {
  if (!HOST_SPLIT_ENABLED) return null;
  const onApex = hostname === MARKETING_HOST || hostname === `www.${MARKETING_HOST}`;
  const onApp = hostname === APP_HOST;
  if (!onApex && !onApp) return null;

  if (onApex && isAppRoute(path)) {
    return `https://${APP_HOST}${path}${search}${hash}`;
  }
  if (onApp) {
    if (path === "/") return `https://${APP_HOST}/auth`; // bare app host → login
    if (isMarketingOnlyRoute(path)) return `https://${MARKETING_HOST}${path}${search}${hash}`;
  }
  return null;
}

/**
 * Build a link to an app route. While the split is off, returns a relative path
 * (same behavior as today); once on, returns an absolute app-host URL so
 * marketing CTAs jump straight to app.paigeagent.ai without a double hop.
 */
export function appUrl(path: string): string {
  return HOST_SPLIT_ENABLED ? `https://${APP_HOST}${path}` : path;
}
export function marketingUrl(path: string): string {
  return HOST_SPLIT_ENABLED ? `https://${MARKETING_HOST}${path}` : path;
}

/** Watches the location and cross-navigates to the canonical host when needed. */
export function useHostRouting(): void {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    const target = computeHostRedirect(window.location.hostname, pathname, search, hash);
    if (target) window.location.replace(target);
  }, [pathname, search, hash]);
}
