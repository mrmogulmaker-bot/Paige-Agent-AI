// RequireSetupComplete — the Setup gate (owner directive, 2026-08-16;
// ACCESS RULE SUPERSEDED for Solo by owner adjudication 2026-09-19).
//
// ── THE CURRENT OWNER RULE (2026-09-19): SETUP IS NOT AN ACCESS GATE ──
// No Solo account may be blocked from the PAIGE application or PAIGE Chat
// because Setup has not been completed. Setup is an optional guided
// configuration surface, a place to review/edit business context, something
// PAIGE can help the owner complete conversationally, and a source of richer
// context/readiness — never an application-access, PAIGE-Chat, or Command
// Center prerequisite. Blocking PAIGE because the facts PAIGE can help
// collect were not entered manually is contradictory by construction.
//
// Consequences of that rule, implemented here:
//   • The SOLO tier NEVER redirects. An incomplete Solo owner lands on the
//     destination they requested; the canonical shell loads normally;
//     Setup stays reachable from Settings; and a NON-BLOCKING readiness
//     banner surfaces the incomplete state (dismissible, role=status —
//     visibility of readiness debt, not an obstacle).
//   • Historical markers are no longer access tokens. features.playbook /
//     features.playbook_config (admin-marketplace era) and
//     features.solo_setup_complete (canonical V3 marker, #826/#1269) remain
//     valid business/readiness data, but for Solo they no longer select
//     product access — a playbook-holding legacy tenant and a fresh
//     zero-save tenant resolve through the EXACT same routing contract, so
//     historical account state cannot grant or deny the current shell.
//   • The gate is NOT removed for the SUB-ACCOUNT tier: /business keeps its
//     original redirect contract (this adjudication covers Solo only), and
//     Agency / Platform Operator were never gated (§61) and stay untouched.
//
// SETUP-COMPLETE SIGNAL (kept as READINESS state, not authority):
// `features.playbook` (non-empty) OR `features.playbook_config` present OR
// `features.solo_setup_complete === true`. The first two were written by the
// retired admin marketplace (#995); the third is written by the canonical V3
// setup journey itself (the solo_setup_completion_marker trigger fires in the
// same commit as a successful save, #826/#1269). Completing Setup still
// matters — it enriches PAIGE's context and retires the banner — but it no
// longer opens or closes any door for Solo.
//
// NO-OP (never redirects, never bannering) for, by construction:
//   • platform operators / God / super_admin / platform_admin (isPlatformStaff);
//   • clients & anonymous — no active operator tenant in this context;
//   • the agency/enterprise manager tiers (§61).
//
// FAIL OPEN by construction (§13/§32): renders children immediately and only
// acts after the tenant context has resolved (loading === false) AND a real
// active tenant exists. While loading, no active tenant, or staff → children
// render untouched, so a false negative can never strand a real user.
import { Navigate, useLocation } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { resolveTierKey } from "@/lib/tier/tierFeatures";

// Pure route policy is exported for regression tests; it has no React state or side effects.
// eslint-disable-next-line react-refresh/only-export-components
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

/** The setup-completion READINESS signal, as one pure predicate. This is
 *  context/readiness state, NEVER Solo access authority (owner adjudication
 *  2026-09-19): the sub-account redirect below and the Solo shell's
 *  non-blocking reminder (SoloApp) both consume it as data. */
// eslint-disable-next-line react-refresh/only-export-components
export function isSoloSetupComplete(features: Record<string, unknown> | null | undefined): boolean {
  const playbookSlug = features?.playbook;
  return (
    (typeof playbookSlug === "string" && playbookSlug.trim().length > 0) ||
    (features != null && Object.prototype.hasOwnProperty.call(features, "playbook_config")) ||
    features?.solo_setup_complete === true
  );
}

export function RequireSetupComplete({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { loading, isPlatformStaff, activeTenant } = useTenantContext();

  // Setup-complete = a chosen playbook slug, a playbook_config object, or the
  // canonical V3 setup journey's own completion marker (#826/#1269). This is
  // READINESS state only — under the 2026-09-19 owner rule it never decides
  // Solo product access (it still steers the sub-account redirect, which this
  // adjudication leaves intact).
  const hasPlaybook = isSoloSetupComplete(activeTenant?.features);

  // §51/§61/§60: resolveTierKey is the one home for tier resolution — no
  // hardcoded account_type compare lives here.
  const tierKey = resolveTierKey({
    isPlatformStaff,
    account_type: activeTenant?.account_type ?? null,
    parent_tenant_id: activeTenant?.parent_tenant_id ?? null,
  });

  // ── THE SOLO CONTRACT (owner adjudication 2026-09-19): never redirect. ──
  // The gate renders the children and NOTHING ELSE — no sibling element of
  // any kind. The canonical Solo shell owns the viewport (100dvh,
  // overflow:hidden) and its main region owns scrolling, so a sibling here
  // would expand the document past the shell (the layout defect this branch
  // once carried). The non-blocking readiness reminder lives INSIDE the
  // shell (SoloApp renders SoloSetupReadinessNotice within its height-owned
  // subtree), fed by the same isSoloSetupComplete readiness predicate.
  // Entitlement/signup gates live OUTSIDE this component (App.tsx wraps
  // /solo in RequireCompleteSignup → RequireSoloBetaEntitlement → this) and
  // are untouched by this rule.
  if (tierKey === "solo") {
    return <>{children}</>;
  }

  // ── SUB-ACCOUNT: the original redirect contract, unchanged (the chooser
  // lives at the setup path, which stays reachable while gated — §36). ──
  const gatedTier = tierKey === "sub_account";
  const setupPath = canonicalSetupPath(tierKey, activeTenant?.account_number);
  const onChooser = setupPath != null && location.pathname.startsWith(setupPath);

  const shouldRedirect =
    !loading && !isPlatformStaff && !!activeTenant && gatedTier && !hasPlaybook && !onChooser;
  if (shouldRedirect) return <Navigate to={setupPath ?? "/choose-account"} replace />;
  return <>{children}</>;
}
