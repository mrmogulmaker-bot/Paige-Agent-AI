import { supabase } from "@/integrations/supabase/client";

const AUTH_STORAGE_KEY_PATTERNS = [
  /^sb-.*-auth-token$/i,
  /^supabase\.auth/i,
  /^supabase-auth-token/i,
];

function clearAuthStorage() {
  if (typeof window === "undefined") return;

  const clearMatchingKeys = (storage: Storage) => {
    const keysToRemove: string[] = [];

    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;

      if (AUTH_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => storage.removeItem(key));
  };

  clearMatchingKeys(window.localStorage);
  clearMatchingKeys(window.sessionStorage);
}

export async function performSignOut(redirectTo = "/auth") {
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch (globalError) {
    console.error("Global sign out failed, falling back to local sign out:", globalError);

    try {
      await supabase.auth.signOut();
    } catch (localError) {
      console.error("Local sign out also failed:", localError);
    }
  } finally {
    clearAuthStorage();
    window.location.replace(redirectTo);
  }
}
