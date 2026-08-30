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
  retry: () => void;
};

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

const empty = { campaigns: [], artifacts: [], submissions: [] };

export function useSoloCampaigns(): SoloCampaignsState {
  const { activeTenantId, activeTenant, accountContextLoading } = useTenantContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<Omit<SoloCampaignsState, "retry">>({
    phase: accountContextLoading ? "resolving" : "loading",
    ...empty,
  });
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

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
        const [pageResponse, funnelResponse, formResponse, submissionResponse, automationResponse, dispatchResponse] = await Promise.all([
          supabase.from("growth_pages").select("id,slug,title,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_funnels").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_forms").select("id,slug,name,status,updated_at").eq("tenant_id", activeTenantId).order("updated_at", { ascending: false }),
          supabase.from("growth_form_submissions").select("id,form_id,source,processing_state,created_at,contact_id,deal_id").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(200),
          supabase.from("growth_form_automations").select("id,form_id,target_slug,enabled").eq("tenant_id", activeTenantId).eq("enabled", true),
          supabase.from("growth_submission_dispatches").select("automation_id,status").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(200),
        ]);
        const firstError = [pageResponse.error, funnelResponse.error, formResponse.error, submissionResponse.error, automationResponse.error, dispatchResponse.error].find(Boolean);
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
        setState({ phase: "ready", campaigns, artifacts, submissions });
      } catch (error) {
        console.error("[solo-campaigns] read failed", error);
        if (current) setState({ phase: "error", ...empty });
      }
    })();
    return () => { current = false; };
  }, [accountContextLoading, activeTenantId, activeTenant?.slug, refreshKey]);

  return { ...state, retry };
}
