import type { SpineCapability } from "../contracts.ts";
import { classifyAction } from "../../action-risk.ts";
import { CRM_ACTION_CAPABILITY, type CrmAction } from "../../crm-command/catalog.ts";

/** Existing Pipeline-owned successful deal-stage Rail outcomes; no new mutation. */
export const PIPELINE_DEAL_STAGE_EVIDENCE = {
  key: "pipeline.deal_stage_evidence",
  domain: "pipeline",
  owner: "solo-pipeline",
  humanSurface: "/solo/:account/growth/pipeline",
  evidence: {
    signalKinds: ["pipeline.deal_stage_moved"],
    adapter: "public.get_pipeline_spine_evidence",
    audience: "owner_internal",
    freshness: "available for 30 days, stale through the 365-day projection window, then excluded",
    staleAfterDays: 30,
    projectionWindowDays: 365,
    sourceSystem: "context_rail",
    sourceActorTypes: ["person", "paige"],
    classification: "operational",
    lifecycle: "observed",
    safeSummary: "A pipeline stage changed.",
    referencePrefix: "rail:",
    factValues: {
      change_type: ["stage_changed"],
      outcome: ["succeeded"],
      actor: ["person", "paige"],
    },
  },
  action: {
    classification: "read",
    executor: "public.get_pipeline_spine_evidence",
    idempotency: "read-only resolver; source rows are unique by Rail event id",
    riskPolicyKey: "read_only",
    approvalAuthority: "none",
  },
  outcome: {
    kinds: ["observed"],
    projector: "public.get_pipeline_spine_evidence",
    railVisibility: "owner_internal",
  },
  chatBinding: "PARTIAL",
  // PARTIAL, not LIVE: the Mind projection, its citation and its read-only framing are
  // implemented and covered by focused tests, but no authenticated end-to-end proof
  // exists yet. LIVE requires that drive, not this declaration.
  mindBinding: "PARTIAL",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;

const PIPELINE_ACTIONS = (Object.keys(CRM_ACTION_CAPABILITY) as CrmAction[]).filter((action) => action.startsWith("deal."));
const pipelineRisk = (tool: string): "ordinary" | "high" => {
  const risk = classifyAction(tool);
  if (risk !== "ordinary" && risk !== "high") throw new Error(`Pipeline CRM Spine action ${tool} is not classified`);
  return risk;
};

/** Deal lifecycle commands reuse the canonical Pipeline transaction and its existing Rails. */
export const PIPELINE_CRM_ACTIONS = PIPELINE_ACTIONS.map((action) => {
  const tool = CRM_ACTION_CAPABILITY[action];
  return {
    key: `pipeline.${tool}`,
    domain: "pipeline",
    owner: "solo-pipeline",
    humanSurface: "/solo/:account/growth/pipeline",
    action: {
      classification: "mutate",
      executor: "public.execute_crm_command",
      idempotency: "tenant + actor + caller-settled request key layered over the canonical Pipeline command ledger",
      riskPolicyKey: pipelineRisk(tool),
      approvalAuthority: "chat-canonical",
      chatTool: tool,
    },
    outcome: { kinds: ["observed"], projector: "public.record_capability_run", railVisibility: "owner_internal" },
    chatBinding: "LIVE",
    mindBinding: "UNAVAILABLE",
    sharedPrimitiveChange: "NONE",
    maturity: "PARTIAL",
  } as const satisfies SpineCapability;
});
