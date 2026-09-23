import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  detectDeviceType,
  getOrCreateSessionId,
  getReferralCode,
  readUtmFromUrl,
} from "@/lib/analytics/session";

type EventCategory =
  | "acquisition"
  | "activation"
  | "engagement"
  | "revenue"
  | "paige"
  | "credit"
  | "funding"
  | "system";

interface TrackOptions {
  category?: EventCategory;
  properties?: Record<string, unknown>;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-event`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

let cachedUserId: string | null | undefined; // undefined = unknown, null = signed out

async function resolveUserId(): Promise<string | null> {
  if (cachedUserId !== undefined) return cachedUserId;
  try {
    const { data } = await supabase.auth.getSession();
    cachedUserId = data.session?.user?.id ?? null;
  } catch {
    cachedUserId = null;
  }
  return cachedUserId;
}

// Keep the cache fresh on auth changes.
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_evt, session) => {
    cachedUserId = session?.user?.id ?? null;
  });
}

/**
 * Redact credentials out of every URL this module records, before anything records them.
 *
 * WHAT CARRIES A CREDENTIAL. Three routes are live and all three put a bearer secret in the URL:
 *   · `/sign/:token`  — 256 bits as 64 hex chars; the whole of a counterparty's authority to open
 *     and sign a legal agreement. Stored only as its SHA-256, so the URL is the sole exposure.
 *   · `/join/:token`  — a tenant invite. Stored UNHASHED in `tenant_invite_tokens.token`, so a
 *     copy read out of analytics is redeemable as-is. The worst of the three.
 *   · `/u/:token`, and `?token=` / `?ct=` — unsubscribe, in the path AND in the query string.
 *
 * WHERE IT LEAKED TO. `usePageView` is mounted app-wide (`src/App.tsx`) and fires on every route
 * change, so each of these lands in:
 *   · `page_path` / `properties.path` / `properties.search` -> `analytics_events`, whose SELECT
 *     policy is `is_platform_owner()` — operators.
 *   · `referrer` -> the same table. `Referrer-Policy: strict-origin-when-cross-origin` strips the
 *     path only CROSS-origin; a same-origin full-page navigation carries the whole URL.
 *   · `landing_path` -> `referral_clicks`, the worst reachability of the set: `clicks_self` lets
 *     the OWNING AFFILIATE — an ordinary tenant-tier user — select the row. See
 *     `useReferralTracking`, which calls this.
 *
 * BELT AND BRACES, because either alone has already failed. The ROUTE list is authoritative for
 * the routes on it and blind to every other one — it shipped holding only "sign" while `/join`
 * and `/u` were already live, which is precisely how an allowlist fails: open, and silently. The
 * SHAPE rule needs no registration and so covers the route nobody remembered. Neither replaces
 * the other: shape cannot catch a low-entropy token, and the route rule cannot be fooled by a
 * standard-base64 token whose `/` splits it across segments.
 *
 * Matched the way the ROUTER matches, not by a case-sensitive prefix: React Router serves
 * `/SIGN/<token>` and `/Sign/<token>` for real. The head is percent-decoded too, so `/%73ign/...`
 * — which the router does NOT match and never renders — is still redacted, because these sinks
 * log whatever is in the URL regardless of what matched. Deliberately WIDER than the router:
 * redact more, never less.
 */
const REDACTED = "<redacted>";

/**
 * Routes whose tail IS a credential, whatever the value looks like (the BELT).
 *
 * `/join/:token` and `/u/:token` were both live and both unredacted when this set held only
 * "sign" — and `/join`'s invite tokens are stored UNHASHED in `tenant_invite_tokens.token`
 * (`token text NOT NULL UNIQUE`; every accept RPC resolves `WHERE token = _token`), so one read
 * out of analytics is directly redeemable, where a signing token at least has to beat a hash.
 */
const SECRET_ROUTE_SEGMENTS = new Set(["sign", "join", "u"]);

/** Query parameters that carry a credential by name. `ct` is the tenant-comms unsubscribe token. */
const SECRET_PARAM_RE =
  /^(token|ct|invite|invite_token|code|key|secret|jwt|access_token|refresh_token|api_key|apikey|password|signature|sig)$/i;

/** An identifier, not a secret. Paths carry these everywhere; redacting them would blind analytics. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed escape (a lone `%`). Compare the raw form rather than throwing.
    return raw;
  }
}

/**
 * Does this value have the SHAPE of a credential (the BRACES)?
 *
 * WHY SHAPE AND NOT ONLY A ROUTE LIST. A route allowlist is only ever correct about the routes
 * somebody remembered to add, and it fails OPEN on the next one — which is not hypothetical here:
 * the list shipped with "sign" alone while `/join/:token` and `/u/:token` were already live. The
 * shape rule needs no registration, so a token-bearing route added next quarter is covered the day
 * it ships. The route list stays as well, because it catches what shape cannot: a LOW-entropy
 * token, and a standard-base64 token containing `/`, which splits across path segments.
 *
 * Calibrated against the shapes this platform actually mints, not a guess:
 *   · signing + unsubscribe — `mintSignerToken()` is 32 CSPRNG bytes as hex => 64 chars [0-9a-f].
 *   · invite — `encode(gen_random_bytes(24), 'base64')` => 32 chars of the STANDARD alphabet,
 *     so `+`, `/` and `=` all occur; it is not base64url.
 *
 * Deliberately NOT redacted: UUIDs (identifiers, used in ordinary paths) and word-slugs, which
 * carry at most two character classes. A base64 secret of this width is mixed-case with digits.
 */
function looksLikeCredential(value: string): boolean {
  if (value.length < 20) return false;
  if (UUID_RE.test(value)) return false;
  // Long unbroken hex — the signing/unsubscribe mint shape.
  if (/^[0-9a-fA-F]{32,}$/.test(value)) return true;
  // base64 / base64url — the invite mint shape.
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return false;
  const classes =
    (/[a-z]/.test(value) ? 1 : 0) +
    (/[A-Z]/.test(value) ? 1 : 0) +
    (/[0-9]/.test(value) ? 1 : 0) +
    (/[+/=_]/.test(value) ? 1 : 0);
  return classes >= 3;
}

/** Redact a credential-bearing PATHNAME. Returns a stable shape so analytics can still group it. */
export function redactSecretPath(pathname: string): string {
  if (!pathname) return pathname;
  const segments = pathname.split("/");
  const head = safeDecode(segments[1] ?? "").toLowerCase();
  // BELT: on a known credential route the whole tail goes, so a sub-path cannot smuggle it back
  // and a token split across segments by a literal `/` cannot survive in pieces.
  if (SECRET_ROUTE_SEGMENTS.has(head)) return `/${head}/${REDACTED}`;
  // BRACES: anywhere else, redact per segment on shape alone.
  return segments
    .map((seg, i) => (i === 0 ? seg : looksLikeCredential(safeDecode(seg)) ? REDACTED : seg))
    .join("/");
}

/**
 * Redact a credential-bearing QUERY STRING.
 *
 * A query string is not somewhere credentials merely might appear — `/unsubscribe?token=<t>` and
 * `?ct=<t>` are both documented, live surfaces (see `src/pages/Unsubscribe.tsx`), and `search` was
 * being recorded verbatim. Redacted by param NAME and by value SHAPE, because either alone misses.
 */
export function redactSecretSearch(search: string): string {
  if (!search) return search;
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (!query) return search;
  const parts = query.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return looksLikeCredential(safeDecode(pair)) ? REDACTED : pair;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (SECRET_PARAM_RE.test(safeDecode(key)) || looksLikeCredential(safeDecode(value))) {
      return `${key}=${REDACTED}`;
    }
    return pair;
  });
  return `?${parts.join("&")}`;
}

/** Redact a credential-bearing ABSOLUTE URL, for sinks that record a whole href (the referrer). */
export function redactSecretUrl(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.pathname = redactSecretPath(parsed.pathname);
    parsed.search = redactSecretSearch(parsed.search);
    return parsed.toString();
  } catch {
    // Not a parseable absolute URL. Never hand back something unredacted on a guess.
    const [path, ...rest] = url.split("?");
    const tail = rest.join("?");
    return redactSecretPath(path) + (tail ? redactSecretSearch(`?${tail}`) : "");
  }
}

/**
 * LAST LINE OF DEFENCE: scrub every string in the outgoing payload, however deep.
 *
 * The per-sink calls above are correct but they are a list, and a list is the thing that was
 * already wrong once. This runs over the whole body immediately before it is posted, so a
 * credential reaching `properties` through a caller nobody has audited — a future `trackEvent`
 * site passing a URL, an error message quoting one — is still removed. Strings are redacted as
 * URL-ish when they contain a `/` or `?`, and by bare shape otherwise.
 */
function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === "string") {
    if (!value) return value;
    if (value.includes("/") || value.includes("?")) return redactSecretUrl(value);
    return looksLikeCredential(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_PARAM_RE.test(k) ? REDACTED : scrubDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Fire-and-forget event tracker. Never throws, never blocks UI.
 */
export async function trackEvent(
  event_name: string,
  optionsOrCategory: EventCategory | TrackOptions = "engagement",
  maybeProperties?: Record<string, unknown>,
): Promise<void> {
  if (typeof window === "undefined") return;

  let category: EventCategory = "engagement";
  let properties: Record<string, unknown> = {};

  if (typeof optionsOrCategory === "string") {
    category = optionsOrCategory;
    properties = maybeProperties ?? {};
  } else {
    category = optionsOrCategory.category ?? "engagement";
    properties = optionsOrCategory.properties ?? {};
  }

  try {
    const user_id = await resolveUserId();
    const session_id = getOrCreateSessionId();
    const utm = readUtmFromUrl();

    const payload = {
      event_name,
      event_category: category,
      user_id,
      session_id,
      properties,
      page_path: redactSecretPath(window.location.pathname),
      referrer: redactSecretUrl(document.referrer) || null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      referral_code: getReferralCode(),
      device_type: detectDeviceType(),
    };

    const body = JSON.stringify(scrubDeep(payload));

    // Prefer sendBeacon for reliability on unload-style events.
    if ("sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(FUNCTION_URL, blob);
      if (ok) return;
    }

    // Fallback to fetch with keepalive so it survives navigation.
    void fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow — analytics never breaks UX */
    });
  } catch {
    /* never throw */
  }
}

/**
 * Mount once near the top of the tree to fire `page_view` on every route change.
 */
export function usePageView(): void {
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;
    void trackEvent("page_view", "engagement", {
      path: redactSecretPath(location.pathname),
      // `search` was recorded verbatim, which is why redacting only the path was never the fix:
      // `/unsubscribe?token=<t>` and `?ct=<t>` are live token-bearing surfaces.
      search: location.search ? redactSecretSearch(location.search) : null,
    });
  }, [location.pathname, location.search]);
}

/**
 * Convenience hook for one-shot view events scoped to a feature page.
 * Example: useTrackOnMount("credit_intelligence_view", "engagement").
 */
export function useTrackOnMount(
  event_name: string,
  category: EventCategory = "engagement",
  properties?: Record<string, unknown>,
): void {
  useEffect(() => {
    void trackEvent(event_name, category, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
