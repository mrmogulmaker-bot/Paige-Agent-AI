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
 *   4. tenant owner/member with no synced role yet → /admin
 *   5. fallback (signed in, no role, no client link, no tenant) → /onboarding
 *
 * The front door provisions TENANTS now, and a tenant's own customers arrive
 * only via invite (which links them as a `clients` row). So a signed-in user
 * with no staff role, no client linkage, and no tenant membership is someone
 * who created an account but hasn't stood up their workspace yet — send them
 * to the onboarding gate to provision one, not into the consumer portal.
 */
export async function resolveLandingRoute(userId: string): Promise<string> {
  try {
    const [rolesRes, clientRes, ownedTenantRes, memberTenantRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("clients")
        .select("id, onboarding_stage")
        .eq("linked_user_id", userId)
        .maybeSingle(),
      supabase.from("tenants").select("id").eq("owner_user_id", userId).limit(1).maybeSingle(),
      supabase.from("tenant_members").select("tenant_id").eq("user_id", userId).limit(1).maybeSingle(),
    ]);

    let roles = (rolesRes.data || []).map((r: any) => r.role as string);

    // Staff routes take priority — but only for genuine staff roles.
    if (roles.includes("super_admin") || roles.includes("admin") || roles.includes("coach")) {
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
      return "/app";
    }

    // Owns or belongs to a tenant but the app_role sync hasn't landed yet
    // (defensive — the provision trigger normally grants 'admin'): still a
    // tenant operator, so send them to the tenant admin, not the consumer app.
    if (ownedTenantRes.data?.id || memberTenantRes.data?.tenant_id) {
      return "/admin";
    }

    // Signed in, but no workspace yet → stand one up.
    return "/onboarding";
  } catch {
    // On any failure, don't strand them in the consumer portal — the onboarding
    // gate itself re-checks and forwards anyone who already has a workspace.
    return "/onboarding";
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
