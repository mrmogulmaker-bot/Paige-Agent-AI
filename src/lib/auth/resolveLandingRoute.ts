import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical post-login landing route for a given user, based on their roles
 * and client linkage. Used by Auth.tsx, the landing header "Go to Dashboard"
 * button, and AppShell's `/app` redirect so every entry point agrees.
 *
 * Priority:
 *   1. admin / coach   → /admin
 *   2. broker / broker_team_member → /broker/app
 *   3. linked client (clients.linked_user_id = user.id) → /workspace
 *   4. fallback → /app
 */
export async function resolveLandingRoute(userId: string): Promise<string> {
  try {
    const [rolesRes, clientRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("clients")
        .select("id")
        .eq("linked_user_id", userId)
        .maybeSingle(),
    ]);

    const roles = (rolesRes.data || []).map((r: any) => r.role as string);

    if (roles.includes("admin") || roles.includes("coach")) {
      return "/admin";
    }
    if (roles.includes("broker") || roles.includes("broker_team_member")) {
      return "/broker/app";
    }
    if (clientRes.data?.id) {
      return "/workspace";
    }
    return "/app";
  } catch {
    return "/app";
  }
}

/** Clear any "preview as client" override so a fresh login honors the role redirect. */
export function clearClientViewOverride() {
  try {
    sessionStorage.removeItem("paige_stay_in_client_view");
  } catch {
    /* ignore */
  }
}
