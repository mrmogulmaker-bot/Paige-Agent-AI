// The §60 tier gate, stubbed for the harness.
//
// The real hook reads `useTenantContext()`, which requires a <TenantProvider> and a live session.
// The harness has neither by design — it mounts the shipped surface with only the network boundary
// replaced. Without this stub the whole Sales surface throws on mount ("useTenantContext must be
// used within a <TenantProvider>"), which is exactly what happened when the Agreements work added
// the gate: two shipped drives (`sales-ops-drive.mjs`, `sales-usability-drive.mjs`) stopped
// mounting. Found by running them, not by reading the diff.
//
// It answers through the REAL §60 baseline in `@/lib/tier/tierFeatures` rather than hardcoding
// `true`. A stub that just says yes would render a Solo surface that no tier check could ever
// disprove, and the frames would prove nothing about the gate.
import { useMemo } from "react";
import {
  getTierFeatureSet,
  resolveTierKey,
  isSoloStandalone,
  type Feature,
  type TierClassification,
  type TierKey,
} from "@/lib/tier/tierFeatures";

/** Solo standalone: the tier this surface is built for, and the one the drives frame. */
const CLASSIFICATION: TierClassification = {
  accountType: "standalone",
  parentTenantId: null,
  isPlatformStaff: false,
};

let classification: TierClassification = CLASSIFICATION;

/** Lets a drive frame another tier — an Agency must be able to prove it does NOT get this. */
export function setTierHarnessClassification(next: TierClassification) {
  classification = next;
}

export function useTierFeatures(): {
  has: (f: Feature) => boolean;
  tierKey: TierKey;
  soloStandalone: boolean;
  loading: boolean;
} {
  return useMemo(() => {
    const set = getTierFeatureSet(classification);
    return {
      has: (f: Feature) => set.has(f),
      tierKey: resolveTierKey(classification),
      soloStandalone: isSoloStandalone(classification),
      loading: false,
    };
  }, []);
}
