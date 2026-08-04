import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubAgent {
  slug: string;
  name: string;
  domain: string;
  description: string;
  runtime: "local" | "langgraph" | "soft";
  triggers: string[];
  display_order: number;
  enabled?: boolean;
  edge_function?: string | null;
  langgraph_graph?: string | null;
  auto_generated?: boolean;
  system_prompt?: string | null;
}

export interface OrchestratorInvokeResult {
  ok: boolean;
  subagent?: string;
  runtime?: "local" | "langgraph" | "soft";
  latency_ms?: number;
  result?: unknown;
  error?: string;
}

/**
 * usePaigeOrchestrator — thin client for the paige-orchestrator Edge Function.
 * Section 18 doctrine: Paige delegates to sub-agents via tool_search + tool_invoke.
 */
export function usePaigeOrchestrator() {
  const search = useCallback(async (query?: string, domain?: string) => {
    const { data, error } = await supabase.functions.invoke("paige-orchestrator", {
      body: { action: "tool_search", query, domain },
    });
    if (error) throw error;
    return (data?.matches ?? []) as SubAgent[];
  }, []);

  const invoke = useCallback(
    async (
      slug: string,
      input: Record<string, unknown> = {},
      context: { contact_id?: string; conversation_id?: string } = {},
    ): Promise<OrchestratorInvokeResult> => {
      const { data, error } = await supabase.functions.invoke("paige-orchestrator", {
        body: { action: "tool_invoke", slug, input, context },
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      return data as OrchestratorInvokeResult;
    },
    [],
  );

  return { search, invoke };
}

/**
 * A tenant's OWN Paige-forged specialist — a "keeper" (§14): Paige forges a
 * specialist for a job the practice does often, and the tenant keeps the good
 * ones. This is the tenant-authored counterpart to the seven platform VPs
 * (VP_ROSTER, #244), which ship to everyone as `tenant_id IS NULL` rows.
 */
export interface TenantSpecialist {
  slug: string;
  name: string;
  domain: string;
  description: string;
  department: string | null;
  display_order: number;
}

/**
 * useTenantSpecialists — the tenant's own forged specialists for the
 * "Specialists Paige built for your practice" section (#247), an EXTENSION of
 * the #244 "About Your Paige Team" learn surface. READ-ONLY: forging a new one
 * is a §20 chat act, never a control here.
 *
 * §9/§51 TENANT ISOLATION — no client-supplied tenant_id. The read is scoped
 * SERVER-SIDE by the existing `paige_subagents_tenant_read` RLS policy
 * (`tenant_id IS NULL OR tenant_id = current_user_tenant_id()`), where
 * `current_user_tenant_id()` resolves the caller's tenant from their JWT — the
 * client cannot spoof it. Combined with the `.not(tenant_id, is, null)` filter
 * below, the only rows returned are THIS tenant's own forged agents: a
 * sub-account sees only its own, never the parent agency's (RLS is the floor,
 * no SECURITY DEFINER aggregate is added that would bypass it — §45).
 *
 * The `tenant_id IS NULL` rows (the seven platform VPs + the dormant review
 * crew) are the shared default layer and are excluded here — they render from
 * VP_ROSTER on the same page (§243/§12 single source), not from this read.
 */
export function useTenantSpecialists() {
  const [specialists, setSpecialists] = useState<TenantSpecialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("paige_subagents")
      .select("slug,name,domain,description,department,display_order")
      .not("tenant_id", "is", null) // exclude platform/VP defaults + dormant crew (all tenant_id NULL)
      .eq("enabled", true) // keepers only — a disabled forge is not "your team"
      .order("display_order")
      .limit(60); // defensive cap — a directory, not a feed; a runaway roster never floods the section
    if (error) setError(error.message);
    else setSpecialists((data ?? []) as TenantSpecialist[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { specialists, loading, error, refresh };
}

/**
 * Live list of enabled sub-agents — used by the Admin Sub-Agents console.
 */
export function useSubAgents() {
  const [agents, setAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("paige_subagents")
      .select("slug,name,domain,description,runtime,triggers,display_order,enabled,edge_function,langgraph_graph,auto_generated,system_prompt")
      .order("display_order");
    if (error) setError(error.message);
    else setAgents((data ?? []) as SubAgent[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { agents, loading, error, refresh };
}
