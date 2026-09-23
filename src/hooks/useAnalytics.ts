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

/**
 * The same rule for OBJECT KEYS, deliberately narrower.
 *
 * `?code=` in a URL is an authorization code; a PROPERTY named `code` is a discount code, an error
 * code or a country code, and blanking it is silent analytics loss. The generic names are kept for
 * query strings, where they are unambiguous, and dropped here, where they are not.
 */
const SECRET_PROPERTY_RE =
  /^(token|invite_token|access_token|refresh_token|jwt|secret|api_key|apikey|password)$/i;

/** Attribution fields the scrub must never touch — they are the reason the payload exists. */
const ATTRIBUTION_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "referral_code",
]);

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
 * it ships. The route list stays as well, because it is CERTAIN on the routes it names while this
 * is a heuristic — and because it catches what shape cannot: a LOW-entropy token, a value under
 * the length floor, and anything minted in an alphabet nobody told this function about.
 * (A standard-base64 token split by its own `/` used to belong on that list too; it is now handled
 * by `looksLikeSplitCredential`, which rejoins the run before judging it.)
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
  // `_` and `-` are WORD SEPARATORS, not entropy, and treating them as a character class was a
  // real regression: `black_friday_2026_launch` scored lowercase+digit+underscore and was redacted
  // out of `utm_campaign`, which `track-event` writes to its own column — campaign attribution
  // destroyed platform-wide by a guard meant for credentials. A separator therefore DISQUALIFIES a
  // value instead of scoring for it. This is safe against what this platform actually mints: the
  // signing and unsubscribe tokens are hex (caught above) and invites are STANDARD base64, whose
  // alphabet has no `_` or `-` at all. It would miss a base64URL token — we mint none, and if one
  // is ever added, the route belt and the param-name rule still cover it.
  if (/[_-]/.test(value)) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(value)) return false;
  // LENGTH ALONE IS SUFFICIENT AT THE MINT WIDTH. An adversarial review Monte-Carlo'd 2,000,000
  // tokens of the real invite shape and measured 1 in 786 scoring only two character classes —
  // all letters, no digit and no `+` or `/`. A class count alone therefore leaks roughly one
  // invite in every 786 on any route the belt does not cover. Invites are exactly 32 characters,
  // so anything this long with no separator and a strict base64 alphabet is treated as a secret
  // regardless of what it scores. A human-authored slug of that width has separators.
  if (value.length >= 32) return true;
  const classes =
    (/[a-z]/.test(value) ? 1 : 0) +
    (/[A-Z]/.test(value) ? 1 : 0) +
    (/[0-9]/.test(value) ? 1 : 0) +
    (/[+/=]/.test(value) ? 1 : 0);
  return classes >= 3;
}

/**
 * Would this RUN OF SEGMENTS, rejoined, be one credential that a `/` split apart?
 *
 * MEASURED, and it is the difference between a control and a decoration. `/` is in the STANDARD
 * base64 alphabet, and 39.59% of real-shape invite tokens contain one (2,000,000 samples). Such a
 * token reaches a path already broken into pieces, each typically under the 20-character floor, so
 * the per-segment rule never sees a credential and the whole token survives. Measured escape rate
 * with per-segment checking alone, on a route the allowlist does not know: 1 in 7 — worse than the
 * 1 in 786 that made a class count insufficient in the first place.
 *
 * Rejoining is therefore necessary, but it cannot use the ordinary predicate: `/solo/3855/growth/
 * sales` rejoins to 22 characters of `[A-Za-z0-9/]` and would score three classes, so the ordinary
 * rule would redact half the product's routes.
 *
 * THE MIXED-CASE REQUIREMENT IS THE WHOLE DISCRIMINATOR. DO NOT RELAX IT — it is not incidental
 * tidying, and removing it is not a loosening, it is a removal. Two facts make it work, and they
 * are the only two:
 *
 *   · This platform's routes are LOWERCASE SLUGS. `/solo/3855/growth/sales`,
 *     `/clients/people`, `/signup` — verified against all 79 `path=` entries in `src/App.tsx`,
 *     none of which this predicate touches.
 *   · A 32-character token drawn from the 64-symbol base64 alphabet contains an uppercase letter
 *     with probability 1 - (38/64)^32 ≈ 1 - 2.6e-7. That rounds to certainty at this width.
 *
 * So requiring BOTH cases costs essentially no coverage against a real token and buys back every
 * lowercase route. Drop the uppercase requirement and the rule immediately starts eating ordinary
 * paths; drop the lowercase one and it stops distinguishing anything. If a future token scheme
 * mints in a single case, this predicate is blind to it — widen it then, deliberately, with a
 * fresh measurement, rather than by loosening this clause in passing.
 */
