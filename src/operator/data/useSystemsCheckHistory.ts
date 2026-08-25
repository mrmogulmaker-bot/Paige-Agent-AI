import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Adapter for v3 `runsVals` (`PAIGE Super Admin Shell v3.dc.html` 7626–7691).
 *
 * The reference mixes full systems sweeps, five-minute evaluator cycles, and alert firings.
 * Production records full sweeps in `paige_systems_check_run` and firings in
 * `paige_alert_firing`; it does not record evaluator cycles that fire nothing. This adapter
 * joins the two truthful histories in the browser and leaves Clean unavailable rather than
 * manufacturing the reference's 36-slot cadence.
 */
export type FleetHistoryEvent = {
  id: string;
  at: string;
  kind: "Full sweep" | "Firing";
  outcome: "Complete" | "Firing" | "In flight";
  duration: string;
  detail: string;
};

const HISTORY_LIMIT = 100;

function duration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

export function useSystemsCheckHistory(enabled: boolean): {
  events: FleetHistoryEvent[];
  total: number | null;
  loading: boolean;
  error: string | null;
} {
  const [events, setEvents] = useState<FleetHistoryEvent[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      const [runResult, firingResult] = await Promise.all([
        // `paige_systems_check_run` is not in the generated Supabase types yet. This is the
        // same constrained escape hatch the existing Systems Check hooks use for the table.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("paige_systems_check_run")
          .select("id, started_at, completed_at, check_count, pass_count, fail_count", {
            count: "exact",
          })
          .is("tenant_id", null)
          .order("started_at", { ascending: false })
          .limit(HISTORY_LIMIT),
        supabase
          .from("paige_alert_firing")
          .select("id, fired_at, delivery_status, delivered_at", { count: "exact" })
          .is("scope_tenant_id", null)
          .order("fired_at", { ascending: false })
          .limit(HISTORY_LIMIT),
      ]);

      if (!alive) return;
      const sweeps: FleetHistoryEvent[] = (runResult.data ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => ({
          id: `run:${r.id}`,
          at: r.started_at,
          kind: "Full sweep",
          outcome: r.completed_at ? "Complete" : "In flight",
          duration: duration(r.started_at, r.completed_at),
          detail: r.completed_at
            ? `${r.pass_count} pass · ${r.fail_count} fail · ${Math.max(0, r.check_count - r.pass_count - r.fail_count)} other`
            : "Systems sweep, still running",
        }),
      );
      const firings: FleetHistoryEvent[] = (firingResult.data ?? []).map((f) => ({
        id: `firing:${f.id}`,
        at: f.fired_at,
        kind: "Firing",
        outcome: "Firing",
        duration: "—",
        detail: f.delivered_at
          ? "Alert firing · delivered"
          : `Alert firing · ${f.delivery_status || "delivery status —"}`,
      }));

      setEvents(
        sweeps
          .concat(firings)
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, HISTORY_LIMIT),
      );
      setError(
        [runResult.error?.message, firingResult.error?.message].filter(Boolean).join(" · ") || null,
      );
      setTotal(
        runResult.error || firingResult.error || runResult.count === null || firingResult.count === null
          ? null
          : runResult.count + firingResult.count,
      );
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return { events, total, loading, error };
}
