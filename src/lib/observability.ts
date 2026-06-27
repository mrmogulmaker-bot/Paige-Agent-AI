// Lightweight observability bootstrap: Sentry + PostHog.
// All initialization is gated on env keys so dev previews stay quiet.
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

let observabilityInitialized = false;

export function initObservability(): void {
  if (observabilityInitialized) return;
  observabilityInitialized = true;

  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (sentryDsn) {
    try {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        // Filter noisy/expected network errors
        ignoreErrors: [
          /Failed to fetch dynamically imported module/i,
          /Importing a module script failed/i,
          /ResizeObserver loop/i,
        ],
      });
    } catch (e) {
      console.warn("[sentry] init failed", e);
    }
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const posthogHost = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.posthog.com";
  if (posthogKey) {
    try {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        capture_pageview: true,
        capture_pageleave: true,
        persistence: "localStorage",
        autocapture: true,
        disable_session_recording: true,
        loaded: () => { /* ready */ },
      });
    } catch (e) {
      console.warn("[posthog] init failed", e);
    }
  }
}

export function identifyObservability(userId: string, traits: Record<string, unknown> = {}): void {
  try {
    if (import.meta.env.VITE_POSTHOG_KEY) posthog.identify(userId, traits);
  } catch { /* no-op */ }
  try {
    if (import.meta.env.VITE_SENTRY_DSN) Sentry.setUser({ id: userId, ...traits });
  } catch { /* no-op */ }
}

export function resetObservability(): void {
  try { if (import.meta.env.VITE_POSTHOG_KEY) posthog.reset(); } catch {}
  try { if (import.meta.env.VITE_SENTRY_DSN) Sentry.setUser(null); } catch {}
}

export function captureEvent(event: string, props: Record<string, unknown> = {}): void {
  try { if (import.meta.env.VITE_POSTHOG_KEY) posthog.capture(event, props); } catch {}
}
