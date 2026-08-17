/**
 * useSoloChat — the Solo shell's Paige CHAT adapter (solo Paige › Chat tab + floating panel).
 *
 * Replaces the fixture chat in `src/solo/agent.tsx` (the hardcoded CHAT_THREADS, the
 * canned CHAT_REPLY, and the fake setTimeout `useChat`) with the REAL production seam —
 * the SAME one `PaigeAIChat` drives:
 *   • usePaigeThreads(...)            → the RLS-gated thread sidebar + turn history
 *   • POST /functions/v1/paige-ai-chat (streaming SSE) → the real reply, streamed token-by-token
 *
 * It composes existing seams; it never re-queries or re-implements them (§18 one home).
 * The owner-locked Claude design in agent.tsx is untouched (§28) — this hook returns the
 * exact Solo shapes the Bubble / ChatSidebar / Composer already render.
 *
 * §9 / §51 TENANT ISOLATION: scope is derived from the SESSION, never a client-supplied
 * tenant_id — `callerUserId` from useScopedUserId() (auth.uid, impersonation-aware) and
 * `tenantId` from useTenantContext().activeTenantId. `platform:false` — the Solo shell is
 * a tenant surface; RLS + current_user_tenant_id() isolate sub-accounts, exactly as
 * useCommandCenter.ts resolves scope. Do not re-widen.
 *
 * §13 / §31 HONESTY:
 *   • The optimistic user bubble is the user's own text; the assistant bubble carries ONLY
 *     the tokens the server actually streamed — never a fabricated reply.
 *   • A LIVE assistant turn has NO sources: the edge writes `surfaces_used` to the persisted
 *     row but does NOT stream it, so `cited` is omitted on a fresh reply and appears only
 *     after the thread is reloaded via loadTurns (which reads the real surfaces_used). We
 *     never invent a source (§13).
 *   • bundle_ref cards (queued approvals / confirm / artifacts) have no equivalent element
 *     in the Solo Bubble today, and are already surfaced in the "She proposed today" rail
 *     (useSoloProposals). We drop those frames here rather than fabricate a card.
 *   • Errors are LOUD (console.error + a toast) and roll the optimistic turn back — never a
 *     silent swallow (§32). No empty catch blocks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedUserId } from "@/hooks/useScopedUserId";
import { useTenantContext } from "@/hooks/useTenantContext";
import { usePaigeThreads, type PaigeTurn } from "@/hooks/usePaigeThreads";
import { getUserClock } from "@/lib/userClock";
import { parsePaigeChatError } from "@/lib/paigeChatError";
import { toast } from "@/hooks/use-toast";

/** A message in the Solo Bubble shape (agent.tsx `Bubble`). */
export interface SoloChatMsg {
  r: "me" | "paige";
  t: string;
  /** Sources — from the persisted turn's `surfaces_used`; omitted on a live reply (§13). */
  cited?: string[];
}

/** A sidebar row in the Solo ChatSidebar / ThreadRow shape. */
export interface SoloThreadRow {
  id: string;
  n: string;
  w: string;
  grp: string;
  pin: boolean;
  /** Preview — no per-chat focus backend; always "none". */
  foc: string;
  /** Preview — no project grouping backend; always null. */
  proj: string | null;
  /** Preview — no preview-line backend; always "". */
  pre: string;
}

export interface UseSoloChat {
  threads: SoloThreadRow[];
  msgs: SoloChatMsg[];
  think: boolean;
  /** The active thread id, or null for a fresh (not-yet-created) chat. */
  cur: string | null;
  /** Select a thread → load its real turn history. */
  setCur: (id: string) => void;
  /** Send a message → stream the real reply through paige-ai-chat. */
  send: (text: string) => void;
  /** Start a fresh chat (the real thread is created lazily on first send). */
  newChat: () => void;
  /** The Solo-shaped row for the active thread, or a synthetic "New chat" row. */
  curThread: SoloThreadRow;
  /** Rename / archive / delete passthroughs for the ThreadRow ⋯ menu. */
  rename: (id: string, title: string) => void;
  archive: (id: string) => void;
  remove: (id: string) => Promise<void>;
  /** True once the (enabled) threads query has settled — for empty-state gating. */
  isFetched: boolean;
}

const DAY = 86_400_000;

