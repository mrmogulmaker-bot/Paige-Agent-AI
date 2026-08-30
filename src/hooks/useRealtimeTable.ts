import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Subscribes to Postgres changes on a public.<table> and invokes `onChange`
 * for every event visible under the caller's RLS. RLS is enforced server-side —
 * customers only receive rows they can already SELECT, and tenant admins only
 * receive rows in their tenant scope.
 *
 * Ship #2.8 — real-time sync layer. §200 platform-agnostic; no tenant
 * hardcoding. Use for any surface that needs live updates.
 */
export function useRealtimeTable<T = unknown>(
  table: string,
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, T>>) => void,
  opts?: {
    event?: "INSERT" | "UPDATE" | "DELETE" | "*";
    filter?: string; // e.g. `tenant_id=eq.${tenantId}`
    schema?: string;
    enabled?: boolean;
    /**
     * Channel lifecycle, for callers that must not present stale data as live.
     * A channel that fails to subscribe — or later drops to `CHANNEL_ERROR` /
     * `TIMED_OUT` / `CLOSED` — stops delivering silently: `onChange` simply
     * never fires again, so nothing downstream errors and a surface can keep
     * asserting it is live over data that can no longer update.
     *
     * Optional and additive: callers that do not pass it behave exactly as
     * before.
     */
    onStatus?: (status: string) => void;
    /**
     * Bump to tear the current subscription down and build a fresh one.
     *
     * A channel that has stopped delivering cannot be revived by re-reading, so
     * a caller offering the person a way back to a live surface needs a way to
     * ask for a new subscription. Any changing value works; callers increment.
     */
    resubscribeKey?: number;
  }
) {
  const {
    event = "*",
    filter,
    schema = "public",
    enabled = true,
    onStatus,
    resubscribeKey = 0,
  } = opts ?? {};

  // Held in a ref so a caller passing an inline callback cannot tear down and
  // re-create the subscription on every render.
  const statusRef = useRef(onStatus);
  useEffect(() => { statusRef.current = onStatus; }, [onStatus]);

  useEffect(() => {
    if (!enabled) return;
    /**
     * Status is scoped to THIS subscription.
     *
     * Tearing a channel down makes it emit `CLOSED` through its own status
     * callback, immediately and locally — before any server acknowledgement
     * (proven against the installed library in `useRealtimeTable.lifecycle.test.ts`).
     * That teardown is ours: the channel did not die, we replaced it. Reporting
     * it would tell a caller its live data had stopped arriving at the exact
     * moment a healthy new subscription was taking over — and when nothing
     * subscribes after it (the tenant clearing, an unmount) no later
     * `SUBSCRIBED` would ever arrive to correct that.
     */
    let current = true;
    const channel = supabase
      .channel(`rt:${schema}:${table}:${filter ?? "all"}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event, schema, table, ...(filter ? { filter } : {}) }, onChange)
      .subscribe((status) => { if (current) statusRef.current?.(status); });

    return () => {
      current = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, filter, schema, enabled, resubscribeKey]);
}
