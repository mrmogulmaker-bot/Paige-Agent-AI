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
 * Fire-and-forget event tracker. Never throws, never blocks UI.
 */
/**
 * Redact path segments that ARE credentials before anything records them.
 *
 * `/sign/:token` carries a 256-bit bearer token as a path SEGMENT — it is the whole of a
 * counterparty's authority to open and sign a legal agreement. Three globally-mounted sinks
 * record the URL, and every one of them had to be closed:
 *
 *   - `page_path` and `properties.path` -> `analytics_events`, readable by `is_platform_owner()`.
 *   - `referrer` -> `analytics_events.referrer`, same table. `Referrer-Policy` is
 *     `strict-origin-when-cross-origin`, so a cross-origin referrer carries no path — but a
 *     SAME-origin full-page navigation away from the signing route carries the whole URL. No such
 *     navigation exists on that page today, so this one is armed rather than firing; it is closed
 *     anyway, because it begins firing the moment someone adds one and nobody is watching.
 *   - `landing_path` -> `referral_clicks`, which is the worst of the three: its RLS lets the
 *     OWNING AFFILIATE select the row, so the credential would reach an ordinary tenant-tier user
 *     rather than a platform operator. See `useReferralTracking`, which calls this.
 *
 * Keyed on the ROUTE, not on the shape of the value, so a token that happens to look ordinary is
 * still redacted and a harmless id is not mangled.
 *
 * Matched the way the ROUTER matches, not by a case-sensitive string prefix. React Router
 * registers `/sign/:token` case-insensitively, so `/SIGN/<token>` and `/Sign/<token>` render the
 * signing page for real; a `startsWith("/sign/")` check waved both straight through. The first
 * segment is also percent-decoded before comparison: `/%73ign/<token>` does NOT match the route
 * and so never renders, but these sinks log whatever is in the URL regardless of what matched, so
 * the guard is deliberately WIDER than the router. Redact more, never less.
 */
const SECRET_ROUTE_SEGMENTS = new Set(["sign"]);

function firstSegment(pathname: string): string {
  const raw = pathname.split("/")[1] ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed escape (a lone `%`). Compare the raw form rather than throwing.
    return raw;
  }
}

/** Redact a credential-bearing PATHNAME. Returns a stable shape so analytics can still group it. */
export function redactSecretPath(pathname: string): string {
  const head = firstSegment(pathname);
  if (!SECRET_ROUTE_SEGMENTS.has(head.toLowerCase())) return pathname;
  return `/${head.toLowerCase()}/<redacted>`;
}

/** Redact a credential-bearing ABSOLUTE URL, for sinks that record a whole href (the referrer). */
export function redactSecretUrl(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.pathname = redactSecretPath(parsed.pathname);
    return parsed.toString();
  } catch {
    // Not a parseable absolute URL. Never hand back something unredacted on a guess.
    return redactSecretPath(url);
  }
}

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

    const body = JSON.stringify(payload);

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
      search: location.search || null,
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
