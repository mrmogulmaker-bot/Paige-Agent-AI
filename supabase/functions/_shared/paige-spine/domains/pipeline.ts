import type { SpineCapability } from "../contracts.ts";

/**
 * First Spine vertical slice. The durable source is the existing Pipeline-owned
 * Rail event emitted only after a successful deal-stage transition.
 *
 * This declaration activates no new mutation. Pipeline's domain-held approval
 * semantics must be reconciled by the PAIGE Chat owner before a mutating
 * capability can be registered safely.
 */
export const PIPELINE_DEAL_STAGE_EVIDENCE = {
  key: "pipeline.deal_stage_evidence",
  domain: "pipeline",
  owner: "solo-pipeline",
  humanSurface: "/solo/:account/growth/pipeline",
  evidence: {
    signalKinds: ["pipeline.deal_stage_moved"],
    adapter: "public.get_pipeline_spine_evidence",
    audience: "owner_internal",
    freshness: "available for 30 days, stale through 365 days, then excluded",
    staleAfterDays: 30,
    retentionDays: 365,
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
  chatBinding: "UNAVAILABLE",
  mindBinding: "UNAVAILABLE",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;
