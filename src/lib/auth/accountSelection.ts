export function shouldOfferAccountPicker({
  activeMembershipCount,
  isPlatformStaff,
}: {
  activeMembershipCount: number;
  isPlatformStaff: boolean;
}): boolean {
  // The in-workspace exit control appears only when another context is available.
  // Platform staff always have Platform as that distinct peer context.
  return isPlatformStaff || activeMembershipCount > 1;
}

export function shouldPauseForWorkspaceChoiceAtLogin({
  activeMembershipCount,
  isPlatformStaff,
}: {
  activeMembershipCount: number;
  isPlatformStaff: boolean;
}): boolean {
  // Fresh authentication is a deliberate scope-selection boundary. Unlike the
  // in-workspace exit control, one active membership is still a real choice card:
  // the person confirms where they are entering before tenant context changes.
  return isPlatformStaff || activeMembershipCount > 0;
}

export function tenantAccountLabel(accountType: string, parentTenantId: string | null): string {
  if (parentTenantId) return "Sub-account";
  if (accountType === "agency") return "Agency";
  if (accountType === "enterprise") return "Enterprise";
  return "Solo account";
}
