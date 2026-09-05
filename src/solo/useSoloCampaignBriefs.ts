// Campaigns -> Overview: the tenant-safe Campaign BRIEF read/write seam.
//
// WHY ITS OWN HOOK (not a fifth read in useSoloCampaigns). `growth2.contract.test.tsx` asserts the
// campaigns adapter performs EXACTLY four `.eq("tenant_id", activeTenantId)` reads — a fail-closed
// guard worth keeping sharp. Briefs read through the governed RPC `get_campaign_briefs` (no `.eq`,
// like `get_pipeline_workspace`), so that assertion is untouched, and this keeps the diff off the
// hot `useSoloCampaigns.ts`. Same pattern the offers hook (`useCatalogOffers`) established.
//
// TRUTH BOUNDARY (§13/§70). A brief is an OWNER-AUTHORED planning record. It is not proof of a live
// campaign, and this hook computes no counts, revenue, reach, attribution, ad spend, audience size,
// active status, or completion. The only numbers it surfaces are `pipelineDealCount` — a real
// tenant-scoped read the RPC performs against `deals` for a LINKED pipeline — and the linked
// offer/pipeline NAMES, each resolved server-side within the same tenant. All writes flow through
// the SECURITY DEFINER RPC `configure_campaign_brief` (tenant re-resolved from auth, role-gated,
// version-checked, idempotent). Every error token the RPC can raise is mapped to a sentence below
// (pg-token parity).
import { useCallback, useEffect, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";

export type BriefLifecycle =
  | "draft" | "ready_for_review" | "blocked" | "approved" | "active" | "paused" | "completed" | "archived";

export type CampaignBrief = {
  readonly id: string;
  readonly shortRef: string | null;
  readonly name: string;
  readonly objective: string | null;
  readonly audience: string | null;
  readonly positioning: string | null;
  /** Intended distribution — INTENT, never proof anything published. */
  readonly channels: readonly string[];
  readonly desiredOutcome: string | null;
  readonly successDefinition: string | null;
  /** A target the owner set — never actual ad spend, a forecast, or connected media buying. */
  readonly budgetTarget: string | null;
  readonly timing: string | null;
  readonly constraints: string | null;
  readonly contentNeeds: string | null;
  readonly conversionDestination: string | null;
  readonly followupPath: string | null;
  readonly lifecycleStatus: BriefLifecycle;
  readonly blocker: string | null;
  readonly offerId: string | null;
  /** Resolved server-side, scoped to the same tenant. Null when unlinked or the offer is gone. */
  readonly offerName: string | null;
  readonly pipelineId: string | null;
  readonly pipelineName: string | null;
  /** A real tenant-scoped count of `deals` on the linked pipeline. `0` when unlinked. */
  readonly pipelineDealCount: number;
  readonly missionId: string | null;
  readonly version: number;
  readonly createdThrough: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/** What the builder collects. Empty strings, not absent — a draft is what a person typed. */
export type BriefDraft = {
  readonly id: string | null;
  readonly expectedVersion: number | null;
  readonly name: string;
  readonly objective: string;
  readonly audience: string;
  readonly positioning: string;
  readonly channels: readonly string[];
  readonly desiredOutcome: string;
  readonly successDefinition: string;
  readonly budgetTarget: string;
  readonly timing: string;
  readonly constraints: string;
  readonly contentNeeds: string;
  readonly conversionDestination: string;
  readonly followupPath: string;
  readonly offerId: string | null;
  readonly pipelineId: string | null;
};

export type BriefWriteResult = {
  readonly ok: boolean;
  readonly message: string;
  /** True on an optimistic-concurrency refusal — offer a reload, never a blind retry. */
  readonly stale?: boolean;
  readonly data?: Record<string, unknown>;
};

export type SoloCampaignBriefsState = {
  readonly tenantId: string | null;
  readonly phase: "resolving" | "loading" | "ready" | "error" | "unavailable";
  readonly briefs: readonly CampaignBrief[];
  readonly archivedCount: number;
  /** True only for a tenant admin/owner. The desk removes governed acts when false. */
  readonly canManage: boolean;
  readonly retry: () => void;
  readonly saveBrief: (draft: BriefDraft) => Promise<BriefWriteResult>;
  readonly transitionBrief: (briefId: string, status: BriefLifecycle, expectedVersion: number, blocker?: string) => Promise<BriefWriteResult>;
  readonly archiveBrief: (briefId: string, expectedVersion: number) => Promise<BriefWriteResult>;
};

const EMPTY = { briefs: [] as readonly CampaignBrief[], archivedCount: 0, canManage: false };

const LIFECYCLES: readonly BriefLifecycle[] =
  ["draft", "ready_for_review", "blocked", "approved", "active", "paused", "completed", "archived"];

// pg-token parity: every token `configure_campaign_brief` can raise is mapped to a sentence a
// person can act on. A raised token with no branch here would fall through to the generic line,
// which tells the user nothing about why the save was refused (§36/§70).
function messageFor(detail: string): { message: string; stale: boolean } {
  const has = (token: string) => detail.includes(token);
  if (has("CAMPAIGN_BRIEF_VERSION_CONFLICT")) return { message: "This brief changed somewhere else. It was refreshed; review the current version before saving again.", stale: true };
  if (has("CAMPAIGN_BRIEF_OFFER_TENANT_MISMATCH")) return { message: "That offer is not available to this workspace. Nothing was saved.", stale: false };
  if (has("CAMPAIGN_BRIEF_PIPELINE_TENANT_MISMATCH")) return { message: "That pipeline is not available to this workspace. Nothing was saved.", stale: false };
  if (has("CAMPAIGN_BRIEF_NAME_REQUIRED")) return { message: "A campaign brief needs a name before it can be saved.", stale: false };
  if (has("CAMPAIGN_BRIEF_NOT_FOUND")) return { message: "That brief is no longer available in this workspace. Nothing was changed.", stale: false };
  if (has("CAMPAIGN_BRIEF_STATUS_INVALID")) return { message: "That is not a status a brief can move to. Nothing was changed.", stale: false };
  if (has("CAMPAIGN_BRIEF_IDEMPOTENCY_CONFLICT")) return { message: "That action was already recorded with different details. Reload and try again.", stale: false };
  if (has("CAMPAIGN_BRIEF_IDEMPOTENCY_REQUIRED")) return { message: "That change could not be saved. Nothing else was changed.", stale: false };
  if (has("CAMPAIGN_BRIEF_ACTOR_INVALID")) return { message: "That change could not be saved. Nothing else was changed.", stale: false };
  if (has("CAMPAIGN_BRIEF_ACTION_INVALID")) return { message: "That change could not be saved. Nothing else was changed.", stale: false };
  if (has("CAMPAIGN_BRIEF_FORBIDDEN")) return { message: "You do not have permission to change campaign briefs in this workspace, and the server refused the change.", stale: false };
  return { message: "That change could not be saved. Nothing else was changed.", stale: false };
}

type BriefRow = Record<string, unknown>;

function narrowLifecycle(value: unknown): BriefLifecycle {
  return typeof value === "string" && (LIFECYCLES as readonly string[]).includes(value) ? (value as BriefLifecycle) : "draft";
}
function mapBrief(row: BriefRow): CampaignBrief {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const channels = Array.isArray(row.channels) ? (row.channels as unknown[]).filter((c): c is string => typeof c === "string") : [];
  return {
    id: String(row.id ?? ""),
    shortRef: str(row.short_ref),
    name: typeof row.name === "string" ? row.name : "",
    objective: str(row.objective),
    audience: str(row.audience),
    positioning: str(row.positioning),
    channels,
    desiredOutcome: str(row.desired_outcome),
    successDefinition: str(row.success_definition),
    budgetTarget: str(row.budget_target),
    timing: str(row.timing),
    constraints: str(row.constraints),
    contentNeeds: str(row.content_needs),
    conversionDestination: str(row.conversion_destination),
    followupPath: str(row.followup_path),
    lifecycleStatus: narrowLifecycle(row.lifecycle_status),
    blocker: str(row.blocker),
    offerId: str(row.offer_id),
    offerName: str(row.offer_name),
    pipelineId: str(row.pipeline_id),
    pipelineName: str(row.pipeline_name),
    pipelineDealCount: typeof row.pipeline_deal_count === "number" ? row.pipeline_deal_count : Number(row.pipeline_deal_count ?? 0) || 0,
    missionId: str(row.mission_id),
    version: typeof row.version === "number" ? row.version : Number(row.version ?? 1) || 1,
    createdThrough: str(row.created_through),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function useSoloCampaignBriefs(): SoloCampaignBriefsState {
  const { activeTenantId, accountContextLoading } = useTenantContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<Omit<SoloCampaignBriefsState, "retry" | "saveBrief" | "transitionBrief" | "archiveBrief">>({
    tenantId: activeTenantId ?? null,
    phase: accountContextLoading ? "resolving" : "loading",
    ...EMPTY,
  });
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

  const run = useCallback(async (command: Record<string, unknown>): Promise<BriefWriteResult> => {
    if (!activeTenantId) return { ok: false, message: "This workspace could not be resolved, so nothing was saved." };
    const { data, error } = await supabase.rpc(
      "configure_campaign_brief" as never,
      { _tenant_id: activeTenantId, _command: command, _idempotency_key: crypto.randomUUID(), _actor_kind: "human" } as never,
    );
    if (error) {
      console.error("[campaign-briefs] configure failed", { command: command.type, error });
      const { message, stale } = messageFor(String(error.message || ""));
      setRefreshKey((key) => key + 1);
      return { ok: false, message, stale };
    }
    setRefreshKey((key) => key + 1);
    const payload = (data ?? {}) as Record<string, unknown>;
    return { ok: payload.ok !== false, message: typeof payload.message === "string" ? payload.message : "Saved.", data: payload };
  }, [activeTenantId]);

  const saveBrief = useCallback((draft: BriefDraft) => run({
    type: draft.id ? "update_brief" : "create_brief",
    ...(draft.id ? { briefId: draft.id, expectedVersion: draft.expectedVersion } : {}),
    name: draft.name,
    objective: draft.objective || null,
    audience: draft.audience || null,
    positioning: draft.positioning || null,
    channels: draft.channels,
    desiredOutcome: draft.desiredOutcome || null,
    successDefinition: draft.successDefinition || null,
    budgetTarget: draft.budgetTarget || null,
    timing: draft.timing || null,
    constraints: draft.constraints || null,
    contentNeeds: draft.contentNeeds || null,
    conversionDestination: draft.conversionDestination || null,
    followupPath: draft.followupPath || null,
    offerId: draft.offerId,
    pipelineId: draft.pipelineId,
  }), [run]);

  const transitionBrief = useCallback((briefId: string, status: BriefLifecycle, expectedVersion: number, blocker?: string) =>
    run({ type: "transition_brief", briefId, status, expectedVersion, ...(blocker ? { blocker } : {}) }), [run]);

  const archiveBrief = useCallback((briefId: string, expectedVersion: number) =>
    run({ type: "archive_brief", briefId, expectedVersion }), [run]);

  useEffect(() => {
    let current = true;
    if (accountContextLoading) { setState({ tenantId: activeTenantId ?? null, phase: "resolving", ...EMPTY }); return () => { current = false; }; }
    if (!activeTenantId) { setState({ tenantId: null, phase: "unavailable", ...EMPTY }); return () => { current = false; }; }

    setState({ tenantId: activeTenantId, phase: "loading", ...EMPTY });
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_campaign_briefs" as never, { _tenant_id: activeTenantId } as never);
        if (error) throw error;
        if (!current) return;
        const payload = (data ?? {}) as { can_manage?: boolean; archived_count?: number; briefs?: BriefRow[] };
        setState({
          tenantId: activeTenantId,
          phase: "ready",
          briefs: (payload.briefs ?? []).map(mapBrief),
          archivedCount: typeof payload.archived_count === "number" ? payload.archived_count : 0,
          canManage: payload.can_manage === true,
        });
      } catch (error) {
        console.error("[campaign-briefs] tenant-scoped read failed", error);
        if (current) setState({ tenantId: activeTenantId, phase: "error", ...EMPTY });
      }
    })();
    return () => { current = false; };
  }, [activeTenantId, accountContextLoading, refreshKey]);

  // Synchronous tenant guard — mirrors useSoloCampaigns/useCatalogOffers. On the paint where
  // activeTenantId changes IN PLACE (an operator's switchTenant, no remount), never show the
  // previous workspace's briefs.
  const synchronousTenantId = activeTenantId ?? null;
  const visible = state.tenantId === synchronousTenantId ? state : {
    tenantId: synchronousTenantId,
    phase: accountContextLoading ? "resolving" as const : synchronousTenantId ? "loading" as const : "unavailable" as const,
    ...EMPTY,
  };
  return { ...visible, retry, saveBrief, transitionBrief, archiveBrief };
}
