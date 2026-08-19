import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The Fleet Console's History sub-tab (CD's `SC_HISTORY`, ported structurally in
 * `fleetSpecs.ts`'s `fleet/history` entry: "Every check that has run, newest first, with
 * what it found."). Reads real operator-scope runs — not a re-derived read: same table
 * `useSystemsCheck` already reads for the live tile, just every past run instead of only
 * the latest one, and no findings join (a run's pass/fail summary IS "what it found" at
 * this grain; opening a category on Systems Check shows the per-check detail).
 *
 * §59/§51 — RLS on `paige_systems_check_run` already permits `is_platform_operator()` to
 * read `tenant_id IS NULL` rows directly (widened by the L3 operator-scope migration), so
 * this is a plain PostgREST select, not a new RPC (§18 — nothing to add).
 */
export type SystemsCheckRun = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  checkCount: number;
  passCount: number;
  failCount: number;
};

const HISTORY_LIMIT = 100;

export function useSystemsCheckHistory(enabled: boolean): {
  runs: SystemsCheckRun[];
  loading: boolean;
  error: string | null;
} {
  const [runs, setRuns] = useState<SystemsCheckRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      // `paige_systems_check_run` isn't in the generated Supabase types yet (migrations are
      // owner-review-gated) — same `as any` the shipped `useSystemsCheck` hook already uses
      // for this table family, not a new gap.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: qErr } = await (supabase as any)
        .from("paige_systems_check_run")
        .select("id, started_at, completed_at, check_count, pass_count, fail_count")
        .is("tenant_id", null)
        .order("started_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (!alive) return;
      if (qErr) {
        setError(qErr.message);
        setRuns([]);
        setLoading(false);
        return;
      }
      setRuns(
        (data ?? []).map((r) => ({
          id: r.id,
          startedAt: r.started_at,
          completedAt: r.completed_at,
          checkCount: r.check_count,
          passCount: r.pass_count,
          failCount: r.fail_count,
        })),
      );
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return { runs, loading, error };
}
