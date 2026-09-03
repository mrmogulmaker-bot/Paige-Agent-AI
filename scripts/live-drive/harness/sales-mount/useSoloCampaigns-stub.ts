// The Campaigns snapshot, stubbed so the routed-capture band and the deals count still render.
// `phase` is what the pipeline-unknown state keys on, so the harness can drive it.
export function useSoloCampaigns() {
  return {
    tenantId: "harness-tenant",
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
