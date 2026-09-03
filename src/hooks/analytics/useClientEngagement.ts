/**
 * Client Engagement (§B-engagement) data hook — IA slice 1c-x.
 *
 * §9: RLS-tenant-scoped, NO client tenant_id. paige_client_events enforces the
 * tenant seam server-side (staff read policy scoped to current_user_tenant_id()).
 *
 * This is B-ENGAGEMENT ONLY. It does NOT touch B-transformation
 * (client_transformation_metrics does not exist — that is CX-4, a deferred
 * follow-up); nothing here scaffolds it.
 *
 * §13: the daily engagement series only renders a trendline when there are ≥ 2
 * days of real events (the section enforces the "insufficient data" empty state).
 *
 * #802 — A DENIED READ IS NOT ZERO ACTIVITY. `authenticated` holds no SELECT on
 * `paige_client_events` in production (revoked by 20260712200000, deliberately: that revoke is
 * what keeps the same-shaped flaw in `pce_staff_read` unreachable). This hook used to destructure
 * only `{ data }`, discard the error, and then build a DENSE series of zeros across the range — so
 * a refusal arrived at the section as a fully-formed "0 events every day" answer and rendered as
 * *Insufficient data*. That is worse than an empty feed: it is a metric an owner could act on.
 *
 * `unavailable` now carries that distinction, and on a failed read the zero series is NOT built at
 * all. Absent data and refused data are different answers and must never share a shape.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EngagementDay {
  date: string;
  /** event count that day (the simple engagement signal) */
  value: number;
}

export interface ClientEngagement {
  loading: boolean;
  /**
   * True when the read was REFUSED or FAILED — not when it succeeded and found nothing.
   * A caller that treats this as "no activity" reintroduces the #802 defect.
   */
  unavailable: boolean;
  byDay: EngagementDay[];
  totalEvents: number;
  distinctClients: number;
}

const EMPTY: ClientEngagement = {
  loading: true,
  unavailable: false,
  byDay: [],
  totalEvents: 0,
  distinctClients: 0,
};

export function useClientEngagement(start: string, end: string): ClientEngagement {
  const [state, setState] = useState<ClientEngagement>(EMPTY);
  /**
   * The range the state above actually describes.
   *
   * Setting `loading: true` at the top of the effect is not enough on its own: `useEffect` is
   * passive, so on a range change React commits the render — new dates on screen, PREVIOUS
   * totals — and the browser can paint that frame before the effect runs. Keying the result to
   * its range and treating a mismatch as `loading` DURING RENDER removes that frame rather than
   * shortening it. Same reasoning as the cohort table's mode guard.
   */
  const [resultKey, setResultKey] = useState<string | null>(null);
  const key = `${start}|${end}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end + "T23:59:59").toISOString();

      const { data, error } = await supabase
        .from("paige_client_events")
        .select("occurred_at, contact_id")
        .gte("occurred_at", startIso)
        .lte("occurred_at", endIso)
        .limit(50000);

      if (cancelled) return;

      // #802: bind the refusal and STOP. Falling through would synthesise a dense zero series
      // that is indistinguishable from a real quiet period.
      if (error) {
        console.warn("[useClientEngagement] engagement read refused or failed:", error.message);
        setState({ loading: false, unavailable: true, byDay: [], totalEvents: 0, distinctClients: 0 });
        setResultKey(key);
        return;
      }

      const rows = (data as { occurred_at: string; contact_id: string }[] | null) || [];

      // Bucket every day in the range (dense series so a gap reads as 0, not a
      // skipped point) and count events per day.
      const counts = new Map<string, number>();
      const clients = new Set<string>();
      for (const r of rows) {
        const k = new Date(r.occurred_at).toISOString().slice(0, 10);
        counts.set(k, (counts.get(k) || 0) + 1);
        if (r.contact_id) clients.add(r.contact_id);
      }

      const byDay: EngagementDay[] = [];
      const cursor = new Date(start);
      const endDt = new Date(end);
      while (cursor <= endDt) {
        const k = cursor.toISOString().slice(0, 10);
        byDay.push({ date: k, value: counts.get(k) || 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      setState({
        loading: false,
        unavailable: false,
        byDay,
        totalEvents: rows.length,
        distinctClients: clients.size,
      });
      setResultKey(key);
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  // Render-time guard: a result computed for a different range is never handed to the caller, so
  // no committed frame can show one range's totals beside another range's dates.
  return resultKey === key ? state : { ...EMPTY, loading: true };
}
