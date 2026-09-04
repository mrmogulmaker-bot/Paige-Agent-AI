import { getHarnessTenant } from "./useSoloSalesOps-stub";
// The Campaigns snapshot, stubbed so the routed-capture band and the deals count still render.
// `phase` is what the pipeline-unknown state keys on, so the harness can drive it.
export function useSoloCampaigns() {
  const React = (globalThis as { __React?: typeof import("react") }).__React!;
  const [, force] = React.useState(0);
  React.useEffect(()=>{ const listener=()=>force(n=>n+1); window.addEventListener("sales-harness-tenant",listener); return()=>window.removeEventListener("sales-harness-tenant",listener); },[]);
  return {
    tenantId: getHarnessTenant(),
    phase: "ready",
    campaigns: [],
    artifacts: [],
    submissions: [
      { id: "s1", source: "Discovery intake form", createdAt: "2026-08-28T12:00:00Z", contactId: "c1", dealId: null },
    ],
    pipelineWorkspace: {
      canManage: true, canArchiveFolders: true, folders: [], pipelines: [], stages: [],
      deals: [{ id: "d1", title: "Onboarding work", clientName: "A client", status: "open" }],
    },
    pipelineAction: async () => ({ ok: true, message: "" }),
    retry: () => {},
  };
}
