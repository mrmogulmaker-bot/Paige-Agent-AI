// The Vibe Studio session's OWN chat (#292) — a LEAN, create-focused conversation with the tenant's
// creative-design agent (one of Paige's specialists, NOT Paige; §8/§14). You talk to it here to
// CREATE — "make an image of X", "build a landing page for Y" — it runs the real generation tools and
// what it makes renders right here in the session window.
//
// §18: this is NOT a second chat system and NOT the full Your-Paige console. It reuses the existing
// paige-ai-chat streaming engine + paige_chat_threads/paige_chat_turns; the identity is swapped to the
// design-studio sub-agent server-side (gated on the thread's studio_session_id). This surface only:
// ensures the session's thread, hydrates its turns, streams a turn, and renders what got created.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PromptComposer } from "./PromptComposer";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Generated Supabase types don't yet carry the studio thread column/RPC — a scoped cast keeps the
// call sites honest without loosening the whole client (same pattern as usePaigeThreads).
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

interface ChatMsg { role: "user" | "assistant"; content: string }
interface MadeImage { id: string; url: string; title: string }

export function StudioChat({
  sessionId,
  tenantId,
  className,
}: {
  sessionId: string | null;
  tenantId: string | null;
  className?: string;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null); // live "working…" line
  const [images, setImages] = useState<MadeImage[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only images created from THIS working session forward render in the window (Phase 1 — true
  // session-artifact linking is a tracked follow-up). Captured once per mount, before any turn.
  const openedAtRef = useRef<string>(new Date().toISOString());

  // Pull the tenant's images created since this session opened — what the agent has made here.
  const refreshImages = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data } = await db
        .from("marketing_content")
        .select("id, title, image_url, created_at")
        .eq("tenant_id", tenantId)
        .eq("kind", "image")
        .gte("created_at", openedAtRef.current)
        .order("created_at", { ascending: false })
        .limit(24);
      setImages(
        ((data ?? []) as Array<{ id: string; title: string | null; image_url: string | null }>)
          .filter((r) => !!r.image_url)
          .map((r) => ({ id: r.id, url: r.image_url as string, title: r.title || "Image" })),
      );
    } catch { /* the strip is best-effort; a miss never blocks the chat */ }
  }, [tenantId]);

  // Ensure the session's thread + hydrate its turns whenever the session changes.
  useEffect(() => {
    let live = true;
    if (!sessionId) { setThreadId(null); setMessages([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const { data: tid, error } = await db.rpc("paige_studio_thread_ensure", { p_session_id: sessionId });
        if (error) throw error;
        if (!live) return;
        const id = tid ? String(tid) : null;
        setThreadId(id);
        if (id) {
          const { data: turns } = await db
            .from("paige_chat_turns")
            .select("role, content, seq")
            .eq("thread_id", id)
            .in("role", ["user", "assistant"])
            .order("seq", { ascending: true });
          if (live) {
            setMessages(((turns ?? []) as ChatMsg[]).map((t) => ({ role: t.role, content: t.content })));
          }
        }
      } catch {
        if (live) toast.error("Couldn't open this session's chat.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [sessionId]);

  useEffect(() => { void refreshImages(); }, [refreshImages]);

  // Keep the transcript pinned to the latest as it streams.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, note]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !threadId) return;
    setInput("");
    setNote(null);
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessages(messages); // roll back the optimistic pair — nothing was sent (§13)
        setInput(trimmed);     // give them their words back
        toast.error("Please sign in again.");
        setSending(false);
        return;
      }
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: next, threadId }),
      });
      if (!resp.ok) throw new Error(resp.status === 429 ? "Give it a moment — too many requests." : "The chat hit a snag.");

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      let buffer = "";
      let done = false;
      while (reader && !done) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.paige_step) { setNote(parsed.paige_step?.label ?? null); continue; }
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistant += delta;
              setMessages([...next, { role: "assistant", content: assistant }]);
            }
          } catch { buffer = line + "\n" + buffer; break; } // partial JSON — re-buffer
        }
      }
      // §13: if the stream produced nothing, say so honestly rather than leave an empty bubble.
      if (!assistant.trim()) {
        setMessages([...next, { role: "assistant", content: "I didn't catch that — try saying it another way?" }]);
      }
    } catch (e) {
      setMessages(messages); // roll back the optimistic pair
      setInput(trimmed);     // give the owner their words back — never lose typed text on a transient error
      toast.error(e instanceof Error ? e.message : "The chat hit a snag.");
    } finally {
      setSending(false);
      setNote(null);
      void refreshImages(); // whatever got created this turn now appears in the window
    }
  }, [messages, sending, threadId, refreshImages]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* What the agent has made this session — renders right in the window (the owner's ask). */}
      {images.length > 0 && (
        <div className="shrink-0 border-b border-[hsl(var(--studio-chrome-border)/0.5)] px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Recent images
          </div>
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {images.map((img) => (
              <a
                key={img.id} href={img.url} target="_blank" rel="noreferrer"
                className="group relative block h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--studio-chrome-border)/0.6)] bg-black/20"
                title={img.title}
              >
                <img src={img.url} alt={img.title} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none" loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Opening your session…
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-md pt-8 text-center">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--studio-chrome-border)/0.6)] bg-[hsl(var(--foreground)/0.04)] text-foreground">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm text-foreground">Tell me what you want to make.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              “Make an image of a sunrise over mountains.” · “Build a landing page for my coaching offer.” · “Draft a discovery form.”
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-[hsl(var(--ring)/0.16)] text-foreground"
                    : "border border-[hsl(var(--studio-chrome-border)/0.5)] bg-[hsl(var(--foreground)/0.03)] text-foreground",
                )}
              >
                {m.content || (sending && i === messages.length - 1 ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                    {note ?? "Working…"}
                  </span>
                ) : null)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer — reuse the ONE studio composer (§18), circular send, docked. */}
      <div className="shrink-0 px-3 pb-3">
        <PromptComposer
          mode="page"
          value={input}
          onChange={setInput}
          onSubmit={(v) => void send(v)}
          busy={sending}
          disabled={loading || !threadId}
          placeholder="Tell your design agent what to make…"
          helperText=""
          submitLabel="Send"
          busyLabel="Working…"
          sendShape="circle"
          minRows={1}
        />
      </div>
    </div>
  );
}

export default StudioChat;
