import { useEffect, useId } from "react";
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
  // Per-mount unique id for the realtime channel topic (matches the
  // usePendingApprovals / useSoloActions idiom, §18) — see the useEffect below.
  const instanceId = useId();

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
  //
  // UNIQUE topic per mount (§32) — a FIXED channel name ("practice-attention-
  // approvals") lets supabase-js hand back an already-`subscribe()`d channel when
  // this effect re-runs or two consumers mount at once; calling `.on('postgres_
  // changes', …)` on that channel then THROWS "cannot add postgres_changes
  // callbacks after subscribe()", which crashed the whole Admin workspace. A
  // per-mount unique topic guarantees a fresh channel every time.
  useEffect(() => {
    const topic = `practice-attention-approvals:${instanceId}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Belt-and-suspenders (§32): a realtime failure must degrade quietly, never
    // take down the dashboard render. The rail still refreshes on its 45s poll.
    try {
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "paige_pending_approvals" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["practice-attention-queue"] });
          },
        )
        .subscribe();
    } catch (err) {
      console.error("[usePracticeDashboard] realtime subscribe failed (non-fatal)", err);
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

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
