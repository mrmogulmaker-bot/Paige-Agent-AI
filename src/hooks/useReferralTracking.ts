// src/hooks/useReferralTracking.ts
// Mount once at the top of the tree (inside App.tsx). On mount:
//   1. Read ?ref=CODE from URL (and any utm_* params)
//   2. Persist to localStorage + cookie for 60 days
//   3. Fire-and-forget the track-referral-click edge function
//   4. Quietly remove ?ref from the URL (keeps clean share links)
//
// Exports getStoredReferralCode() for the signup flow to pass into options.data.

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client"; // ADJUST-IF-NEEDED
import {
  saveReferral,
  loadReferral,
  getStoredReferralCode,
} from "@/lib/referralStorage";

export { getStoredReferralCode };

function readUrlParams(): {
  code: string | null;
  landingPath: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
} {
  if (typeof window === "undefined") {
    return { code: null, landingPath: "/" };
  }
  const url = new URL(window.location.href);
  const code = url.searchParams.get("ref");
  return {
    code: code ? code.trim().toUpperCase() : null,
    landingPath: url.pathname + url.search,
    utmSource: url.searchParams.get("utm_source") ?? undefined,
    utmMedium: url.searchParams.get("utm_medium") ?? undefined,
    utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
  };
}

function stripRefFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ref")) return;
  url.searchParams.delete("ref");
  const next = url.pathname + (url.search || "") + url.hash;
  window.history.replaceState({}, "", next);
}

export function useReferralTracking(): void {
  useEffect(() => {
    const { code, landingPath, utmSource, utmMedium, utmCampaign } =
      readUrlParams();

    if (!code) {
      // No new code in URL — keep any existing stored one untouched.
      return;
    }

    // If a different code is already stored, last-touch wins (matches spec).
    const existing = loadReferral();
    if (!existing || existing.code !== code) {
      saveReferral({
        code,
        storedAt: Date.now(),
        landingPath,
        utmSource,
        utmMedium,
        utmCampaign,
      });
    }

    // Fire and forget — never block render.
    void (async () => {
      try {
        await supabase.functions.invoke("track-referral-click", {
          body: {
            referral_code: code,
            landing_path: landingPath,
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            user_agent:
              typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          },
        });
      } catch (err) {
        // Silent — tracking failure should never break the app.
        if (typeof console !== "undefined") {
          console.debug("[referral] track-click failed", err);
        }
      }
    })();

    // Clean up the URL so the code doesn't leak into shared links.
    stripRefFromUrl();
  }, []);
}
