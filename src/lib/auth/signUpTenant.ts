// signUpTenant — the single client entry point for front-door account creation.
//
// Calls the `tenant-signup` edge function (which creates a PRE-CONFIRMED user via
// the service role, so the broken confirmation-email path can't block signup),
// then signs the user in so the app can route them into onboarding. Used by both
// /auth (Auth.tsx) and /signup (PublicSignup). Returns the new user's id for
// consent persistence.
//
// When real email verification is restored (Task #52), this helper is where the
// flow changes back to a "check your email" gate.
import { supabase } from "@/integrations/supabase/client";
import { getStoredReferralCode } from "@/lib/referralStorage";

export interface SignUpTenantArgs {
  email: string;
  password: string;
  fullName?: string;
  marketingOptIn?: boolean;
  /** True when a tenant's CUSTOMER is creating a login to accept a portal invite.
   *  They already received the tenant's branded invite email, so the platform
   *  (Paige) welcome email is suppressed to keep the seam clean (§9). */
  suppressWelcome?: boolean;
}

export async function signUpTenant({
  email,
  password,
  fullName,
  marketingOptIn,
  suppressWelcome,
}: SignUpTenantArgs): Promise<{ userId: string | null }> {
  const referralCode = getStoredReferralCode();

  const { data, error } = await supabase.functions.invoke("tenant-signup", {
    body: { email, password, fullName, referralCode, marketingOptIn: !!marketingOptIn, suppressWelcome: !!suppressWelcome },
  });

  // Non-2xx from the function surfaces as `error`; dig out the JSON message.
  if (error) {
    let msg = "Couldn't create your account. Please try again.";
    try {
      const ctx = await (error as { context?: { json?: () => Promise<{ message?: string }> } }).context?.json?.();
      if (ctx?.message) msg = ctx.message;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  // 200 with an application-level failure (already exists, weak password, …).
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error((data as { message?: string }).message || "Couldn't create your account.");
  }

  // Establish a session so route guards / resolveLandingRoute can move the new
  // owner into onboarding.
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  const { data: userData } = await supabase.auth.getUser();
  return { userId: userData.user?.id ?? (data as { user_id?: string })?.user_id ?? null };
}
