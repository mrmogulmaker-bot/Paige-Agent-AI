import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Multi-chat history for "Your Paige" (#94).
 *
 * The owner's personal working chats — lens='coach', contact_id IS NULL — each a
 * distinct thread the NULLS-DISTINCT single-active index keeps separate. Reads
 * and mutations go straight through RLS-gated table ops (no bespoke RPCs);
 * creation uses the existing paige_chat_thread_create. The server (paige-ai-chat)
 * is the single writer of turns — this hook never inserts a turn, so the sidebar
 * never shows a chat the backend didn't actually persist (§13/§15).
 */

export interface PaigeThread {
  id: string;
  title: string | null;
  last_message_at: string | null;
  message_count: number;
  is_archived: boolean;
  updated_at: string | null;
}

export interface PaigeTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  bundle_ref: Record<string, unknown> | null;
  surfaces_used: string[] | null;
  seq: number;
  created_at: string | null;
}

// The generated Supabase types don't yet carry these owner-chat rows/RPCs; the
// casts keep the call sites honest without loosening the whole client.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export function usePaigeThreads(opts: { callerUserId: string | null; tenantId: string | null }) {
  const { callerUserId, tenantId } = opts;
  const qc = useQueryClient();
  const enabled = !!callerUserId && !!tenantId;

  const threadsQuery = useQuery({
    queryKey: ["paige-threads", callerUserId, tenantId],
    enabled,
    queryFn: async (): Promise<PaigeThread[]> => {
      // §9 tenant isolation: scope the owner sidebar to the ACTIVE tenant. Without
      // this predicate, switching into a sub-account would re-fetch (the query key
      // carries tenantId) but return the same rows, seeping the owner's other-tenant
      // "Your Paige" threads into the child. `enabled` gates on tenantId, so this is
      // never undefined here — no tenant context ⇒ query disabled ⇒ no threads.
      const { data, error } = await db
        .from("paige_chat_threads")
        .select("id,title,last_message_at,message_count,is_archived,updated_at")
        .eq("tenant_id", tenantId)
        .eq("lens", "coach")
        .is("contact_id", null)
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaigeThread[];
    },
  });

  /** Load a thread's full turn history, oldest→newest by the monotonic seq. */
  const loadTurns = useCallback(async (threadId: string): Promise<PaigeTurn[]> => {
    const { data, error } = await db
      .from("paige_chat_turns")
      .select("id,role,content,bundle_ref,surfaces_used,seq,created_at")
      .eq("thread_id", threadId)
      .order("seq", { ascending: true });
    if (error) throw error;
    return (data ?? []) as PaigeTurn[];
  }, []);

  /** Create a thread lazily on first send. Title is a placeholder the server
   *  refines from the first message. */
  const ensureThread = useCallback(async (firstText?: string): Promise<string> => {
    const seed = (firstText ?? "").trim().replace(/\s+/g, " ").split(" ").slice(0, 7).join(" ").slice(0, 60);
    const { data, error } = await db.rpc("paige_chat_thread_create", {
      p_contact_id: null,
      p_lens: "coach",
      p_title: seed || "New chat",
      p_consent_snapshot: null,
    });
    if (error) throw error;
    // The RPC returns the new thread id (uuid).
    const id = typeof data === "string" ? data : data?.id ?? data;
    await qc.invalidateQueries({ queryKey: ["paige-threads", callerUserId, tenantId] });
    return id as string;
  }, [callerUserId, tenantId, qc]);

  const renameThread = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await db.from("paige_chat_threads").update({ title }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, title }) => {
      const key = ["paige-threads", callerUserId, tenantId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PaigeThread[]>(key);
      qc.setQueryData<PaigeThread[]>(key, (old) => (old ?? []).map((t) => (t.id === id ? { ...t, title } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["paige-threads", callerUserId, tenantId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["paige-threads", callerUserId, tenantId] }),
  });

  const archiveThread = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("paige_chat_threads").update({ is_archived: true }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const key = ["paige-threads", callerUserId, tenantId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PaigeThread[]>(key);
      qc.setQueryData<PaigeThread[]>(key, (old) => (old ?? []).filter((t) => t.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["paige-threads", callerUserId, tenantId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["paige-threads", callerUserId, tenantId] }),
  });

  /** Hard delete — irreversible (turns CASCADE). Confirm-gated at the call site. */
  const deleteThread = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("paige_chat_threads").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["paige-threads", callerUserId, tenantId] }),
  });

  /** Called after a turn persists so the rail reorders + picks up the auto-title. */
  const onTurnPersisted = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["paige-threads", callerUserId, tenantId] });
  }, [callerUserId, tenantId, qc]);

  return {
    threads: threadsQuery.data ?? [],
    isLoading: threadsQuery.isLoading,
    // True only once an ENABLED query actually settled a fetch. A disabled query
    // (ids not yet resolved) reports isLoading:false in react-query v5, so the
    // auto-resume effect must gate on this, not isLoading, or it latches on the
    // empty first render and never restores the most-recent chat (#94).
    isFetched: enabled && threadsQuery.isFetched,
    loadTurns,
    ensureThread,
    renameThread: (id: string, title: string) => renameThread.mutate({ id, title }),
    archiveThread: (id: string) => archiveThread.mutate(id),
    deleteThread: (id: string) => deleteThread.mutateAsync(id),
    onTurnPersisted,
  };
}

export type UsePaigeThreads = ReturnType<typeof usePaigeThreads>;
