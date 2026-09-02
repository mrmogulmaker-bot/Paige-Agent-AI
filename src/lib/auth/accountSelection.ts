export function shouldOfferAccountPicker({
  activeMembershipCount,
  isPlatformStaff,
}: {
  activeMembershipCount: number;
  isPlatformStaff: boolean;
}): boolean {
  return !isPlatformStaff && activeMembershipCount > 1;
}

export function tenantAccountLabel(accountType: string, parentTenantId: string | null): string {
  if (parentTenantId) return "Sub-account";
  if (accountType === "agency") return "Agency";
  if (accountType === "enterprise") return "Enterprise";
  return "Solo account";
}