/** Bucket a thread into one of the Solo sidebar's four recency groups. Everything
 *  older than 7 days lands in "Previous 30 days" so no real thread is ever hidden
 *  (the Solo ChatSidebar only renders those four group labels). */
function bucket(iso: string | null): string {
  const ts = iso ? new Date(iso).getTime() : 0;
  if (!ts) return "Previous 30 days";
  const age = Date.now() - ts;
  if (age < DAY) return "Today";
  if (age < 2 * DAY) return "Yesterday";
  if (age < 7 * DAY) return "Previous 7 days";
  return "Previous 30 days";
}

/** A compact relative-time label (unused by the current sidebar chrome, kept honest). */
function relTime(iso: string | null): string {
  const ts = iso ? new Date(iso).getTime() : 0;
  if (!ts) return "";
  const age = Date.now() - ts;
  if (age < 60_000) return "now";
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  if (age < DAY) return `${Math.floor(age / 3_600_000)}h ago`;
  if (age < 7 * DAY) return `${Math.floor(age / DAY)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Map persisted turns → Solo Bubble messages, carrying real sources honestly (§13). */
function turnsToSolo(turns: PaigeTurn[]): SoloChatMsg[] {
  return turns
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => {
      const surfaces = Array.isArray(t.surfaces_used)
        ? t.surfaces_used.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      return {
        r: t.role === "user" ? "me" : "paige",
        t: t.content,
        ...(surfaces.length ? { cited: surfaces } : {}),
      } as SoloChatMsg;
    });
}

export function useSoloChat(opts?: { autoResume?: boolean }): UseSoloChat {
  const autoResume = opts?.autoResume ?? true;

  // §9/§51 — scope from the SESSION, never a client-supplied tenant_id.
  const callerUserId = useScopedUserId();
  const { activeTenantId } = useTenantContext();
  const threadsApi = usePaigeThreads({ callerUserId, tenantId: activeTenantId, platform: false });

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<SoloChatMsg[]>([]);
  const [think, setThink] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Guards the streaming lifecycle so overlapping sends / selects can't clobber it.
  const streamingRef = useRef(false);

  const threads = useMemo<SoloThreadRow[]>(
    () =>
      threadsApi.threads.map((t) => ({
        id: t.id,
        n: t.title || "New chat",
        w: relTime(t.last_message_at ?? t.updated_at),
        grp: bucket(t.last_message_at ?? t.updated_at),
        pin: false, // Preview — no pin backend
        foc: "none", // Preview — no per-chat focus backend
        proj: null, // Preview — no project backend
        pre: "", // Preview — no preview-line backend
      })),
    [threadsApi.threads],
  );

  const curThread = useMemo<SoloThreadRow>(() => {
    const found = threads.find((t) => t.id === activeThreadId);
    return (
      found ?? {
        id: activeThreadId ?? "new",
        n: "New chat",
        w: "",
        grp: "Today",
        pin: false,
        foc: "none",
        proj: null,
        pre: "",
      }
    );
  }, [threads, activeThreadId]);

  const selectThread = useCallback(
    async (id: string) => {
      if (id === activeThreadId || streamingRef.current) return;
      try {
        const turns = await threadsApi.loadTurns(id);
        setMsgs(turnsToSolo(turns));
        setActiveThreadId(id);
      } catch (e) {
        console.error("[useSoloChat] load thread failed:", e);
        toast({
          title: "Couldn't open that chat",
          description: "Give it another try in a moment.",
          variant: "destructive",
        });
      }
    },
    [activeThreadId, threadsApi],
  );

  // On first mount (Chat tab / opened panel), resume the most-recent thread — gated on
  // isFetched (a real, enabled fetch settled), NOT isLoading, exactly like PaigeAIChat,
  // or it latches on the empty pre-resolution render and strands the owner on a blank
  // chat. When there are no threads, stay on a fresh chat → the crafted empty state
  // renders (never a fabricated Morning brief).
  useEffect(() => {
    if (!autoResume || hydrated || !threadsApi.isFetched) return;
    const latest = threadsApi.threads[0];
    if (latest) void selectThread(latest.id);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, hydrated, threadsApi.isFetched, threadsApi.threads]);

  const streamTurn = useCallback(
    async (soloBase: SoloChatMsg[], rollback: SoloChatMsg[], userText: string) => {
      streamingRef.current = true;
      setThink(true);
      // The edge reads only role/content — map the Solo bubbles to that shape.
      const payloadMessages = soloBase.map((m) => ({ role: m.r === "me" ? "user" : "assistant", content: m.t }));
      let assistantText = "";
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          toast({ title: "Please sign in", description: "Sign in to chat with Paige.", variant: "destructive" });
          setMsgs(rollback);
          setThink(false);
          streamingRef.current = false;
          return;
        }

        // Create the thread lazily on the first send, then stream into it. The server
        // is the single writer of turns — we only pass the id.
        let threadId = activeThreadId;
        try {
          if (!threadId) {
            threadId = await threadsApi.ensureThread(userText);
            setActiveThreadId(threadId);
          }
        } catch (e) {
          console.error("[useSoloChat] ensureThread failed:", e);
          toast({
            title: "Couldn't start that chat",
            description: "Give it another try in a moment.",
            variant: "destructive",
          });
          setMsgs(rollback);
          setThink(false);
          streamingRef.current = false;
          return;
        }

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: payloadMessages,
            ...(threadId ? { threadId } : {}),
            ...getUserClock(),
          }),
        });

        if (!response.ok) {
          const chatErr = await parsePaigeChatError(response);
          toast({ title: chatErr.title, description: chatErr.description, variant: "destructive" });
          setMsgs(rollback);
          setThink(false);
          streamingRef.current = false;
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let streamDone = false;
        let started = false;

        while (reader && !streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              streamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              // Structured lifecycle frames — no Solo Bubble element renders them, and
              // approvals/confirms/artifacts are already surfaced in the "She proposed
              // today" rail. Drop them here rather than fabricate a card (§13).
              if (parsed.paige_step) continue;
              if (parsed.paige_phase === "writing") continue;
              if (parsed.paige_compacting) continue;
              if (Array.isArray(parsed.approval_queued)) continue;
              if (parsed.paige_confirm?.summary) continue;
              if (parsed.paige_artifact) continue;

              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) {
                if (!started) {
                  started = true;
                  setThink(false);
                }
                assistantText += content;
                setMsgs([...soloBase, { r: "paige", t: assistantText }]);
              }
            } catch {
              // Partial JSON across a chunk boundary — re-buffer and read more.
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }

        setThink(false);
        streamingRef.current = false;
        // Reorder the rail + pick up the server-side auto-title. The assistant turn +
        // title write run in the edge fn's waitUntil after the stream closes, so
        // refresh once now and again shortly to catch that commit.
        threadsApi.onTurnPersisted();
        window.setTimeout(() => threadsApi.onTurnPersisted(), 1800);
      } catch (error) {
        console.error("[useSoloChat] chat error:", error);
        toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
        setMsgs(rollback);
        setThink(false);
        streamingRef.current = false;
      }
    },
    [activeThreadId, threadsApi],
  );

  const send = useCallback(
    (text: string) => {
      const userText = text.trim();
      if (!userText || streamingRef.current) return;
      const rollback = msgs;
      const soloBase: SoloChatMsg[] = [...msgs, { r: "me", t: userText }];
      setMsgs(soloBase);
      void streamTurn(soloBase, rollback, userText);
    },
    [msgs, streamTurn],
  );

  const newChat = useCallback(() => {
    if (streamingRef.current) return;
    setActiveThreadId(null);
    setMsgs([]);
  }, []);

  const setCur = useCallback((id: string) => void selectThread(id), [selectThread]);

  const rename = useCallback((id: string, title: string) => threadsApi.renameThread(id, title), [threadsApi]);
  const archive = useCallback(
    (id: string) => {
      threadsApi.archiveThread(id);
      if (id === activeThreadId) {
        setActiveThreadId(null);
        setMsgs([]);
      }
    },
    [threadsApi, activeThreadId],
  );
  const remove = useCallback(
    async (id: string) => {
      await threadsApi.deleteThread(id);
      if (id === activeThreadId) {
        setActiveThreadId(null);
        setMsgs([]);
      }
    },
    [threadsApi, activeThreadId],
  );

  return {
    threads,
    msgs,
    think,
    cur: activeThreadId,
    setCur,
    send,
    newChat,
    curThread,
    rename,
    archive,
    remove,
    isFetched: threadsApi.isFetched,
  };
}
