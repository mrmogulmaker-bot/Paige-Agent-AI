/**
 * Team History (§C) data hook — IA slice 1c-x.
 *
 * §9: RLS-tenant-scoped reads, NO client tenant_id. team_scoreboard_metrics and
 * team_handoff_queue both enforce the tenant seam server-side.
 *
 * HONEST EMPTY (§11/§13): there is NO producer for team_scoreboard_metrics yet
 * (#422 open — the scoreboard writer hasn't shipped), so this returns empty
 * today. The REAL query is wired now so the surface fills the moment #422 lands;
 * the section renders a crafted EmptyState until then — never a fake trendline.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ScoreboardPoint {
  metricKey: string;
  value: number;
  recordedAt: string;
}

export interface TeamHistory {
  loading: boolean;
  points: ScoreboardPoint[];
  /** distinct metric keys present in the window */
  metricKeys: string[];
  handoffAccepted: number;
  handoffDeclined: number;
  handoffExpired: number;
  /** accepted / (accepted + declined + expired), or null when no resolved handoffs */
  handoffSuccessRate: number | null;
  isEmpty: boolean;
}

const EMPTY: TeamHistory = {
  loading: true,
  points: [],
  metricKeys: [],
  handoffAccepted: 0,
  handoffDeclined: 0,
  handoffExpired: 0,
  handoffSuccessRate: null,
  isEmpty: true,
};

export function useTeamHistory(start: string, end: string): TeamHistory {
  const [state, setState] = useState<TeamHistory>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end + "T23:59:59").toISOString();

      const [metricsRes, handoffRes] = await Promise.all([
        // team_scoreboard_metrics / team_handoff_queue are live on prod (1c-ix) but
        // not yet in the generated types — cast the table name (repo precedent) to
        // avoid the no-overload + excessively-deep-instantiation type errors. RLS
        // scopes the read; NO client tenant param (§9).
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("team_scoreboard_metrics" as any)
          .select("metric_key, value, recorded_at")
          .gte("recorded_at", startIso)
          .lte("recorded_at", endIso)
          .order("recorded_at", { ascending: true })
          .limit(10000),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("team_handoff_queue" as any)
          .select("status")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .limit(10000),
      ]);

      if (cancelled) return;

      const points: ScoreboardPoint[] = (
        (metricsRes.data as unknown as { metric_key: string; value: number; recorded_at: string }[] | null) || []
      ).map((r) => ({ metricKey: r.metric_key, value: Number(r.value), recordedAt: r.recorded_at }));

      const handoffs = (handoffRes.data as unknown as { status: string }[] | null) || [];
      const handoffAccepted = handoffs.filter((h) => h.status === "accepted").length;
      const handoffDeclined = handoffs.filter((h) => h.status === "declined").length;
      const handoffExpired = handoffs.filter((h) => h.status === "expired").length;
      const resolved = handoffAccepted + handoffDeclined + handoffExpired;

      setState({
        loading: false,
        points,
        metricKeys: Array.from(new Set(points.map((p) => p.metricKey))),
        handoffAccepted,
        handoffDeclined,
        handoffExpired,
        handoffSuccessRate: resolved > 0 ? handoffAccepted / resolved : null,
        isEmpty: points.length === 0 && resolved === 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return state;
}
