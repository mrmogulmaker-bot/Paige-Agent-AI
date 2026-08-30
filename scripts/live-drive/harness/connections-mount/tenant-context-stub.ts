/**
 * The tenant seam, answered deterministically. `useTenantContext` reaches auth,
 * membership and act-as state that a local mount has none of; stubbing it keeps
 * the SHIPPED surface and its SHIPPED data hook under measurement while the one
 * thing a harness genuinely cannot supply is answered.
 */
export function useTenantContext() {
  return {
    activeTenantId: "harness-tenant",
    loading: false,
    activeTenant: { id: "harness-tenant", account_number: "1971670", name: "Harness workspace" },
    isPlatformStaff: false,
  };
}
export default { useTenantContext };
