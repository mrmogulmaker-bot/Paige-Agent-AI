// The Vibe Studio session's OWN chat (#292) — the LIVE, two-way conversation with the tenant's
// creative-design agent (one of Paige's specialists, NOT Paige; §8/§14). The customer only talks:
// "make an image of X", "build a landing page for Y", "make the headline bolder" — the agent runs
// the real generation tools and what it makes renders on the project canvas to the RIGHT of this
// chat. This is the whole session surface: no mode tabs, no type picker, one conversation (§18/§21).
//
// §18: NOT a second chat system and NOT the full Your-Paige console. It reuses the paige-ai-chat
// streaming engine + paige_chat_threads/paige_chat_turns; the identity is swapped to the
// design-studio sub-agent server-side (gated on the thread's studio_session_id), and the same gate
// LINKS what it creates to the project and streams back a `paige_artifact` frame naming exactly what
// to render (server-authoritative — the client never guesses). This surface: ensures the session's
// thread, hydrates its turns, streams a turn, lifts the newest artifact + busy/step to the parent
// canvas, and renders the agent's clickable option chips (`ask_choices`).
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { PromptComposer } from "./PromptComposer";
import { uploadGrowthAsset } from "./studio";
import type { GrowthAsset } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** The agent writes in markdown (**bold**, lists, links) — render it as prose, never as raw text with
 *  literal asterisks (owner 2026-07-18: "this has to be a good experience"). Same token-styled
 *  treatment as DocumentPreview's Prose. The value is coerced to a string at the boundary (react-markdown
 *  v10 throws on a truthy non-string), so a mis-typed value degrades to empty rather than crashing the
 *  whole bubble (§13 — degrade, don't crash). User turns stay plain text. */
function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_strong]:font-semibold [&_strong]:text-foreground [&_p]:mt-2 first:[&_p]:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_code]:rounded [&_code]:bg-[hsl(var(--foreground)/0.06)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(text ?? "")}</ReactMarkdown>
    </div>
  );
}

// Generated Supabase types don't yet carry the studio thread column/RPC — a scoped cast keeps the
// call sites honest without loosening the whole client (same pattern as usePaigeThreads).
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ChatMsg { role: "user" | "assistant"; content: string }
interface ChoiceOption { label: string; value: string }
interface Choices { prompt: string; options: ChoiceOption[]; multi?: boolean }

/** What the conversation last put on the canvas — server-authoritative (from the paige_artifact
 *  frame), so the parent renders EXACTLY what was built, never a guessed manifest index. */
export interface StudioChatArtifact {
  kind: "page" | "funnel" | "content" | "document";
  id: string;
  title: string;
  url: string | null; // present for an image (content); null for page/funnel/document
}

