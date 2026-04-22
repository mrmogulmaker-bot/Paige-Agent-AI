// Browser session helpers for analytics.
// A "session" here is a per-tab identifier that resets after 30 minutes of inactivity.

const SESSION_KEY = "paige_analytics_session_id";
const SESSION_LAST_KEY = "paige_analytics_session_last";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const REFERRAL_KEY = "paige_referral_code";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(SESSION_LAST_KEY) || 0);
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing && now - last < SESSION_TIMEOUT_MS) {
      sessionStorage.setItem(SESSION_LAST_KEY, String(now));
      return existing;
    }
    const id = uuid();
    sessionStorage.setItem(SESSION_KEY, id);
    sessionStorage.setItem(SESSION_LAST_KEY, String(now));
    return id;
  } catch {
    return "no-storage";
  }
}

export function getReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REFERRAL_KEY);
  } catch {
    return null;
  }
}

export function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet|PlayBook|Silk/.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Phone|Mobile/i.test(ua)) return "mobile";
  return "desktop";
}

export function readUtmFromUrl(): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
} {
  if (typeof window === "undefined") {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}
