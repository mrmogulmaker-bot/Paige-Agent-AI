import { isSoloStandalone, type TierClassification } from "@/lib/tier/tierFeatures";

export type CanonicalSoloTenant = TierClassification & {
  account_number?: number | null;
};

export type CanonicalSoloHandoff =
  | { kind: "not_solo" }
  | { kind: "redirect"; target: string }
  | { kind: "blocked_address" };

export type CanonicalSoloAdminOwnerDecision =
  | CanonicalSoloHandoff
  | { kind: "resolving" }
  | { kind: "blocked_context" };

type CanonicalSoloAdminOwnerInput = {
  accountContextLoading: boolean;
  accountContextStatus: "resolving" | "signed_out" | "error" | "ready";
  tierLoading: boolean;
  isPlatformStaff: boolean;
  activeTenant: Omit<CanonicalSoloTenant, "isPlatformStaff"> | null;
};

/**
 * One idempotent classifier owns canonical Solo eligibility. Tenant names,
 * plans, feature JSON, entitlements, fixture state, and URL parameters are not
 * inputs because none may select a different shell or responsive system.
 */
export function isCanonicalSoloTenant(tenant: CanonicalSoloTenant): boolean {
  return isSoloStandalone(tenant);
}

/** The canonical address changes by account; the application template does not. */
export function resolveCanonicalSoloHome(tenant: CanonicalSoloTenant): string | null {
  if (!isCanonicalSoloTenant(tenant)) return null;
  const accountNumber = tenant.account_number;
  if (!Number.isSafeInteger(accountNumber) || Number(accountNumber) <= 0) return null;
  return `/solo/${accountNumber}/command-center`;
}

export function resolveCanonicalSoloHandoff(tenant: CanonicalSoloTenant): CanonicalSoloHandoff {
  if (!isCanonicalSoloTenant(tenant)) return { kind: "not_solo" };
  const target = resolveCanonicalSoloHome(tenant);
  return target ? { kind: "redirect", target } : { kind: "blocked_address" };
}

/**
 * Admin may enter a legacy owner only after server-backed account topology is
 * ready. A cold-load race or resolver error must never choose a shell.
 */
export function resolveCanonicalSoloAdminOwner({
  accountContextLoading,
  accountContextStatus,
  tierLoading,
  isPlatformStaff,
  activeTenant,
}: CanonicalSoloAdminOwnerInput): CanonicalSoloAdminOwnerDecision {
  if (accountContextLoading || accountContextStatus === "resolving" || tierLoading) {
    return { kind: "resolving" };
  }
  if (accountContextStatus !== "ready") return { kind: "blocked_context" };
  if (!activeTenant) {
    return isPlatformStaff ? { kind: "not_solo" } : { kind: "blocked_context" };
  }
  return resolveCanonicalSoloHandoff({ isPlatformStaff, ...activeTenant });
}
