export function useTenantContext() {
  const alternate = new URLSearchParams(window.location.search).get("context") === "alternate";
  const id = alternate ? "team-harness-alternate" : "team-harness-tenant";
  return { activeTenantId: id, activeTenant: { id, name: alternate ? "Known-good alternate" : "Northstar Studio" }, tenants: [], loading: false, isPlatformStaff: false };
}
export default { useTenantContext };
