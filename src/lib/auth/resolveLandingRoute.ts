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
 * Agency default-landing (#191). For a staff user who would otherwise land on
 * `/admin`, decide whether they should instead open their Agency operator side.
 *
 * Eligibility is SERVER-PROVEN (§13), never `account_type` (which flips to the
 * child's on entry): `agency_switch_context().is_agency_manager` is the authority.
 * An eligible operator's per-owner preference (`profiles.agency_login_default`,
 * default 'agency') decides WHERE:
 *   - 'agency'       → open the /agency shell (also the brand-new-owner default).
 *   - 'last_account' → resume their last active account (→ /admin, which reads
 *                      profiles.active_tenant_id).
 * Returns "/agency" only when eligible AND preference is 'agency'; otherwise null
 * so the caller falls through to "/admin". Non-agency users get null (unaffected).
 */
async function resolveAgencyLanding(userId: string): Promise<string | null> {
  try {
    const [ctxRes, profileRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.rpc("agency_switch_context" as any),
      supabase.from("profiles").select("agency_login_default").eq("user_id", userId).maybeSingle(),
    ]);
    const ctx = (ctxRes.data as { is_agency_manager?: boolean } | null) ?? null;
    if (ctx?.is_agency_manager !== true) return null;
    const pref = (profileRes.data as { agency_login_default?: string } | null)?.agency_login_default;
    // Default (and first-signup) is 'agency'; 'last_account' resumes /admin.
    return pref === "last_account" ? null : "/agency";
  } catch {
    return null;
  }
}


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

    // Staff routes take priority — but only for genuine staff roles. An agency
    // operator may prefer to land on their /agency side (#191); a non-agency staff
    // user, or one who prefers 'last_account', falls through to /admin.
    if (roles.includes("super_admin") || roles.includes("admin") || roles.includes("coach")) {
      const agencyRoute = await resolveAgencyLanding(userId);
      return agencyRoute ?? "/admin";
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

    // Signed in with no role/client/tenant. If they came in to accept a customer
    // invite but didn't finish (created a login, closed the tab), resume them at
    // /join instead of the tenant "create a workspace" screen. The stash is a
    // {token, ts} JSON written by JoinWorkspace ONLY for a valid invite; it
    // expires quickly so a stale/abandoned invite can't hijack a later, unrelated
    // signup on the same browser.
    try {
      const raw = localStorage.getItem("paige_pending_invite");
      if (raw) {
        const parsed = JSON.parse(raw) as { token?: unknown; ts?: unknown };
        const token = typeof parsed?.token === "string" ? parsed.token : null;
        const ts = typeof parsed?.ts === "number" ? parsed.ts : 0;
        const FRESH_MS = 30 * 60 * 1000; // 30 minutes
        if (token && /^[A-Za-z0-9_-]+$/.test(token) && Date.now() - ts < FRESH_MS) {
          return `/join/${token}`;
        }
        localStorage.removeItem("paige_pending_invite"); // stale/garbage → drop it
      }
    } catch {
      try { localStorage.removeItem("paige_pending_invite"); } catch { /* ignore */ }
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
