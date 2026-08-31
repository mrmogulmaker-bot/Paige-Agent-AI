import { useCallback, useEffect, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";

export type CampaignRecord = {
  id: string;
  name: string;
  status: string;
  activeCount: number | null;
  completedCount: number | null;
  lastActivityAt: string | null;
};

export type CampaignArtifact = {
  id: string;
  type: "page" | "funnel" | "form";
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
  publicHref: string;
  recentSubmissions: number;
  routingConfigured: boolean;
  routingState: "No route" | "Draft route" | "Approval-gated" | "Human-only" | "Approval-gated + human-only" | "Active + approval-gated" | "Active + human-only" | "Active + approval-gated + human-only" | "Active";
  routingTargets: string[];
  recentDispatches: { succeeded: number; failed: number; other: number };
  dispatchStatuses: Record<string, number>;
};

export type CampaignSubmission = {
  id: string;
  formId: string;
  source: string;
  state: string;
  createdAt: string;
  contactId: string | null;
  dealId: string | null;
};

export type SoloCampaignsState = {
  tenantId: string | null;
  phase: "resolving" | "loading" | "ready" | "error" | "unavailable";
  campaigns: CampaignRecord[];
  artifacts: CampaignArtifact[];
  submissions: CampaignSubmission[];
  pipelineWorkspace: PipelineWorkspace;
  pipelineAction: (action: PipelineAction) => Promise<{ ok: boolean; message: string }>;
  retry: () => void;
};

export type PipelineStage = { id: string; pipelineId: string; label: string; description: string; orderIndex: number; archivedAt: string | null };
export type PipelineDeal = { id: string; title: string; pipelineId: string; stageId: string; clientName: string; owner: string; status: string; source: string; nextAction: string; updatedAt: string; portalAvailable: boolean; history: { summary: string; createdAt: string }[] };
export type PipelineRecord = { id: string; name: string; description: string; isDefault: boolean };
export type PipelineWorkspace = { canManage: boolean; pipelines: PipelineRecord[]; stages: PipelineStage[]; deals: PipelineDeal[] };
export type PipelineAction =
  | { type: "create-pipeline"; name: string; description: string; starter: "blank" | "simple" }
  | { type: "update-pipeline"; pipelineId: string; name: string; description: string }
  | { type: "create-stage"; pipelineId: string; label: string; description: string }
  | { type: "update-stage"; stageId: string; label: string; description: string }
  | { type: "archive-stage" | "restore-stage"; stageId: string }
  | { type: "reorder-stages"; pipelineId: string; orderedIds: string[] };

type PageRow = { id: string; slug: string; title: string; status: string; updated_at: string };
type FunnelRow = { id: string; slug: string; name: string; status: string; updated_at: string };
type FormRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  updated_at: string;
};
type SubmissionRow = {
  id: string;
  form_id: string;
  source: string;
  processing_state: string;
  created_at: string;
  contact_id: string | null;
  deal_id: string | null;
};
type RoutingEvidenceRow = {
  id: string;
  form_id: string;
  target_slug: string;
  enabled: boolean;
  effective_autonomy_lane: "auto" | "confirm" | "off";
  dispatch_statuses: Record<string, number> | null;
};
type RoutingEvidencePayload = { routes?: RoutingEvidenceRow[] };
type PipelineWorkspacePayload = {
  can_manage?: boolean;
  pipelines?: { id: string; name: string; description?: string | null; is_default?: boolean }[];
  stages?: { id: string; pipeline_id: string; label: string; description?: string | null; order_index: number; archived_at?: string | null }[];
  deals?: { id: string; title: string; pipeline_id: string; stage_id: string; client_name?: string | null; owner_user_id?: string | null; status?: string | null; source?: string | null; next_action?: string | null; updated_at: string; portal_available?: boolean; history?: { summary: string; createdAt: string }[] }[];
};

const emptyPipeline: PipelineWorkspace = { canManage: false, pipelines: [], stages: [], deals: [] };
const empty = { campaigns: [], artifacts: [], submissions: [], pipelineWorkspace: emptyPipeline };

