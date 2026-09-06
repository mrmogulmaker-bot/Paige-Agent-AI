// The Campaigns snapshot, stubbed at the NETWORK boundary only so the Sales Command Desk's pulse,
// readiness ladder, open-work and Scenario Lab render against REAL derivation. `deals`/`stages` feed
// deriveSalesCommand (open-opportunity count, ladder col-1/col-2 split) and the Scenario Lab's own
// evidence read (won/lost close rate). Two modes let the drive prove both scenario evidence states:
//   evidence — a pipeline with enough closed history (won+lost >= 3) so the Evidence-supported path
//              computes and the open tiles show real counts.
//   sparse   — one open deal, no closed history, so the Scenario Lab honestly reports "no evidence"
//              and the open-opportunity tile is unavailable (no typed open stage).
// This is a render, never an authenticated runtime — the honest limit of any frame from here.

export type CampaignsMode = "evidence" | "sparse";

let mode: CampaignsMode = "evidence";
const listeners = new Set<() => void>();

export function setCampaignsHarnessMode(next: CampaignsMode) {
  mode = next;
  listeners.forEach((l) => l());
}

const STAGES = [
  { id: "st-open-1", pipelineId: "pl1", label: "New", description: "", orderIndex: 0, archivedAt: null, movePolicy: "direct" as const, stageType: "open" as const, version: 1 },
  { id: "st-open-2", pipelineId: "pl1", label: "Qualified", description: "", orderIndex: 1, archivedAt: null, movePolicy: "direct" as const, stageType: "open" as const, version: 1 },
  { id: "st-won", pipelineId: "pl1", label: "Won", description: "", orderIndex: 2, archivedAt: null, movePolicy: "direct" as const, stageType: "won" as const, version: 1 },
  { id: "st-lost", pipelineId: "pl1", label: "Lost", description: "", orderIndex: 3, archivedAt: null, movePolicy: "direct" as const, stageType: "lost" as const, version: 1 },
];

const deal = (id: string, stageId: string, clientName: string, nextAction = "") => ({
  id, title: `${clientName} engagement`, pipelineId: "pl1", stageId, clientId: null, clientName,
  owner: "Owner not recorded", status: "open", source: "Discovery form", nextAction,
  updatedAt: "2026-09-01T12:00:00Z", version: 1, history: [] as { summary: string; createdAt: string }[],
});

// evidence: 3 open (2 in first open stage, 1 in the later one) + 2 won + 2 lost → 50% close, 3 opps.
const EVIDENCE_DEALS = [
  deal("d1", "st-open-1", "Northwind Studio", "Send the proposal"),
  deal("d2", "st-open-1", "Cedar & Co", "Book the discovery call"),
  deal("d3", "st-open-2", "Harbor Collective", "Confirm scope"),
  deal("d4", "st-won", "Atlas Advisory"),
  deal("d5", "st-won", "Bright Path"),
  deal("d6", "st-lost", "Vela Group"),
  deal("d7", "st-lost", "Quill Partners"),
];

// sparse: one untyped open deal (no stages) → no close-rate evidence, no typed open stage.
const SPARSE_DEALS = [deal("d1", "st-none", "Northwind Studio", "Send the proposal")];

export function useSoloCampaigns() {
  const React = (globalThis as { __React?: typeof import("react") }).__React!;
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const listener = () => force((n: number) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const rich = mode === "evidence";
  return {
    tenantId: "harness-tenant",
    phase: "ready",
    campaigns: [],
    artifacts: [],
    submissions: [
      { id: "s1", source: "Discovery intake form", createdAt: "2026-08-28T12:00:00Z", contactId: "c1", dealId: null },
    ],
    pipelineWorkspace: {
      canManage: true, canArchiveFolders: true, folders: [], pipelines: [],
      stages: rich ? STAGES : [],
      deals: rich ? EVIDENCE_DEALS : SPARSE_DEALS,
    },
    pipelineAction: async () => ({ ok: true, message: "" }),
    retry: () => {},
  };
}
