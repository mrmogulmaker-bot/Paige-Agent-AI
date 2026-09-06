// RequireSetupComplete — the Setup gate (owner directive, 2026-08-16)
//
// OWNER RULING: "NEVER MAKE ANYONE DEFAULT TO ANYTHING ... EVERYONE goes through
// Setup and chooses (playbook/pipeline/calendar) via the marketplace/Setup." With the
// starter auto-provisioner removed, a freshly provisioned tenant lands with NO chosen
// playbook. This gate holds such a tenant on the marketplace/Setup chooser until they
// pick — instead of dropping them onto an auto-built dashboard they never asked for.
//
// SETUP-COMPLETE SIGNAL (safe, grandfathers every existing tenant): the active tenant
// is setup-complete when `features.playbook` (non-empty) OR `features.playbook_config`
// is present. Completing a marketplace blueprint install writes `features.playbook_config`
// synchronously (_marketplace_apply_playbook_config), so the gate opens the moment they
// choose. Any tenant that ALREADY has a playbook is grandfathered → never gated.
//
// NO-OP (never redirects) for, by construction:
//   • platform operators / God / super_admin / platform_admin (isPlatformStaff) —
//     they operate at the platform tier, no tenant playbook to pick;
//   • clients & anonymous — no active operator tenant in this context (auth guards own
//     those surfaces; this gate wraps only the /admin + /agency shells, never /app);
//   • any tenant that already has a chosen playbook (grandfathered / just chose one).
//
// FAIL OPEN by construction (§13/§32): renders children immediately and redirects ONLY
// after the tenant context has resolved (loading === false) AND a real active tenant has
// no playbook. While loading, no active tenant, staff, or already-configured → children
// render untouched, so a false negative can never strand a real, set-up user.
//
// NO REDIRECT LOOP: the chooser lives at /admin/marketplace, which is inside the wrapped
// /admin/* subtree. The gate NO-OPs whenever the current path is already the chooser, so
// the chooser is always reachable while gated (§36: a real first-run chooser, not a dead
// redirect).
import { Navigate, useLocation } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { resolveTierKey } from "@/lib/tier/tierFeatures";

export function canonicalSetupPath(
  tierKey: ReturnType<typeof resolveTierKey>,
  accountNumber: number | string | null | undefined,
): string | null {
  const normalized = Number(accountNumber);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) return null;
  if (tierKey === "solo") return `/solo/${normalized}/settings/setup`;
  if (tierKey === "sub_account") return `/business/${normalized}/setup`;
  return null;
}

export function RequireSetupComplete({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { loading, isPlatformStaff, activeTenant } = useTenantContext();

  // Setup-complete = a chosen playbook slug OR a playbook_config object on the tenant.
  const features = activeTenant?.features ?? null;
  const playbookSlug = features?.playbook;
  const hasPlaybook =
    (typeof playbookSlug === "string" && playbookSlug.trim().length > 0) ||
    (features != null && Object.prototype.hasOwnProperty.call(features, "playbook_config"));

  // §51/§61: ONLY the business-operating tiers (Solo + Sub-account) ever pick a business
  // playbook, so ONLY they are gated. An agency/enterprise MANAGER manages sub-accounts —
  // it never chooses a business playbook — and God/operator is tenant-less; the gate must
  // NO-OP for all of them or it walls a whole tier out of its shell (the peer-gate caught
  // an agency being bounced from /agency → /admin/marketplace with no way back). resolveTierKey
  // is the §60 one home — no hardcoded account_type compare lives here.
  const tierKey = resolveTierKey({
    isPlatformStaff,
    account_type: activeTenant?.account_type ?? null,
    parent_tenant_id: activeTenant?.parent_tenant_id ?? null,
  });
  const gatedTier = tierKey === "solo" || tierKey === "sub_account";
  const setupPath = canonicalSetupPath(tierKey, activeTenant?.account_number);

  // Reachable WHILE gated: the marketplace chooser AND the whole /admin/setup subtree —
  // the real playbook chooser is /admin/setup/playbook, so a gated tenant must be able to
  // move freely through Setup + the marketplace to choose; only OTHER /admin routes bounce
  // them to the chooser. (Without /admin/setup here, the gate bounced tenants away from the
  // very chooser they were sent to find.)
  const onChooser = setupPath != null && location.pathname.startsWith(setupPath);

  // Decide at RENDER time (not in a post-paint effect): a gated tenant then never commits
  // a frame of the dashboard before the bounce (§11/§36 — no flash), and there is no
  // `redirecting` latch that can go stale. Every input is known at render; the marketplace
  // install refreshes tenant context, so the gate re-opens in-session without a reload.
  // NOT redirecting when: still loading (fail open), operator/God (staff), no active tenant
  // (client/anonymous/unresolved), a non-business tier (agency/enterprise), already chose a
  // playbook (grandfathered), or already on the chooser/setup subtree.
  const shouldRedirect =
    !loading && !isPlatformStaff && !!activeTenant && gatedTier && !hasPlaybook && !onChooser;
  if (shouldRedirect) return <Navigate to={setupPath ?? "/choose-account"} replace />;
  return <>{children}</>;
}
