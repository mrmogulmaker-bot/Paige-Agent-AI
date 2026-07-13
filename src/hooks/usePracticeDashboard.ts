import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Practice (tenant) home-screen rollups. Two tenant-scoped RPCs — one poll for
 * the KPI tiles, one for the "Needs You Today" rail — plus a realtime bridge:
 * the rail ALSO listens to paige_pending_approvals so a new/resolved approval
 * refreshes the attention counts the instant it happens, not on the next poll.
 *
 * Every field is optional: the RPC omits any metric it has no real source for
 * (§13), and the UI renders a tile only when its key is present. No fabricated
 * numbers ever reach this layer.
 */
export interface DealStageSlice {
  stage_label: string;
  count: number;
  value_cents: number;
}

export interface PracticeMetrics {
  active_clients?: number;
  new_clients?: number;
  won_value_cents?: number;
  pipeline_value_cents?: number;
  active_retainers?: number;
  deals_by_stage?: DealStageSlice[];
  arpc_cents?: number;
}

export interface PracticeAttention {
  at_risk_clients?: number;
  follow_ups_due?: number;
  upcoming_sessions_7d?: number;
  tasks_due?: number;
  onboarding_in_progress?: number;
}

const POLL = { refetchInterval: 45_000, refetchOnWindowFocus: true } as const;

export function usePracticeDashboard(windowDays = 30) {
  const queryClient = useQueryClient();

  const metrics = useQuery({
    queryKey: ["practice-dashboard-metrics", windowDays],
    queryFn: async (): Promise<PracticeMetrics> => {
      const { data, error } = await supabase.rpc(
        "practice_dashboard_metrics" as any,
        { p_window_days: windowDays } as any,
      );
      if (error) throw error;
      return (data ?? {}) as PracticeMetrics;
    },
    ...POLL,
  });

  const attention = useQuery({
    queryKey: ["practice-attention-queue"],
    queryFn: async (): Promise<PracticeAttention> => {
      const { data, error } = await supabase.rpc("practice_attention_queue" as any);
      if (error) throw error;
      return (data ?? {}) as PracticeAttention;
    },
    ...POLL,
  });

  // Realtime bridge: an approval landing or clearing should refresh the rail
  // immediately. paige_pending_approvals is already in the realtime publication.
  useEffect(() => {
    const channel = supabase
      .channel("practice-attention-approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_pending_approvals" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["practice-attention-queue"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    metrics: metrics.data,
    attention: attention.data,
    loading: metrics.isLoading || attention.isLoading,
    isError: metrics.isError || attention.isError,
    refetch: () => {
      metrics.refetch();
      attention.refetch();
    },
  };
}
