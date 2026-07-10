import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve where a user should land AFTER sign-out. A tenant's customer returns
 * to their coach's branded gateway (/portal/:slug) — never the Paige platform
 * page (§9). get_client_portal_brand returns a row ONLY for a linked customer,
 * so staff/operators (no row) fall through to `fallback`. Must be called while
 * still authenticated (before performSignOut). Never throws.
 */
export async function customerSignOutTarget(fallback = "/"): Promise<string> {
  try {
    const { data } = await supabase.rpc("get_client_portal_brand");
    const row = Array.isArray(data) ? data[0] : data;
    const slug = (row as { tenant_slug?: string } | null)?.tenant_slug;
    return slug ? `/portal/${encodeURIComponent(slug)}` : fallback;
  } catch {
    return fallback;
  }
}

const AUTH_STORAGE_KEY_PATTERNS = [
  /^sb-.*-auth-token$/i,
  /^supabase\.auth/i,
  /^supabase-auth-token/i,
];

// Keys that intentionally survive sign-out (e.g. referral attribution).
const PRESERVE_KEYS = new Set<string>(["paige_ref"]);

// Allow consumers (App root) to register the active QueryClient so that
// signOut can flush all cached data even when called from non-React code
// (e.g. global auth listener, fetch interceptor).
let registeredQueryClient: QueryClient | null = null;
export function registerSignOutQueryClient(client: QueryClient | null) {
  registeredQueryClient = client;
}

function clearAuthStorage(opts: { wipeAll: boolean }) {
  if (typeof window === "undefined") return;

  const clearStorage = (storage: Storage) => {
    const keysToRemove: string[] = [];

    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;

      if (PRESERVE_KEYS.has(key)) continue;

      if (opts.wipeAll) {
        keysToRemove.push(key);
      } else if (AUTH_STORAGE_KEY_PATTERNS.some((p) => p.test(key))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => storage.removeItem(key));
  };

  // sessionStorage is fully wiped (no preserved keys live there).
  try {
    const sess = window.sessionStorage;
    const sessionKeys: string[] = [];
    for (let i = 0; i < sess.length; i += 1) {
      const k = sess.key(i);
      if (k) sessionKeys.push(k);
    }
    sessionKeys.forEach((k) => sess.removeItem(k));
  } catch (e) {
    console.warn("Failed to clear sessionStorage:", e);
  }

  try {
    clearStorage(window.localStorage);
  } catch (e) {
    console.warn("Failed to clear localStorage:", e);
  }
}

interface SignOutOptions {
  /** Where to send the user after sign-out completes. Defaults to "/". */
  redirectTo?: string;
  /** "global" kills refresh tokens on every device for this user. */
  scope?: "local" | "global";
  /** When true, removes everything from localStorage except PRESERVE_KEYS. */
  wipeAllStorage?: boolean;
  /** Optional QueryClient to clear; falls back to the registered one. */
  queryClient?: QueryClient | null;
}

let isSigningOut = false;

export async function performSignOut(
  redirectToOrOptions: string | SignOutOptions = "/",
): Promise<void> {
  // Normalize args
  const opts: SignOutOptions =
    typeof redirectToOrOptions === "string"
      ? { redirectTo: redirectToOrOptions }
      : redirectToOrOptions ?? {};

  const redirectTo = opts.redirectTo ?? "/";
  const scope = opts.scope ?? "local";
  const wipeAllStorage = opts.wipeAllStorage ?? true;
  const queryClient = opts.queryClient ?? registeredQueryClient;

  // Re-entrancy guard so listener + button click don't double-fire.
  if (isSigningOut) return;
  isSigningOut = true;

  try {
    try {
      await supabase.auth.signOut({ scope });
    } catch (err) {
      console.error(`Sign out (${scope}) failed, falling back to local:`, err);
      try {
        await supabase.auth.signOut();
      } catch (innerErr) {
        console.error("Local sign out also failed:", innerErr);
      }
    }
  } finally {
    // Always clear client state even if the network call failed.
    try {
      queryClient?.cancelQueries();
      queryClient?.clear();
    } catch (e) {
      console.warn("Failed to clear React Query cache:", e);
    }

    clearAuthStorage({ wipeAll: wipeAllStorage });

    // Use replace so back-button doesn't return to authenticated view.
    window.location.replace(redirectTo);
  }
}
