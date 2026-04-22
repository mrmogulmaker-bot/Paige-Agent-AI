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
      page_path: window.location.pathname,
      referrer: document.referrer || null,
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
      path: location.pathname,
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
