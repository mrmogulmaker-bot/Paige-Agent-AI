import { useSyncExternalStore } from "react";

type Mode = "active" | "empty" | "readonly";
const listeners = new Set<() => void>();

const pipeline = { id: "pipeline-1", name: "Client onboarding", description: "A tenant-owned journey from inquiry through a completed handoff.", isDefault: true, lifecycleStatus: "active", version: 4 };
const stages = [
  { id: "stage-1", pipelineId: pipeline.id, label: "New inquiry", description: "Newly captured work", orderIndex: 1, archivedAt: null, movePolicy: "direct", version: 2 },
  { id: "stage-2", pipelineId: pipeline.id, label: "Discovery", description: "Fit and needs review", orderIndex: 2, archivedAt: null, movePolicy: "direct", version: 3 },
  { id: "stage-3", pipelineId: pipeline.id, label: "Owner review", description: "Approval required before entry", orderIndex: 3, archivedAt: null, movePolicy: "approval", version: 2 },
  { id: "stage-4", pipelineId: pipeline.id, label: "Onboarding", description: "Agreed next steps underway", orderIndex: 4, archivedAt: null, movePolicy: "direct", version: 1 },
];
const deals = [
  { id: "deal-1", title: "Website discovery", pipelineId: pipeline.id, stageId: "stage-1", clientName: "Northstar Studio", owner: "Toni", status: "Needs response", source: "Campaign form · recorded", nextAction: "Reply to intake", updatedAt: "2026-08-30T13:20:00Z", version: 3, history: [] },
  { id: "deal-2", title: "Advisory intake", pipelineId: pipeline.id, stageId: "stage-2", clientName: "Juniper & Co.", owner: "PAIGE owner queue", status: "Call scheduled", source: "Direct entry · recorded", nextAction: "Prepare discovery notes", updatedAt: "2026-08-30T10:00:00Z", version: 2, history: [{ id: "h-1", fromStage: "New inquiry", toStage: "Discovery", occurredAt: "2026-08-29T16:30:00Z", actor: "Toni" }] },
  { id: "deal-3", title: "Operations review", pipelineId: pipeline.id, stageId: "stage-3", clientName: "Fieldstone Partners", owner: "Toni", status: "Approval held", source: "Source not recorded", nextAction: "Review requested move", updatedAt: "2026-08-29T18:15:00Z", version: 5, history: [] },
  { id: "deal-4", title: "Welcome sequence", pipelineId: pipeline.id, stageId: "stage-4", clientName: "Cedar Lane", owner: "Toni", status: "In progress", source: "Campaign form · recorded", nextAction: "Confirm kickoff", updatedAt: "2026-08-28T14:45:00Z", version: 1, history: [] },
];

let mode: Mode = "active";
let currentDeals = deals;
let currentPipelines = [pipeline];
let currentStages = stages;
let snapshot = buildSnapshot();

function buildSnapshot() {
  const hasPipeline = mode !== "empty";
  return {
    tenantId: "review-tenant",
    phase: "ready",
    campaigns: [{ id: "campaign-1", name: "Founder services", status: "active", activeCount: 2, completedCount: 0, lastActivityAt: "2026-08-30T13:20:00Z" }],
    artifacts: [{ id: "page-1", type: "form", name: "Discovery intake", slug: "discovery", status: "published", updatedAt: "2026-08-30T13:20:00Z", publicHref: "/p/review/discovery", recentSubmissions: 2, routingConfigured: true, routingState: "Active · one target", routingTargets: ["Client onboarding / New inquiry"], dispatchStatuses: { succeeded: 1, failed: 1 }, recentDispatches: { succeeded: 1, failed: 1, other: 0 } }],
    submissions: [],
    pipelineWorkspace: {
      canManage: mode !== "readonly",
      pipelines: hasPipeline ? currentPipelines : [],
      stages: hasPipeline ? currentStages : [],
      deals: hasPipeline ? currentDeals : [],
    },
    pipelineAction: async (command: Record<string, unknown>) => {
      if (command.type === "create-pipeline") {
        const pipelineId = `pipeline-${currentPipelines.length + 1}`;
        const authoredStages = Array.isArray(command.stages) ? command.stages as Array<{ label: string; description: string; movePolicy: "direct" | "approval" }> : [];
        currentPipelines = [...currentPipelines, { id: pipelineId, name: String(command.name), description: String(command.description ?? ""), isDefault: false, lifecycleStatus: "draft", version: 1 }];
        currentStages = [...currentStages, ...authoredStages.map((stage, index) => ({ id: `${pipelineId}-stage-${index + 1}`, pipelineId, label: stage.label, description: stage.description, orderIndex: index + 1, archivedAt: null, movePolicy: stage.movePolicy, version: 1 }))];
        snapshot = buildSnapshot();
        listeners.forEach((listener) => listener());
        return { ok: true, message: "Local custom pipeline created.", data: { pipeline_id: pipelineId } };
      }
      if (command.type === "move-deal") {
        currentDeals = currentDeals.map((deal) => deal.id === command.dealId ? { ...deal, stageId: String(command.targetStageId), version: deal.version + 1 } : deal);
        snapshot = buildSnapshot();
        listeners.forEach((listener) => listener());
      }
      return { ok: true, message: "Local deterministic review action completed." };
    },
    retry: () => undefined,
  };
}

export function setPipelineHarnessMode(next: Mode) {
  mode = next;
  snapshot = buildSnapshot();
  listeners.forEach((listener) => listener());
}

export function useSoloCampaigns() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot, () => snapshot);
}
