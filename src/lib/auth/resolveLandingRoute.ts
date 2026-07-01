import { supabase } from "@/integrations/supabase/client";

// Pre-portal onboarding is now just two gates: welcome + agreement.
// Anything beyond signing_agreement lands the client directly in /workspace,
// where Paige takes over the intake/docs conversation.
const STAGE_TO_PATH: Record<string, string> = {
  invited: "/onboard/welcome",
  signing_agreement: "/onboard/agreement",
};
const PRE_PORTAL_STAGES = new Set(Object.keys(STAGE_TO_PATH));


/**
 * Canonical post-login landing route for a given user, based on their roles
 * and client linkage. Used by Auth.tsx, the landing header "Go to Dashboard"
 * button, and AppShell's `/app` redirect so every entry point agrees.
 *
 * Self-healing: if the signed-in user is linked to a `clients` row but is
 * missing the `client` role (legacy invites that activated before role grant
 * was added), call `ensure_client_role_self_heal()` to backfill the role and
 * onboarding stage so the workspace + onboarding gates accept them.
 *
 * Priority:
 *   1. admin / coach   → /admin
 *   2. broker / broker_team_member → /broker/app
 *   3. linked client (clients.linked_user_id = user.id) → /onboard/<stage> or /workspace
 *   4. fallback → /app
 */
export async function resolveLandingRoute(userId: string): Promise<string> {
  try {
    const [rolesRes, clientRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("clients")
        .select("id, onboarding_stage")
        .eq("linked_user_id", userId)
        .maybeSingle(),
    ]);

    let roles = (rolesRes.data || []).map((r: any) => r.role as string);

    // Staff routes take priority — but only for genuine staff roles.
    if (roles.includes("admin") || roles.includes("coach")) {
      return "/admin";
    }
    if (roles.includes("broker") || roles.includes("broker_team_member")) {
      return "/broker/app";
    }

    let clientRow = clientRes.data;

    // Self-heal: linked client without the `client` role, or with a missing
    // onboarding stage. Backfills both via SECURITY DEFINER RPC.
    if (clientRow?.id && (!roles.includes("client") || !clientRow.onboarding_stage)) {
      const { data: healed } = await supabase.rpc("ensure_client_role_self_heal");
      const row = Array.isArray(healed) ? healed[0] : healed;
      if (row?.healed) {
        roles = [...roles, "client"];
        clientRow = {
          id: row.client_id ?? clientRow.id,
          onboarding_stage: row.onboarding_stage ?? clientRow.onboarding_stage ?? "invited",
        };
      }
    }

    if (clientRow?.id) {
      const stage = clientRow.onboarding_stage ?? "invited";
      if (PRE_PORTAL_STAGES.has(stage)) {
        return STAGE_TO_PATH[stage];
      }
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
