// Native Supabase OAuth helpers.
// Replaces the retired third-party managed-auth SDK: OAuth now authenticates
// directly against the project's own Supabase Auth.
//
// Supabase redirects the browser to the provider automatically; the session is
// established on return via detectSessionInUrl on the Supabase client.

import { supabase } from "@/integrations/supabase/client";

export type OAuthProvider = "google" | "apple";

// Sign in (or sign up) with an OAuth provider. Returns a { redirected, error }
// shape so call sites can short-circuit once the browser navigates to the
// provider's consent screen.
export async function signInWithOAuth(
  provider: OAuthProvider,
  redirectTo: string = `${window.location.origin}/app`,
): Promise<{ redirected: boolean; error: Error | null }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  return { redirected: !error && !!data?.url, error: error ?? null };
}

// Link an additional OAuth identity to the currently signed-in user
// (Supabase "manual linking" must be enabled on the project).
export async function linkOAuthIdentity(
  provider: OAuthProvider,
  redirectTo: string = window.location.origin,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo },
  });
  return { error: error ?? null };
}
