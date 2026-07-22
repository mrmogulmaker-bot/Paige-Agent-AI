import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

/**
 * useHandoffQueue — pending role→role lead handoffs (IA slice 1c-ix).
 *
 * Reads `team_handoff_queue` DIRECTLY (not through usePendingApprovals): the
 * action-kind is record_only and deliberately NOT in the approvals queue — the queue
 * row IS the artifact, and accept_handoff() is its own confirm gate. team_handoff_queue
 * is normal-RLS readable, so realtime is fine here (unlike presence). §9: the ONLY place
 * the tenant id appears is the realtime filter string, sourced from useTenantContext().
 *
 * HONESTY (§13): there is NO producer writing rows today, so this returns [] and the UI
 * renders a crafted EmptyState. The query + realtime are REAL, so the panel fills the
 * instant a producer (the filed "mark lead qualified → file handoff" seam) writes.
 */
export type HandoffRow = {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  from_user_id: string | null;
  to_user_id_target: string | null;
  to_role_target: string | null;
  lead_context: Record<string, unknown> | null;
  urgency: "low" | "normal" | "high" | "urgent";
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type UseHandoffQueueResult = {
  items: HandoffRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useHandoffQueue(activeTenantId: string | null): UseHandoffQueueResult {
  const [items, setItems] = useState<HandoffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const seqRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const seq = ++seqRef.current;
    try {
      // No client-SUPPLIED tenant param — RLS scopes the read (§9). `team_handoff_queue`
      // is live on prod but not yet in the generated types, so cast the table name (repo
      // precedent for post-migration tables, e.g. rag_documents/tenant_knowledge_docs).
      // The activeTenantId predicate is defense-in-depth: it aligns the INITIAL fetch with
      // the realtime filter so a platform operator (whose RLS can read across tenants) only
      // ever pulls the SELECTED tenant's queue, and it is sourced ONLY from useTenantContext.
      let query = supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("team_handoff_queue" as any)
        .select(
          "id, tenant_id, contact_id, from_user_id, to_user_id_target, to_role_target, lead_context, urgency, status, created_at, expires_at, accepted_at, accepted_by",
        )
        .eq("status", "pending");
      if (activeTenantId) query = query.eq("tenant_id", activeTenantId);
      const { data, error: qErr } = await query.order("created_at", { ascending: true });

      if (!mountedRef.current || seq !== seqRef.current) return;
      if (qErr) {
        setError(qErr.message);
        return;
      }
      // `data` is a post-migration table not yet in generated types (cast via unknown,
      // repo precedent) — the row shape matches HandoffRow by the explicit select above.
      setItems((data ?? []) as unknown as HandoffRow[]);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load handoffs");
    } finally {
      if (mountedRef.current && seq === seqRef.current) setLoading(false);
    }
  }, [activeTenantId]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Realtime: normal-RLS table, tenant filter from useTenantContext ONLY (§9).
  useRealtimeTable(
    "team_handoff_queue",
    () => {
      void load();
    },
    {
      filter: activeTenantId ? `tenant_id=eq.${activeTenantId}` : undefined,
      enabled: !!activeTenantId,
    },
  );

  return { items, loading, error, refresh };
}
