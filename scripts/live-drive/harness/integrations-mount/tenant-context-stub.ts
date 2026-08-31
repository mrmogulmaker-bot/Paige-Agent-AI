/**
 * The tenant seam, answered deterministically. `useTenantContext` reaches auth,
 * membership and act-as state that a local mount has none of; stubbing it keeps
 * the SHIPPED surface and its SHIPPED data hook under measurement while the one
 * thing a harness genuinely cannot supply is answered.
 */
const HARNESS_TENANT = { id: "harness-tenant", account_number: "1971670", name: "Harness workspace" };

export function useTenantContext() {
  return {
    activeTenantId: HARNESS_TENANT.id,
    loading: false,
    activeTenant: HARNESS_TENANT,
    // The roster, because the surface resolves an account's ROUTE ADDRESS by
    // looking its tenant up here. Answering with an `activeTenant` and no list
    // to find it in is a shape the real context never has, and a stub that
    // models the seam inaccurately measures a surface nobody runs.
    tenants: [HARNESS_TENANT],
    isPlatformStaff: false,
  };
}
export default { useTenantContext };
