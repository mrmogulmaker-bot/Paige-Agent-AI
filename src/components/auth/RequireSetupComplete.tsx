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
import React, { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
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

export function RequireSetupComplete({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { loading, isPlatformStaff, activeTenant } = useTenantContext();
  // Dismissed per component lifetime (= per shell session): the banner is a
  // readiness reminder, not a persistent obstacle; Setup completion retires
  // it for good via the readiness signal below.
  const [dismissed, setDismissed] = useState(false);

  // Setup-complete = a chosen playbook slug, a playbook_config object, or the
  // canonical V3 setup journey's own completion marker (#826/#1269). This is
  // READINESS state only — under the 2026-09-19 owner rule it never decides
  // Solo product access (it still steers the sub-account redirect, which this
  // adjudication leaves intact).
  const features = activeTenant?.features ?? null;
  const playbookSlug = features?.playbook;
  const hasPlaybook =
    (typeof playbookSlug === "string" && playbookSlug.trim().length > 0) ||
    (features != null && Object.prototype.hasOwnProperty.call(features, "playbook_config")) ||
    features?.solo_setup_complete === true;

  // §51/§61/§60: resolveTierKey is the one home for tier resolution — no
  // hardcoded account_type compare lives here.
  const tierKey = resolveTierKey({
    isPlatformStaff,
    account_type: activeTenant?.account_type ?? null,
    parent_tenant_id: activeTenant?.parent_tenant_id ?? null,
  });

  // ── THE SOLO CONTRACT (owner adjudication 2026-09-19): never redirect. ──
  // An incomplete Solo owner gets the destination they asked for plus a
  // non-blocking readiness banner; a complete one gets the identical shell.
  // Entitlement/signup gates live OUTSIDE this component (App.tsx wraps
  // /solo in RequireCompleteSignup → RequireSoloBetaEntitlement → this) and
  // are untouched by this rule.
  if (tierKey === "solo") {
    const soloSetupPath = canonicalSetupPath(tierKey, activeTenant?.account_number);
    const showBanner =
      !loading && !isPlatformStaff && !dismissed && !!activeTenant && !hasPlaybook && soloSetupPath != null;
    return (
      <>
        {showBanner && (
          <div
            className="setup-readiness-banner"
            data-setup-readiness="incomplete"
            role="status"
            aria-live="polite"
          >
            <span>
              Setup isn&apos;t finished yet — business context makes PAIGE far more useful, and
              PAIGE can help you fill it in.{" "}
              <Link to={soloSetupPath}>Finish setup when you&apos;re ready</Link> — everything
              else works in the meantime.
            </span>
            <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss setup reminder">
              Dismiss
            </button>
          </div>
        )}
        {children}
      </>
    );
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
