import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { performSignOut, registerSignOutQueryClient } from "@/lib/auth/signOut";

const PUBLIC_ROUTES = new Set([
  "/",
  "/auth",
  "/reset-password",
  "/terms",
  "/privacy",
  "/unsubscribe",
  "/affiliates",
  "/become-an-affiliate",
  "/pricing",
]);

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  // Allow public marketing/affiliate landing variants
  if (pathname.startsWith("/affiliates/")) return true;
  return false;
}

function looksLikeJwtError(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const m = message.toLowerCase();
  return (
    m.includes("jwt expired") ||
    m.includes("invalid jwt") ||
    m.includes("invalid session") ||
    m.includes("session_not_found") ||
    m.includes("session not found") ||
    m.includes("refresh_token_not_found") ||
    m.includes("not authenticated") && m.includes("session")
  );
}

let interceptorInstalled = false;
let sessionExpiredHandled = false;

function handleExpiredSession() {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;

  toast.error("Your session expired — please sign in again.");
  // Small delay so the toast is visible before redirect.
  setTimeout(() => {
    performSignOut({ redirectTo: "/auth", scope: "local" });
  }, 250);
}

function installFetchInterceptor() {
  if (interceptorInstalled || typeof window === "undefined") return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);

    // Only inspect Supabase REST/auth/functions calls to avoid false positives.
    let url = "";
    try {
      url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    } catch {
      url = "";
    }

    if (!url.includes("supabase.co")) return response;
    if (response.status !== 401) return response;

    // Try to read the body without breaking the caller's downstream consumption.
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      if (text && (looksLikeJwtError(text) || /401/.test(String(response.status)))) {
        handleExpiredSession();
      } else {
        // Even a generic 401 from supabase usually means the session is bad.
        handleExpiredSession();
      }
    } catch {
      handleExpiredSession();
    }

    return response;
  };
}

/**
 * Mount once near the top of the React tree. Wires up:
 *  - QueryClient registration so non-React code can flush cache on sign-out.
 *  - Global onAuthStateChange listener: on SIGNED_OUT, flush state + redirect.
 *  - Global fetch interceptor: on Supabase 401 / JWT expired, auto sign out.
 */
export function GlobalAuthSessionManager() {
  const queryClient = useQueryClient();
  const lastEventRef = useRef<string | null>(null);

  useEffect(() => {
    registerSignOutQueryClient(queryClient);

    installFetchInterceptor();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Reset the expired-session guard when a fresh session is established.
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          sessionExpiredHandled = false;
        }

        if (event === "SIGNED_OUT" && lastEventRef.current !== "SIGNED_OUT") {
          lastEventRef.current = "SIGNED_OUT";

          try {
            queryClient.cancelQueries();
            queryClient.clear();
          } catch (e) {
            console.warn("Failed to clear cache on SIGNED_OUT:", e);
          }

          // If user is on a public page, no redirect needed.
          if (!isPublicRoute(window.location.pathname)) {
            // Use replace so back button doesn't return to a logged-in view.
            window.location.replace("/");
          }
          return;
        }

        if (event === "SIGNED_IN") {
          lastEventRef.current = "SIGNED_IN";
        }
      },
    );

    return () => {
      subscription.unsubscribe();
      registerSignOutQueryClient(null);
    };
  }, [queryClient]);

  return null;
}
