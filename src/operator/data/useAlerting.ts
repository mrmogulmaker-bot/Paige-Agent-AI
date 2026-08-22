import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fleet Console — Alert rules (CD 6769–6857, `fleetSpecs.ts`'s `fleet/alert-rules` entry).
 * "What she tells you about, how, and whether it has ever fired."
 *
 * §18 — reads the A1 substrate directly (`paige_alert_rule` · `paige_alert_firing` ·
 * `paige_alert_signal`). No new RPC: the three tables already carry an operator-gated
 * SELECT policy (`is_platform_operator()`, RLS FORCED, `anon` denied), so PostgREST is
 * the seam and a second server-side aggregate would be the duplicate §18 forbids.
 *
 * §199 — every FIRING figure is an exact head-count (`count: "exact", head: true`), never
 * `rows.length` over an uncapped select: firings accumulate without bound and the
 * PostgREST max-rows cap would silently under-report them. The RULE-derived figures
 * (paused, never-fired) are computed from the fetched list, which is safe ONLY while that
 * list is complete — so the hook fetches one row past its own cap and reports
 * `rulesTruncated` when it isn't, and the surface renders "—" rather than a wrong count.
 *
 * §13 — a read that fails sets `error` and leaves every figure null. Nothing here
 * substitutes a zero for an unknown: "no rule has fired" and "the firing table could not
 * be read" are different facts and must not render identically.
 */

/** Cap on the rule list. Rules are operator-authored and inherently few; the +1 probe
 *  below is what makes the derived counts honest if that ever stops being true. */
const RULE_LIMIT = 200;

export type AlertRuleRow = {
  id: string;
  name: string;
  description: string | null;
  /** The stored condition tree — rendered by `describeCondition`, never evaluated here. */
  condition: unknown;
  department: string | null;
  autonomyLane: string;
  /** Delivery channels as stored. A3 delivers in-app only; the rest are declared, not live. */
  channels: unknown;
  severity: string;
  isActive: boolean;
  lastEvaluatedAt: string | null;
  lastFiredAt: string | null;
};

export type AlertSignalRow = {
  key: string;
  label: string;
  isReadable: boolean;
  notes: string | null;
};

export type AlertingCounts = {
  /** null = not read (error or still loading), never a substituted zero (§13). */
  rules: number | null;
  paused: number | null;
  neverFired: number | null;
  firedToday: number | null;
  acknowledgedToday: number | null;
  unacknowledged: number | null;
};

const EMPTY_COUNTS: AlertingCounts = {
  rules: null,
  paused: null,
  neverFired: null,
  firedToday: null,
  acknowledgedToday: null,
  unacknowledged: null,
};

/** Local midnight, because "FIRED TODAY" is read by a human in their own day, not in UTC. */
function startOfLocalDay(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function useAlerting(enabled: boolean): {
  rules: AlertRuleRow[];
  rulesTruncated: boolean;
  signals: AlertSignalRow[];
  counts: AlertingCounts;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [rulesTruncated, setRulesTruncated] = useState(false);
  const [signals, setSignals] = useState<AlertSignalRow[]>([]);
  const [counts, setCounts] = useState<AlertingCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      const dayStart = startOfLocalDay();

      const [ruleRes, signalRes, firedTodayRes, ackTodayRes, unackedRes] = await Promise.all([
        // +1 past the cap: if it comes back, the list is incomplete and the derived
        // counts below are not trustworthy (§199).
        supabase
          .from("paige_alert_rule")
          .select(
            "id,name,description,condition,department,autonomy_lane,channels,severity,is_active,last_evaluated_at,last_fired_at",
          )
          .order("is_active", { ascending: false })
          .order("name", { ascending: true })
          .limit(RULE_LIMIT + 1),
        supabase
          .from("paige_alert_signal")
          .select("key,label,is_readable,notes")
          .order("key", { ascending: true }),
        supabase
          .from("paige_alert_firing")
          .select("id", { count: "exact", head: true })
          .gte("fired_at", dayStart),
        supabase
          .from("paige_alert_firing")
          .select("id", { count: "exact", head: true })
          .gte("fired_at", dayStart)
          .not("acknowledged_at", "is", null),
        supabase
          .from("paige_alert_firing")
          .select("id", { count: "exact", head: true })
          .is("acknowledged_at", null),
      ]);

      if (!alive) return;

      // The rule read is the one that must succeed — without it there is no surface.
      if (ruleRes.error) {
        setError(ruleRes.error.message);
        setRules([]);
        setSignals([]);
        setCounts(EMPTY_COUNTS);
        setLoading(false);
        return;
      }

      const raw = ruleRes.data ?? [];
      const truncated = raw.length > RULE_LIMIT;
      const page = truncated ? raw.slice(0, RULE_LIMIT) : raw;

      setRulesTruncated(truncated);
      setRules(
        page.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          condition: r.condition,
          department: r.department,
          autonomyLane: r.autonomy_lane,
          channels: r.channels,
          severity: r.severity,
          isActive: r.is_active,
          lastEvaluatedAt: r.last_evaluated_at,
          lastFiredAt: r.last_fired_at,
        })),
      );

      // The signal catalogue is supporting context, not the surface — a failure there
      // renders an empty catalogue, it does not blank the rules (§13: reported, not fatal).
      setSignals(
        signalRes.error
          ? []
          : (signalRes.data ?? []).map((s) => ({
              key: s.key,
              label: s.label,
              isReadable: s.is_readable,
              notes: s.notes,
            })),
      );

      setCounts({
        rules: truncated ? null : page.length,
        paused: truncated ? null : page.filter((r) => !r.is_active).length,
        neverFired: truncated ? null : page.filter((r) => r.last_fired_at === null).length,
        firedToday: firedTodayRes.error ? null : (firedTodayRes.count ?? null),
        acknowledgedToday: ackTodayRes.error ? null : (ackTodayRes.count ?? null),
        unacknowledged: unackedRes.error ? null : (unackedRes.count ?? null),
      });

      // A partial read is still worth surfacing loudly — the operator must not read a
      // blank KPI as "zero" when it means "this query failed" (§13/§32).
      const partial = [signalRes.error, firedTodayRes.error, ackTodayRes.error, unackedRes.error]
        .filter(Boolean)
        .map((e) => (e as { message: string }).message);
      setError(partial.length ? `Some reads failed: ${partial.join(" · ")}` : null);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled, nonce]);

  return { rules, rulesTruncated, signals, counts, loading, error, refresh };
}
