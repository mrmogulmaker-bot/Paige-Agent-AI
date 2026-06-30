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
      .select("slug,name,domain,description,runtime,triggers,display_order,enabled,edge_function,langgraph_graph")
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