export function StudioChat({
  sessionId,
  tenantId,
  className,
  seedBrief,
  onBusy,
  onNote,
  onArtifact,
}: {
  sessionId: string | null;
  tenantId: string | null;
  className?: string;
  /** The dashboard→session brief. Auto-sent ONCE as the first turn when the session is brand new
   *  (no prior turns), so the initial build runs through THIS chat, not a second engine. */
  seedBrief?: string | null;
  /** True while a turn streams — lets the canvas show a live "building" state, not a dead pane. */
  onBusy?: (busy: boolean) => void;
  /** The latest real streamed step label — the honest cutscene narration (§13). */
  onNote?: (note: string | null) => void;
  /** The artifact this turn produced (from the server's paige_artifact frame). Null = no visual
   *  artifact this turn (e.g. a pure-copy or chat-only reply) — the parent keeps the current stage. */
  onArtifact?: (artifact: StudioChatArtifact | null) => void;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null); // live "working…" line
  const [loading, setLoading] = useState(true);
  const [choices, setChoices] = useState<Choices | null>(null); // pending clickable options
  const [multiPicks, setMultiPicks] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<GrowthAsset[]>([]); // reference images dropped in-chat
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Parent callbacks held in refs so a new function identity never re-fires the sync effects.
  const cb = useRef({ onBusy, onNote, onArtifact });
  useEffect(() => { cb.current = { onBusy, onNote, onArtifact }; }, [onBusy, onNote, onArtifact]);
  useEffect(() => { cb.current.onBusy?.(sending); }, [sending]);
  useEffect(() => { cb.current.onNote?.(note); }, [note]);

  // Ensure the session's thread + hydrate its turns whenever the session changes.
  const seededRef = useRef<string | null>(null);
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

  // Autostart handoff (§3 / post-deploy fix): a brand-new project fires its FIRST build through THIS
  // chat. `sessionSeedBrief` arrives ASYNC (the parent resolves it after loadSession), often AFTER
  // this component mounts — so the seed can't live in the thread-ensure effect's mount closure. This
  // dedicated effect fires the moment ALL of {thread ready · not loading · no turns yet · brief
  // present} hold, guarded per-session so it never double-fires.
  useEffect(() => {
    if (!sessionId || !threadId || loading || sending) return;
    if (messages.length > 0) return;
    const brief = seedBrief?.trim();
    if (!brief || seededRef.current === sessionId) return;
    seededRef.current = sessionId;
    void send(brief);
  }, [sessionId, threadId, loading, sending, messages.length, seedBrief]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the transcript pinned to the latest as it streams.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, note, choices]);

  // Send a turn. `display` lets a tapped chip show its friendly label while the model receives the
  // canonical value.
  const send = useCallback(async (text: string, opts?: { display?: string }) => {
    const trimmed = text.trim();
    // The reference images the customer dropped this turn — snapshot before we clear the tray, so an
    // image-only turn ("here, build from this") still carries them. Images alone are a valid turn (N4).
    const turnAttachments = attachments;
    const hasImages = turnAttachments.length > 0;
    if ((!trimmed && !hasImages) || sending || !threadId) return;
    setInput("");
    setNote(null);
    setChoices(null); // answering (or a fresh turn) clears any pending decision (guards double-fire)
    setMultiPicks(new Set());
    // Image-only turns still need words for the transcript + the model — give it a natural default.
    const modelText = trimmed || "Here's a reference image — use it as the starting point for what you build.";
    const shown = opts?.display ?? (trimmed || (hasImages ? `Shared ${turnAttachments.length} reference image${turnAttachments.length > 1 ? "s" : ""}` : trimmed));
    const next = [...messages, { role: "user" as const, content: shown }];
    // What the MODEL receives (canonical value); the transcript shows `shown`.
    const modelMessages = [...messages, { role: "user" as const, content: modelText }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setSending(true);
    let gotChoices = false;
    let gotArtifact: StudioChatArtifact | null = null;
    let ok = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessages(messages); setInput(trimmed); // roll back; give them their words back (§13)
        toast.error("Please sign in again."); setSending(false); return;
      }
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          messages: modelMessages,
          threadId,
          attachments: hasImages
            ? turnAttachments.map((a) => ({ url: a.url, name: a.name, mimeType: a.mimeType, kind: a.kind }))
            : undefined,
        }),
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
            // The agent asked a clickable decision — render its chips under the question (§13-honest:
            // chips appear ONLY when the model actually emits them; the prompt IS the assistant turn).
            if (parsed.paige_choices) {
              gotChoices = true;
              const c = parsed.paige_choices as Choices;
              setChoices(c);
              if (!assistant.trim()) { assistant = c.prompt; setMessages([...next, { role: "assistant", content: assistant }]); }
              continue;
            }
            // The server named exactly what to render on the canvas this turn.
            if (parsed.paige_artifact) { gotArtifact = parsed.paige_artifact as StudioChatArtifact; continue; }
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistant += delta;
              setMessages([...next, { role: "assistant", content: assistant }]);
            }
          } catch { buffer = line + "\n" + buffer; break; } // partial JSON — re-buffer
        }
      }
      // §13: nothing streamed AND no chips → say so honestly rather than leave an empty bubble.
      if (!assistant.trim() && !gotChoices) {
        setMessages([...next, { role: "assistant", content: "I didn't catch that — try saying it another way?" }]);
      }
      ok = true;
    } catch (e) {
      setMessages(messages); setInput(trimmed); // roll back; never lose typed text on a transient error
      toast.error(e instanceof Error ? e.message : "The chat hit a snag.");
    } finally {
      setSending(false);
      setNote(null);
      // Clear the reference-image tray only on a clean turn (N3) — a failed turn keeps them so the
      // customer doesn't have to re-attach after rolling back.
      if (ok && hasImages) setAttachments([]);
      // Hand the parent exactly what the server said it built this turn (null = keep the stage).
      cb.current.onArtifact?.(gotArtifact);
    }
  }, [messages, sending, threadId, attachments]);

  // The customer dropped image(s) into the chat — upload each to the tenant's growth-assets bucket so
  // it has a public URL the server can fetch + base64-inline as build input. Images only in-chat (§18:
  // the one composer, no picker) — documents route through the doc-attach path, not this tray.
  const onFilesSelected = useCallback(async (files: File[]) => {
    if (!tenantId) { toast.error("Sign in to attach images."); return; }
    setAttachmentsBusy(true);
    try {
      for (const f of files) {
        const asset = await uploadGrowthAsset(tenantId, f, ["image"]);
        setAttachments((prev) => (prev.length >= 3 ? prev : [...prev, asset]));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't attach that image.");
    } finally {
      setAttachmentsBusy(false);
    }
  }, [tenantId]);

  const onRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const isLastAssistant = (i: number) => i === messages.length - 1 && messages[i]?.role === "assistant";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* Who you're talking to — the tenant's design specialist, never Paige (§8/§14). */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[hsl(var(--studio-chrome-border)/0.5)] px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--studio-chrome-border)/0.6)] bg-[hsl(var(--foreground)/0.04)] text-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Design agent</p>
          <p className="truncate text-[11px] text-muted-foreground">Your creative specialist — building right here</p>
        </div>
      </div>

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
              “Build a landing page for my coaching offer.” · “Make an image of a sunrise over mountains.” · “Draft a discovery form.” · “Make the headline bolder.”
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "whitespace-pre-wrap bg-[hsl(var(--ring)/0.16)] text-foreground"
                    : "border border-[hsl(var(--studio-chrome-border)/0.5)] bg-[hsl(var(--foreground)/0.03)] text-foreground",
                )}
              >
                {m.content ? (
                  m.role === "assistant" ? (
                    <ChatMarkdown text={m.content} />
                  ) : (
                    m.content
                  )
                ) : sending && i === messages.length - 1 ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                    {note ?? "Working…"}
                  </span>
                ) : null}
              </div>

              {/* Clickable option chips — the agent asked a decision; tap one (or several) and it
                  becomes a real user turn. §11: gold reserved for the multi-select Continue act. */}
              {choices && isLastAssistant(i) && (
                <div className="mt-2 max-w-[85%]" role={choices.multi ? "listbox" : "radiogroup"} aria-label={choices.prompt}>
                  <div className="flex flex-wrap gap-2">
                    {choices.options.map((opt) => {
                      const picked = multiPicks.has(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role={choices.multi ? "option" : "radio"}
                          aria-checked={choices.multi ? picked : undefined}
                          disabled={sending}
                          onClick={() => {
                            if (choices.multi) {
                              setMultiPicks((prev) => {
                                const nextSet = new Set(prev);
                                if (nextSet.has(opt.value)) nextSet.delete(opt.value);
                                else nextSet.add(opt.value);
                                return nextSet;
                              });
                            } else {
                              void send(opt.value, { display: opt.label });
                            }
                          }}
                          className={cn(
                            "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors motion-reduce:transition-none disabled:opacity-50",
                            picked
                              ? "border-primary/70 bg-[hsl(var(--ring)/0.14)] font-medium text-foreground"
                              : "border-[hsl(var(--studio-chrome-border)/0.6)] bg-[hsl(var(--foreground)/0.03)] text-foreground hover:bg-[hsl(var(--foreground)/0.06)]",
                          )}
                        >
                          {picked && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {choices.multi && (
                    <Button
                      variant="gold" size="sm" className="mt-2"
                      disabled={sending || multiPicks.size === 0}
                      onClick={() => {
                        const picks = choices.options.filter((o) => multiPicks.has(o.value));
                        void send(picks.map((p) => p.value).join(", "), { display: picks.map((p) => p.label).join(" · ") });
                      }}
                    >
                      Continue
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Composer — reuse the ONE studio composer (§18), circular send, docked. Always live, so a
          chip is always optional (the customer can just talk). */}
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
          attachments={attachments}
          onFilesSelected={onFilesSelected}
          onRemoveAttachment={onRemoveAttachment}
          attachmentsBusy={attachmentsBusy}
        />
      </div>
    </div>
  );
}

export default StudioChat;
