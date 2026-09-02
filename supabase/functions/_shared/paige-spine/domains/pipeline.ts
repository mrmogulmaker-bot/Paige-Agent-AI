import type { SpineCapability } from "../contracts.ts";

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
  mindBinding: "UNAVAILABLE",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;
