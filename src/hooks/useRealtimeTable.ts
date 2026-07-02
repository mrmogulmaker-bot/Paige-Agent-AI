import { useEffect } from "react";
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
  }
) {
  const {
    event = "*",
    filter,
    schema = "public",
    enabled = true,
  } = opts ?? {};

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`rt:${schema}:${table}:${filter ?? "all"}`)
      .on(
        // @ts-expect-error — supabase-js typing is looser than the runtime API
        "postgres_changes",
        { event, schema, table, ...(filter ? { filter } : {}) },
        onChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, filter, schema, enabled]);
}
