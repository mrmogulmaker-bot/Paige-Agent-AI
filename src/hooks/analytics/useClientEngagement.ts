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
  byDay: EngagementDay[];
  totalEvents: number;
  distinctClients: number;
}

const EMPTY: ClientEngagement = {
  loading: true,
  byDay: [],
  totalEvents: 0,
  distinctClients: 0,
};

export function useClientEngagement(start: string, end: string): ClientEngagement {
  const [state, setState] = useState<ClientEngagement>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end + "T23:59:59").toISOString();

      const { data } = await supabase
        .from("paige_client_events")
        .select("occurred_at, contact_id")
        .gte("occurred_at", startIso)
        .lte("occurred_at", endIso)
        .limit(50000);

      if (cancelled) return;

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
        byDay,
        totalEvents: rows.length,
        distinctClients: clients.size,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return state;
}
