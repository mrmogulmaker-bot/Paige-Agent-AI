// src/lib/referralStorage.ts
// Low-level storage helpers for referral attribution.
// We store the code in BOTH localStorage and a first-party cookie so that
//   - SPA navigation keeps it (localStorage)
//   - a fresh tab/return visit keeps it for 60 days (cookie)
//   - signup still works if the user clears localStorage mid-funnel

const STORAGE_KEY = "paige_ref";
const COOKIE_KEY = "paige_ref";
const MAX_AGE_DAYS = 60;

export interface StoredReferral {
  code: string;
  storedAt: number; // ms epoch
  landingPath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

function setCookie(name: string, value: string, maxAgeDays: number) {
  if (typeof document === "undefined") return;
  const maxAgeSec = Math.floor(maxAgeDays * 24 * 60 * 60);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${secure}`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[-.]/g, "\\$&") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function saveReferral(data: StoredReferral): void {
  try {
    const payload = JSON.stringify(data);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, payload);
    }
    setCookie(COOKIE_KEY, data.code, MAX_AGE_DAYS);
  } catch {
    // storage disabled / quota — silently ignore
  }
}

export function loadReferral(): StoredReferral | null {
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredReferral;
        const expiryMs = parsed.storedAt + MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() < expiryMs && parsed.code) return parsed;
      }
    }
    // Fallback to cookie (code only, metadata lost but attribution still works)
    const cookieCode = getCookie(COOKIE_KEY);
    if (cookieCode) {
      return { code: cookieCode, storedAt: Date.now() };
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearReferral(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setCookie(COOKIE_KEY, "", -1);
  } catch {
    // ignore
  }
}

export function getStoredReferralCode(): string | null {
  return loadReferral()?.code ?? null;
}