function looksLikeSplitCredential(rejoined: string): boolean {
  if (rejoined.length < 28) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(rejoined)) return false;
  return /[a-z]/.test(rejoined) && /[A-Z]/.test(rejoined);
}

/** Redact a credential-bearing PATHNAME. Returns a stable shape so analytics can still group it. */
export function redactSecretPath(pathname: string): string {
  if (!pathname) return pathname;
  const segments = pathname.split("/");
  const head = safeDecode(segments[1] ?? "").toLowerCase();
  // BELT: on a known credential route the whole tail goes, so a sub-path cannot smuggle it back
  // and a token split across segments by a literal `/` cannot survive in pieces.
  if (SECRET_ROUTE_SEGMENTS.has(head)) return `/${head}/${REDACTED}`;
  // BRACES: anywhere else, redact per segment on shape alone. EVERY segment is inspected —
  // skipping index 0 assumed the input always begins with `/`, which is true of a pathname and
  // false of the bare strings this is also reached with.
  const out: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    // Whole-run check FIRST: a token split by its own `/` is only visible once rejoined.
    if (i > 0 && looksLikeSplitCredential(segments.slice(i).join("/"))) {
      out.push(REDACTED);
      return out.join("/");
    }
    if (!looksLikeCredential(safeDecode(segments[i]))) {
      out.push(segments[i]);
      continue;
    }
    // Once one piece is a credential the rest belongs to the same secret — and a trailing piece is
    // often under the length floor, so inspecting it alone would let a fragment through. Collapse.
    out.push(REDACTED);
    return out.join("/");
  }
  return out.join("/");
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
    // The FRAGMENT carries credentials too: a Supabase implicit-flow recovery link arrives as
    // `#access_token=…&refresh_token=…`. It is parsed with the same rules as a query string.
    if (parsed.hash.length > 1) {
      const redactedHash = redactSecretSearch(`?${parsed.hash.slice(1)}`);
      parsed.hash = `#${redactedHash.slice(1)}`;
    }
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
function scrubString(value: string): string {
  if (!value) return value;
  // WHOLE-VALUE FIRST. A bare standard-base64 token contains `/`, so routing on "has a slash"
  // sent it down the URL path, where it split across segments and the head was skipped — the one
  // token in the set that needs no hash-break was passing through byte-for-byte.
  if (looksLikeCredential(value)) return REDACTED;
  // A real URL or path: redact structurally so the shape survives for analytics.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("/")) return redactSecretUrl(value);
  // FREE TEXT: redact credential-shaped runs in place. Rewriting the whole string as a path would
  // turn "visited /join/x earlier" into "/join/<redacted>", destroying the sentence around it.
  return value.replace(/[A-Za-z0-9+/=]{20,}/g, (run) => (looksLikeCredential(run) ? REDACTED : run));
}

function scrubDeep(value: unknown, depth = 0): unknown {
  // FAIL CLOSED AT THE CAP. This returned the value unscrubbed, so a credential nested past the
  // limit was handed straight to `JSON.stringify` — the exact thing this function exists to stop,
  // at its own boundary. Redacting only STRINGS here is not enough either: at the cap the value is
  // usually the next OBJECT down, and handing that back carries everything inside it out intact.
  // Only primitives, which cannot hide a credential, survive the cap.
  if (depth > 8) {
    if (value === null || value === undefined) return value;
    return typeof value === "number" || typeof value === "boolean" ? value : REDACTED;
  }
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Attribution values are never credentials and ARE load-bearing — `track-event` writes
      // utm_source/utm_medium/utm_campaign into their own columns, sized for long campaign names.
      // Exempting them by key means a future shape-rule change can never quietly cost the business
      // its campaign reporting again.
      if (ATTRIBUTION_KEYS.has(k)) out[k] = v;
      else if (SECRET_PROPERTY_RE.test(k)) out[k] = REDACTED;
      else out[k] = scrubDeep(v, depth + 1);
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
