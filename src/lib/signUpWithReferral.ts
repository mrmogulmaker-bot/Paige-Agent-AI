// src/lib/signUpWithReferral.ts
// Thin wrapper around supabase.auth.signUp that attaches the stored referral
// code (if any) as user metadata. Use this instead of calling signUp directly.
//
// The code lands on auth.users.raw_user_meta_data.referral_code and should be
// copied into public.profiles.referral_code via your existing handle_new_user()
// trigger (see INTEGRATION.md step 4).

import { supabase } from "@/integrations/supabase/client"; // ADJUST-IF-NEEDED
import { getStoredReferralCode, clearReferral } from "@/lib/referralStorage";

interface SignUpArgs {
  email: string;
  password: string;
  fullName?: string;
  redirectTo?: string;
  extraData?: Record<string, unknown>;
}

export async function signUpWithReferral({
  email,
  password,
  fullName,
  redirectTo,
  extraData,
}: SignUpArgs) {
  const referralCode = getStoredReferralCode();

  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        ...(fullName ? { full_name: fullName } : {}),
        ...(referralCode ? { referral_code: referralCode } : {}),
        ...(extraData ?? {}),
      },
    },
  });

  // Don't clear the cookie — keep the attribution window alive in case the user
  // abandons signup and returns later. It'll expire naturally at 60 days.
  // If you explicitly want to reset on successful signup, uncomment:
  // if (!result.error) clearReferral();

  return result;
}

// Re-export for convenience in components that only need to clear (e.g. test).
export { clearReferral };
