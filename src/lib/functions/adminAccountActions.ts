import { supabase } from "@/integrations/supabase/client";

export type AdminAccountAction =
  | "password_reset"
  | "signout_all"
  | "resend_invite"
  | "wipe_onboarding";

export async function callAdminAccountAction(action: AdminAccountAction, userId: string) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (sessionError || !token) {
    throw new Error("Your admin session expired. Please sign in again.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-account-actions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action, user_id: userId }),
        signal: controller.signal,
      },
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || `Account action failed (${response.status})`);
    }

    return payload;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Account action timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}