export function useTenantContext() {
  return { activeTenantId: "team-harness-tenant", activeTenant: { id: "team-harness-tenant", name: "Northstar Studio" }, tenants: [], loading: false, isPlatformStaff: false };
}
export default { useTenantContext };
