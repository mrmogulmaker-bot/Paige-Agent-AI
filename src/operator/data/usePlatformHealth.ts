import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import type { SystemsCheckRun, SystemsCheckSnapshot } from "@/hooks/useSystemsCheck";

/**
 * The Platform health view's reads (v3 `paige-ia.js` L268–L294, charts L496–L508).
 *
 * §18 — composes the ONE snapshot seam the Systems Check surface already reads
 * (`useSystemsCheck("operator")`, react-query-cached, so both surfaces share one round-trip)
 * and adds only what this view alone needs: the sweep series for the outcome chart and the
 * firing/acknowledgement read for the alert rows. No new RPC, no second snapshot, no
 * re-derivation of anything `systems_check_snapshot` already returns.
 *
 * §13 — every read reports its own error. A failed series does not blank the latest-run
 * ledger, and a failed firing read does not turn "unacknowledged" into a zero.
 */

/** One bar of the pack's `Sweep outcome` stackbars — pass / fail / could-not-run per run. */
export type SweepOutcomeBar = {
  runId: string;
  startedAt: string;
  pass: number;
  fail: number;
  other: number;
};

export type AckLatency = {
  /** Median fired→acknowledged over acknowledged firings in the window, in minutes. */
  medianMinutes: number;
  /** How many acknowledged firings the median was computed from. */
  acknowledged: number;
  /** Firings still unacknowledged in the window — context for the median, not part of it. */
  unacknowledged: number | null;
};

export type PlatformHealthReads = {
  snapshot: SystemsCheckSnapshot;
  /** Newest-first sweep history for the outcome chart; null until the series read answers. */
  sweepSeries: readonly SweepOutcomeBar[] | null;
  /** Total recorded operator sweeps (the registry-capped run history count). */
  runCount: number | null;
  ack: AckLatency | null;
  seriesError: string | null;
  ackError: string | null;
  seriesLoading: boolean;
  ackLoading: boolean;
  refresh: () => void;
};

/** The pack's chart draws twelve runs; the table behind it caps history at 100. */
const SERIES_LIMIT = 12;
const HISTORY_COUNT_LIMIT = 100;
/** Acknowledgement latency window — firings older than this are not "operating now". */
const ACK_WINDOW_DAYS = 14;
const ACK_SAMPLE_LIMIT = 200;

/**
 * The findings the ledger rows resolve from, by check key. The pack's five rows drew against
 * the operator registry (`20260816170000`); these are the real keys that carry them. A row
 * whose check has no finding in the latest run renders the honest absence, never a guess.
 */
export const LEDGER_CHECK_KEYS = {
  canary: "operator_cross_tenant_canary",
  rls: "operator_rls_coverage",
  migrationDrift: "operator_migration_drift",
} as const;

export function findingByKey(
  findings: readonly SystemsCheckFinding[],
  checkId: string,
): SystemsCheckFinding | null {
  return findings.find((f) => f.check_id === checkId) ?? null;
}

export function runCountOf(
  run: SystemsCheckRun | null,
): { total: number | null; pass: number | null; fail: number | null; other: number | null } {
  // Nulls stay null: a run whose counts were never recorded renders "—", never "0 / 0" —
  // an unrecorded count and a zero count are different facts (§13).
  if (!run || run.check_count === null) {
    return { total: null, pass: null, fail: null, other: null };
  }
  const total = run.check_count;
  const pass = run.pass_count ?? 0;
  const fail = run.fail_count ?? 0;
  return { total, pass, fail, other: Math.max(0, total - pass - fail) };
}

/** Rule 3 — the deferral foot is composed from the real skips and errors, never authored. */
export function couldNotRun(findings: readonly SystemsCheckFinding[]): SystemsCheckFinding[] {
  return findings.filter((f) => f.status === "skip" || f.status === "error");
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function usePlatformHealth(enabled: boolean): PlatformHealthReads {
  // The ONE snapshot seam — shared with Systems Check via react-query's cache.
  const snapshot = useSystemsCheck("operator");

  const [series, setSeries] = useState<SweepOutcomeBar[] | null>(null);
  const [runCount, setRunCount] = useState<number | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(true);

  const [ack, setAck] = useState<AckLatency | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setSeriesLoading(true);

    (async () => {
      // `paige_systems_check_run` is pre-typegen (same constrained escape hatch the Fleet
      // History adapter uses for this exact table).
      const [recent, counted] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("paige_systems_check_run")
          .select("id, started_at, check_count, pass_count, fail_count")
          .is("tenant_id", null)
          .order("started_at", { ascending: false })
          .limit(SERIES_LIMIT),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("paige_systems_check_run")
          .select("id", { count: "exact", head: true })
          .is("tenant_id", null)
          .gte(
            "started_at",
            new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          ),
      ]);
      if (!alive) return;

      if (recent.error) {
        setSeriesError(recent.error.message);
        setSeries(null);
        setRunCount(null);
      } else {
        setSeriesError(null);
        const rows = (recent.data ?? []) as Array<{
          id: string; started_at: string; check_count: number | null;
          pass_count: number | null; fail_count: number | null;
        }>;
        setSeries(
          rows.map((r) => {
            const total = r.check_count ?? 0;
            const pass = r.pass_count ?? 0;
            const fail = r.fail_count ?? 0;
            return {
              runId: r.id,
              startedAt: r.started_at,
              pass,
              fail,
              other: Math.max(0, total - pass - fail),
            };
          }),
        );
        // The count read is supporting context: a failure there leaves the series standing.
        setRunCount(counted.error ? null : (counted.count ?? null));
      }
      setSeriesLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled, nonce]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setAckLoading(true);

    (async () => {
      const windowStart = new Date(Date.now() - ACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const [sample, unacked] = await Promise.all([
        supabase
          .from("paige_alert_firing")
          .select("id, fired_at, acknowledged_at")
          .is("scope_tenant_id", null)
          .gte("fired_at", windowStart.toISOString())
          .order("fired_at", { ascending: false })
          .limit(ACK_SAMPLE_LIMIT),
        supabase
          .from("paige_alert_firing")
          .select("id", { count: "exact", head: true })
          .is("scope_tenant_id", null)
          .is("acknowledged_at", null),
      ]);
      if (!alive) return;

      if (sample.error) {
        setAckError(sample.error.message);
        setAck(null);
      } else {
        setAckError(null);
        // A capped sample does not invalidate a median — it scopes it. The note names the
        // sample size, so the figure reads as "over the N most recent" never as a total.
        const rows = (sample.data ?? []) as Array<{
          id: string; fired_at: string; acknowledged_at: string | null;
        }>;
        const minutes = rows
          .filter((r) => r.acknowledged_at)
          .map((r) =>
            (new Date(r.acknowledged_at!).getTime() - new Date(r.fired_at).getTime()) / 60000,
          )
          .filter((m) => Number.isFinite(m) && m >= 0);
        const med = median(minutes);
        setAck(
          med === null
            ? null
            : {
                medianMinutes: med,
                acknowledged: minutes.length,
                unacknowledged: unacked.error ? null : (unacked.count ?? null),
              },
        );
      }
      setAckLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled, nonce]);

  return {
    snapshot,
    sweepSeries: series,
    runCount,
    ack,
    seriesError,
    ackError,
    seriesLoading: seriesLoading,
    ackLoading: ackLoading,
    refresh: () => setNonce((n) => n + 1),
  };
}
