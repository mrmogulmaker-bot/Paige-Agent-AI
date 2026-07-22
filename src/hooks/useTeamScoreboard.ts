import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

/**
 * useTeamScoreboard — per-rep performance timeseries (IA slice 1c-ix).
 *
 * Reads `team_scoreboard_metrics` (RLS tenant-scoped; NO client tenant param, §9).
 * The table is normal-RLS readable, so realtime is fine — the tenant filter string is
 * the ONLY place activeTenantId appears, sourced from useTenantContext().
 *
 * HONESTY (§13): there is NO producer writing metrics today, so this returns [] and the
 * scoreboard renders a crafted EmptyState. The query + realtime are REAL, so it fills the
 * instant the filed scoreboard-metric writer starts recording. Window/group filtering is
 * done CLIENT-SIDE by the consumer over recorded_at — this hook fetches the raw rows.
 */
export type ScoreboardRow = {
  user_id: string;
  department: string | null;
  metric_key: string;
  value: number;
  recorded_at: string;
  source: string;
};

export type UseTeamScoreboardResult = {
  rows: ScoreboardRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useTeamScoreboard(activeTenantId: string | null): UseTeamScoreboardResult {
  const [rows, setRows] = useState<ScoreboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const seqRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const seq = ++seqRef.current;
    try {
      // `team_scoreboard_metrics` is live on prod but not yet in the generated types —
      // cast the table name (repo precedent for post-migration tables). RLS scopes the
      // read; NO client-SUPPLIED tenant param (§9). The activeTenantId predicate below is
      // defense-in-depth: it makes the INITIAL fetch consistent with the realtime filter
      // (so a platform operator whose RLS can read across tenants still only pulls the
      // selected tenant's rows), and it is sourced ONLY from useTenantContext, never a
      // route param/prop. Non-owners are already pinned to their own tenant by RLS, so the
      // predicate is a redundant belt-and-suspenders there, never a scope widener.
      let query = supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("team_scoreboard_metrics" as any)
        .select("user_id, department, metric_key, value, recorded_at, source");
      if (activeTenantId) query = query.eq("tenant_id", activeTenantId);
      const { data, error: qErr } = await query
        .order("recorded_at", { ascending: false })
        .limit(5000);

      if (!mountedRef.current || seq !== seqRef.current) return;
      if (qErr) {
        setError(qErr.message);
        return;
      }
      // `data` is a post-migration table not yet in generated types (cast via unknown,
      // repo precedent) — the row shape matches ScoreboardRow by the explicit select above.
      setRows((data ?? []) as unknown as ScoreboardRow[]);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load scoreboard");
    } finally {
      if (mountedRef.current && seq === seqRef.current) setLoading(false);
    }
  }, [activeTenantId]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  useRealtimeTable(
    "team_scoreboard_metrics",
    () => {
      void load();
    },
    {
      filter: activeTenantId ? `tenant_id=eq.${activeTenantId}` : undefined,
      enabled: !!activeTenantId,
    },
  );

  return { rows, loading, error, refresh };
}
