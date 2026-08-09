// Tenant-switch persistence guard, shared by useTenantContext.
//
// NOTE (wave-s3 §18/§37 cleanup): the operator "Fleet → Communications" surface no longer
// scope-switches the operator into a tenant, so the old workspace-resolver helpers
// (FLEET_COMMUNICATIONS_DESTINATION, parseOperatorWorkspace) and the backing RPC
// resolve_platform_operator_workspace were removed as dead code. Only the generic
// tenant-switch persistence check below remains — it is still used by useTenantContext.

export function tenantSwitchPersisted(
  expectedUserId: string,
  row: { user_id?: string } | null,
  error: unknown,
): boolean {
  return !error && row?.user_id === expectedUserId;
}
