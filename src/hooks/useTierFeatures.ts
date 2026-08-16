/**
 * useTierFeatures — the ONE hook render gates call to ask "does the CURRENT
 * account type get this feature?" (§60 same-tier feature parity).
 *
 * It reads the already-resolved `useTenantContext()` state, builds the
 * `TierClassification`, and answers through the §60 baseline in
 * `@/lib/tier/tierFeatures`. A render gate does `const { has } = useTierFeatures()`
 * then `has("customer_portal_invite")` — never an inline account-type equality
 * check (which the `lint:tier-features` CI guard rejects).
 *
 * EXTENSIBILITY (§2 opt-in layering): today `customer_portal_invite` is pure
 * baseline, so `has()` returns the baseline answer directly. When a feature can
 * be UNLOCKED per-tenant (a Marketplace install / Playbook toggle read from
 * `tenants.features`), that opt-in set would be UNIONED on top here — i.e.
 * `baseline.has(f) || optIns.has(f)` — keeping this the single call site so no
 * gate ever re-derives the merge. Kept simple until such a feature exists.
 */

import { useMemo } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  getTierFeatureSet,
  resolveTierKey,
  isSoloStandalone,
  type Feature,
  type TierClassification,
  type TierKey,
} from "@/lib/tier/tierFeatures";

export function useTierFeatures(): {
  has: (f: Feature) => boolean;
  tierKey: TierKey;
  /** STRICT literal-standalone gate (§51/§58) — see isSoloStandalone. Rejects null/unknown. */
  soloStandalone: boolean;
  loading: boolean;
} {
  const { activeTenant, isPlatformStaff, loading } = useTenantContext();

  return useMemo(() => {
    const classification: TierClassification = {
      account_type: activeTenant?.account_type ?? null,
      parent_tenant_id: activeTenant?.parent_tenant_id ?? null,
      isPlatformStaff,
    };
    const baseline = getTierFeatureSet(classification);
    return {
      // baseline-only today; an opt-in `∪` would layer in here (see file header).
      has: (f: Feature) => baseline.has(f),
      tierKey: resolveTierKey(classification),
      soloStandalone: isSoloStandalone(classification),
      // Surfaced so route guards (RequireFeature) can hold before the tenant
      // resolves — while loading, `activeTenant` is null and the classification
      // defaults to the permissive `solo` tier, so a gate must NOT decide yet.
      loading,
    };
  }, [activeTenant?.account_type, activeTenant?.parent_tenant_id, isPlatformStaff, loading]);
}
