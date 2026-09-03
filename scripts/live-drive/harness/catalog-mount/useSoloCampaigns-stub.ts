// The Vibe-owned half, stubbed so the Published-assets section still renders in the harness.
export function useSoloCampaigns() {
  return {
    tenantId: "t", phase: "ready", campaigns: [], submissions: [],
    artifacts: [{
      id: "a1", type: "form", name: "Foundations — application", slug: "foundations-application",
      status: "active", updatedAt: "2026-08-28T16:20:00Z", publicHref: "/form/a1",
      recentSubmissions: 0, routingConfigured: false, routingState: "No route",
      routingTargets: [], recentDispatches: { succeeded: 0, failed: 0, other: 0 }, dispatchStatuses: {},
    }],
    pipelineWorkspace: { canManage: true, canArchiveFolders: true, folders: [], pipelines: [], stages: [], deals: [] },
    pipelineAction: async () => ({ ok: true, message: "" }),
    retry: () => {},
  };
}
