export function shouldOfferAccountPicker({
  activeMembershipCount,
  isPlatformStaff,
}: {
  activeMembershipCount: number;
  isPlatformStaff: boolean;
}): boolean {
  // Platform staff always have a distinct Platform context in addition to any
  // directly held tenant memberships. A fresh sign-in must pause so they choose
  // that context explicitly instead of being routed into Platform automatically.
  return isPlatformStaff || activeMembershipCount > 1;
}

export function tenantAccountLabel(accountType: string, parentTenantId: string | null): string {
  if (parentTenantId) return "Sub-account";
  if (accountType === "agency") return "Agency";
  if (accountType === "enterprise") return "Enterprise";
  return "Solo account";
}
