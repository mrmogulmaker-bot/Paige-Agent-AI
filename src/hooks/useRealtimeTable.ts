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
  }
) {
  const {
    event = "*",
    filter,
    schema = "public",
    enabled = true,
    onStatus,
  } = opts ?? {};

  // Held in a ref so a caller passing an inline callback cannot tear down and
  // re-create the subscription on every render.
  const statusRef = useRef(onStatus);
  useEffect(() => { statusRef.current = onStatus; }, [onStatus]);

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`rt:${schema}:${table}:${filter ?? "all"}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event, schema, table, ...(filter ? { filter } : {}) }, onChange)
      .subscribe((status) => { statusRef.current?.(status); });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, filter, schema, enabled]);
}
