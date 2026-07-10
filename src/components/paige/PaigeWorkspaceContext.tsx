// Thin workspace context: the active tenant id, the live knowledge counts that
// feed the vitals strip + rail hints (spec §1.8 — a read-only select on
// tenant_knowledge_docs, RLS-scoped to the active tenant), and a small
// `knowledgeAdded` event bus so the KnowledgePanel can tell the vitals chip and
// the composer banner "Paige just learned from {title}" (spec §1.6 tie-back).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface KnowledgeCounts {
  docs: number;
  chunks: number;
}

interface WorkspaceCtx {
  activeTenantId: string | null;
  counts: KnowledgeCounts;
  refreshCounts: () => void;
  /** Fired by the KnowledgePanel when a doc finishes indexing. */
  notifyKnowledgeAdded: (title: string) => void;
  /** Subscribe to knowledgeAdded events; returns an unsubscribe. */
  subscribeKnowledgeAdded: (cb: (title: string) => void) => () => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function PaigeWorkspaceProvider({
  activeTenantId,
  children,
}: {
  activeTenantId: string | null;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = useState<KnowledgeCounts>({ docs: 0, chunks: 0 });
  const subscribers = useRef(new Set<(title: string) => void>());

  const refreshCounts = useCallback(async () => {
    if (!activeTenantId) {
      setCounts({ docs: 0, chunks: 0 });
      return;
    }
    // RLS scopes this to the active tenant; we only need chunk_count to sum.
    const { data, error } = await supabase
      .from("tenant_knowledge_docs" as any)
      .select("chunk_count");
    if (error) return;
    const rows = (data as { chunk_count: number | null }[]) ?? [];
    setCounts({
      docs: rows.length,
      chunks: rows.reduce((s, r) => s + (r.chunk_count ?? 0), 0),
    });
  }, [activeTenantId]);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const subscribeKnowledgeAdded = useCallback((cb: (title: string) => void) => {
    subscribers.current.add(cb);
    return () => { subscribers.current.delete(cb); };
  }, []);

  const notifyKnowledgeAdded = useCallback((title: string) => {
    refreshCounts();
    subscribers.current.forEach((cb) => cb(title));
  }, [refreshCounts]);

  return (
    <Ctx.Provider value={{ activeTenantId, counts, refreshCounts, notifyKnowledgeAdded, subscribeKnowledgeAdded }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePaigeWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePaigeWorkspace must be used within PaigeWorkspaceProvider");
  return ctx;
}
