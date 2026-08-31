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
  routingTargets: string[];
  recentDispatches: { succeeded: number; failed: number; other: number };
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
type AutomationRow = { id: string; form_id: string; target_slug: string; enabled: boolean };
type DispatchRow = { automation_id: string; status: string };

const emptyPipeline: PipelineWorkspace = { canManage: false, pipelines: [], stages: [], deals: [] };
const empty = { campaigns: [], artifacts: [], submissions: [], pipelineWorkspace: emptyPipeline };

export function useSoloCampaigns(): SoloCampaignsState {
  const { activeTenantId, activeTenant, accountContextLoading } = useTenantContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<Omit<SoloCampaignsState, "retry">>({
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
    } else {
      name = "reorder_pipeline_stages";
      args = { _pipeline_id: action.pipelineId, _ordered_ids: action.orderedIds };
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
      setState({ phase: "resolving", ...empty });
      return () => { current = false; };
    }
    if (!activeTenantId) {
      setState({ phase: "unavailable", ...empty });
      return () => { current = false; };
    }

    setState({ phase: "loading", ...empty });
    void (async () => {
      try {
        const [pageResponse, funnelResponse, formResponse, submissionResponse, automationResponse, dispatchResponse, pipelineResponse] = await Promise.all([
          supabase.from("growth_pages").select("id,slug,title,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_funnels").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_forms").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_form_submissions").select("id,form_id,source,processing_state,created_at,contact_id,deal_id").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(200),
          supabase.from("growth_form_automations").select("id,form_id,target_slug,enabled").eq("tenant_id", activeTenantId).eq("enabled", true),
          supabase.from("growth_submission_dispatches").select("automation_id,status").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(200),
          supabase.rpc("get_pipeline_workspace" as never, { _tenant_id: activeTenantId } as never),
        ]);
        const firstError = [pageResponse.error, funnelResponse.error, formResponse.error, submissionResponse.error, automationResponse.error, dispatchResponse.error, pipelineResponse.error].find(Boolean);
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
        const automations = (automationResponse.data ?? []) as AutomationRow[];
        const dispatches = (dispatchResponse.data ?? []) as DispatchRow[];
        const automationsByForm = automations.reduce<Record<string, AutomationRow[]>>((groups, row) => {
          (groups[row.form_id] ??= []).push(row);
          return groups;
        }, {});
        const dispatchesByAutomation = dispatches.reduce<Record<string, DispatchRow[]>>((groups, row) => {
          (groups[row.automation_id] ??= []).push(row);
          return groups;
        }, {});
        const routingEvidence = (formId: string) => {
          const configured = automationsByForm[formId] ?? [];
          const outcomes = configured.flatMap((automation) => dispatchesByAutomation[automation.id] ?? []);
          return {
            routingConfigured: configured.length > 0,
            routingTargets: [...new Set(configured.map((row) => row.target_slug))],
            recentDispatches: outcomes.reduce((counts, row) => {
              if (["succeeded", "success", "completed"].includes(row.status)) counts.succeeded += 1;
              else if (["failed", "error"].includes(row.status)) counts.failed += 1;
              else counts.other += 1;
              return counts;
            }, { succeeded: 0, failed: 0, other: 0 }),
          };
        };
        const tenantSlug = activeTenant?.slug ?? "";
        const rawPipeline = (pipelineResponse.data ?? {}) as Record<string, any>;
        const pipelineWorkspace: PipelineWorkspace = {
          canManage: rawPipeline.can_manage === true,
          pipelines: (rawPipeline.pipelines ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description ?? "", isDefault: row.is_default === true })),
          stages: (rawPipeline.stages ?? []).map((row) => ({ id: row.id, pipelineId: row.pipeline_id, label: row.label, description: row.description ?? "", orderIndex: row.order_index, archivedAt: row.archived_at ?? null })),
          deals: (rawPipeline.deals ?? []).map((row) => ({ id: row.id, title: row.title, pipelineId: row.pipeline_id, stageId: row.stage_id, clientName: row.client_name || "Client not recorded", owner: row.owner_user_id ? "Assigned owner" : "Owner not recorded", status: row.status || "Not recorded", source: row.source || "Source not recorded", nextAction: row.next_action || "Next action not recorded", updatedAt: row.updated_at, portalAvailable: row.portal_available === true, history: row.history ?? [] })),
        };
        const artifacts: CampaignArtifact[] = [
          ...pages.filter((row) => row.status === "published").map((row) => ({
            id: row.id, type: "page" as const, name: row.title, slug: row.slug, status: row.status,
            updatedAt: row.updated_at, publicHref: tenantSlug ? `/p/${tenantSlug}/${row.slug}` : "", recentSubmissions: 0, routingConfigured: false, routingTargets: [], recentDispatches: { succeeded: 0, failed: 0, other: 0 },
          })),
          ...funnels.filter((row) => row.status === "active").map((row) => ({
            id: row.id, type: "funnel" as const, name: row.name, slug: row.slug, status: row.status,
            updatedAt: row.updated_at, publicHref: tenantSlug ? `/f/${tenantSlug}/${row.slug}` : "", recentSubmissions: 0, routingConfigured: false, routingTargets: [], recentDispatches: { succeeded: 0, failed: 0, other: 0 },
          })),
          ...forms.filter((row) => row.status === "active").map((row) => ({
            id: row.id, type: "form" as const, name: row.name, slug: row.slug, status: row.status,
            updatedAt: row.updated_at, publicHref: `/form/${row.id}`, recentSubmissions: submissionCounts[row.id] ?? 0,
            ...routingEvidence(row.id),
          })),
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setState({ phase: "ready", campaigns, artifacts, submissions, pipelineWorkspace });
      } catch (error) {
        console.error("[solo-campaigns] read failed", error);
        if (current) setState({ phase: "error", ...empty });
      }
    })();
    return () => { current = false; };
  }, [accountContextLoading, activeTenantId, activeTenant?.slug, refreshKey]);

  return { ...state, retry, pipelineAction };
}

