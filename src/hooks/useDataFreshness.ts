import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SyncState {
  source_key: string;
  last_synced_at: string;
  last_sync_status: string;
  last_sync_error: string | null;
  record_count: number | null;
}

/**
 * Ship #2.8 — Staleness indicator source of truth.
 * Reads paige_data_source_sync_state for a given (tenantId, sourceKey).
 * RLS scopes the row to the caller's tenant automatically.
 */
export function useDataFreshness(sourceKey: string, tenantId?: string | null) {
  const [state, setState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let q = supabase
        .from("paige_data_source_sync_state")
        .select("source_key,last_synced_at,last_sync_status,last_sync_error,record_count")
        .eq("source_key", sourceKey)
        .maybeSingle();
      if (tenantId) q = supabase
        .from("paige_data_source_sync_state")
        .select("source_key,last_synced_at,last_sync_status,last_sync_error,record_count")
        .eq("source_key", sourceKey)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const { data } = await q;
      if (!cancelled) {
        setState(data as SyncState | null);
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel(`sync-state:${sourceKey}:${tenantId ?? "any"}`)
      .on(
        // @ts-expect-error — supabase-js typing looser than runtime
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_data_source_sync_state" },
        (payload: { new: SyncState }) => {
          if (payload.new?.source_key === sourceKey) setState(payload.new);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sourceKey, tenantId]);

  return { state, loading };
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