export function useSoloCampaigns(): SoloCampaignsState {
  const { activeTenantId, activeTenant, accountContextLoading } = useTenantContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<Omit<SoloCampaignsState, "retry" | "pipelineAction">>({
    tenantId: activeTenantId ?? null,
    phase: accountContextLoading ? "resolving" : "loading",
    ...empty,
  });
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);
  const pipelineAction = useCallback(async (action: PipelineAction) => {
    if (!activeTenantId) return { ok: false, message: "No tenant workspace is selected." };
    let name = "";
    let args: Record<string, unknown> = {};
    if (action.type === "create-pipeline") {
      name = "create_tenant_pipeline";
      const stages = action.starter === "simple" ? [
        { label: "New", description: "New work awaiting review", stage_type: "open" },
        { label: "In progress", description: "Work currently moving forward", stage_type: "open" },
        { label: "Complete", description: "Work completed", stage_type: "won" },
      ] : [];
      args = { _tenant_id: activeTenantId, _name: action.name, _description: action.description || null, _stages: stages };
    } else if (action.type === "update-pipeline") {
      name = "update_pipeline_details";
      args = { _pipeline_id: action.pipelineId, _name: action.name, _description: action.description || null };
    } else if (action.type === "create-stage") {
      name = "manage_pipeline_stage";
      args = { _action: "create", _pipeline_id: action.pipelineId, _stage_id: null, _label: action.label, _description: action.description || null };
    } else if (action.type === "update-stage") {
      name = "manage_pipeline_stage";
      args = { _action: "update", _pipeline_id: null, _stage_id: action.stageId, _label: action.label, _description: action.description || null };
    } else if (action.type === "archive-stage" || action.type === "restore-stage") {
      name = "manage_pipeline_stage";
      args = { _action: action.type === "archive-stage" ? "archive" : "restore", _pipeline_id: null, _stage_id: action.stageId, _label: null, _description: null };
    } else if (action.type === "reorder-stages") {
      name = "reorder_pipeline_stages";
      args = { _pipeline_id: action.pipelineId, _ordered_ids: action.orderedIds };
    } else {
      return { ok: false, message: "That pipeline action is not supported." };
    }
    const { error } = await supabase.rpc(name as never, args as never);
    if (error) {
      console.error("[solo-pipeline] action failed", { action: action.type, error });
      return { ok: false, message: "That change could not be saved. Nothing else was changed." };
    }
    setRefreshKey((key) => key + 1);
    return { ok: true, message: "Saved to this tenant’s pipeline." };
  }, [activeTenantId]);

  useEffect(() => {
    let current = true;
    if (accountContextLoading) {
      setState({ tenantId: activeTenantId ?? null, phase: "resolving", ...empty });
      return () => { current = false; };
    }
    if (!activeTenantId) {
      setState({ tenantId: null, phase: "unavailable", ...empty });
      return () => { current = false; };
    }

    setState({ tenantId: activeTenantId, phase: "loading", ...empty });
    void (async () => {
      try {
        const [pageResponse, funnelResponse, formResponse, submissionResponse, routingResponse, pipelineResponse] = await Promise.all([
          supabase.from("growth_pages").select("id,slug,title,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_funnels").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_forms").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_form_submissions").select("id,form_id,source,processing_state,created_at,contact_id,deal_id").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(200),
          supabase.rpc("get_pipeline_routing_evidence" as never, { _tenant_id: activeTenantId } as never),
          supabase.rpc("get_pipeline_workspace" as never, { _tenant_id: activeTenantId } as never),
        ]);
        const firstError = [pageResponse.error, funnelResponse.error, formResponse.error, submissionResponse.error, routingResponse.error, pipelineResponse.error].find(Boolean);
        if (firstError) throw firstError;
        if (!current) return;

        // The existing tenant-campaigns bridge is not tenant-authorized upstream,
        // so Solo deliberately does not call it. Keep Overview unavailable until
        // a server-derived, tenant-scoped all-state contract exists.
        const campaigns: CampaignRecord[] = [];
        const pages = (pageResponse.data ?? []) as PageRow[];
        const funnels = (funnelResponse.data ?? []) as FunnelRow[];
        const forms = (formResponse.data ?? []) as FormRow[];
        const submissions = ((submissionResponse.data ?? []) as SubmissionRow[]).map((row) => ({
          id: row.id,
          formId: row.form_id,
          source: row.source || "Unspecified",
          state: row.processing_state,
          createdAt: row.created_at,
          contactId: row.contact_id,
          dealId: row.deal_id,
        }));
        const submissionCounts = submissions.reduce<Record<string, number>>((counts, row) => {
          counts[row.formId] = (counts[row.formId] ?? 0) + 1;
          return counts;
        }, {});
        const routingPayload = (routingResponse.data ?? {}) as unknown as RoutingEvidencePayload;
        const automations = routingPayload.routes ?? [];
        const automationsByForm = automations.reduce<Record<string, RoutingEvidenceRow[]>>((groups, row) => {
          (groups[row.form_id] ??= []).push(row);
          return groups;
        }, {});
        const routingEvidence = (formId: string) => {
          const configured = automationsByForm[formId] ?? [];
          const enabled = configured.filter((automation)=>automation.enabled);
          const dispatchStatuses = configured.reduce<Record<string, number>>((counts, automation) => {
            Object.entries(automation.dispatch_statuses ?? {}).forEach(([status, count]) => {
              counts[status] = (counts[status] ?? 0) + count;
            });
            return counts;
          }, {});
          const approvalGated = enabled.some((automation)=>automation.effective_autonomy_lane === "confirm");
          const humanOnly = enabled.some((automation)=>automation.effective_autonomy_lane === "off");
          const active = enabled.some((automation)=>automation.effective_autonomy_lane === "auto");
          return {
            routingConfigured: configured.length > 0,
            routingState: configured.length === 0 ? "No route" as const
              : enabled.length === 0 ? "Draft route" as const
              : active && approvalGated && humanOnly ? "Active + approval-gated + human-only" as const
              : active && approvalGated ? "Active + approval-gated" as const
              : active && humanOnly ? "Active + human-only" as const
              : approvalGated && humanOnly ? "Approval-gated + human-only" as const
              : approvalGated ? "Approval-gated" as const
              : humanOnly ? "Human-only" as const
              : "Active" as const,
            routingTargets: [...new Set(enabled.map((row) => row.target_slug))],
            dispatchStatuses,
            recentDispatches: Object.entries(dispatchStatuses).reduce((counts, [status, count]) => {
              if (["succeeded", "success", "completed"].includes(status)) counts.succeeded += count;
              else if (["failed", "error"].includes(status)) counts.failed += count;
              else counts.other += count;
              return counts;
            }, { succeeded: 0, failed: 0, other: 0 }),
          };
        };
        const tenantSlug = activeTenant?.slug ?? "";
        const rawPipeline = (pipelineResponse.data ?? {}) as unknown as PipelineWorkspacePayload;
        const pipelineWorkspace: PipelineWorkspace = {
          canManage: rawPipeline.can_manage === true,
          pipelines: (rawPipeline.pipelines ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description ?? "", isDefault: row.is_default === true })),
          stages: (rawPipeline.stages ?? []).map((row) => ({ id: row.id, pipelineId: row.pipeline_id, label: row.label, description: row.description ?? "", orderIndex: row.order_index, archivedAt: row.archived_at ?? null })),
          deals: (rawPipeline.deals ?? []).map((row) => ({ id: row.id, title: row.title, pipelineId: row.pipeline_id, stageId: row.stage_id, clientName: row.client_name || "Client not recorded", owner: row.owner_user_id ? "Assigned owner" : "Owner not recorded", status: row.status || "Not recorded", source: row.source || "Source not recorded", nextAction: row.next_action || "Next action not recorded", updatedAt: row.updated_at, portalAvailable: row.portal_available === true, history: row.history ?? [] })),
        };
        const artifacts: CampaignArtifact[] = [
          ...pages.filter((row) => row.status === "published").map((row) => ({
            id: row.id, type: "page" as const, name: row.title, slug: row.slug, status: row.status,
            updatedAt: row.updated_at, publicHref: tenantSlug ? `/p/${tenantSlug}/${row.slug}` : "", recentSubmissions: 0, routingConfigured: false, routingState:"No route" as const, routingTargets: [], recentDispatches: { succeeded: 0, failed: 0, other: 0 }, dispatchStatuses:{},
          })),
          ...funnels.filter((row) => row.status === "active").map((row) => ({
            id: row.id, type: "funnel" as const, name: row.name, slug: row.slug, status: row.status,
            updatedAt: row.updated_at, publicHref: tenantSlug ? `/f/${tenantSlug}/${row.slug}` : "", recentSubmissions: 0, routingConfigured: false, routingState:"No route" as const, routingTargets: [], recentDispatches: { succeeded: 0, failed: 0, other: 0 }, dispatchStatuses:{},
          })),
          ...forms.filter((row) => row.status === "active").map((row) => ({
            id: row.id, type: "form" as const, name: row.name, slug: row.slug, status: row.status,
            updatedAt: row.updated_at, publicHref: `/form/${row.id}`, recentSubmissions: submissionCounts[row.id] ?? 0,
            ...routingEvidence(row.id),
          })),
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setState({ tenantId: activeTenantId, phase: "ready", campaigns, artifacts, submissions, pipelineWorkspace });
      } catch (error) {
        console.error("[solo-campaigns] read failed", error);
        if (current) setState({ tenantId: activeTenantId, phase: "error", ...empty });
      }
    })();
    return () => { current = false; };
  }, [accountContextLoading, activeTenantId, activeTenant?.slug, refreshKey]);

  const synchronousTenantId = activeTenantId ?? null;
  const visibleState = state.tenantId === synchronousTenantId ? state : {
    tenantId: synchronousTenantId,
    phase: accountContextLoading ? "resolving" as const : synchronousTenantId ? "loading" as const : "unavailable" as const,
    ...empty,
  };
  return { ...visibleState, retry, pipelineAction };
}

