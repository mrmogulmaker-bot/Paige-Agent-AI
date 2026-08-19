import { useState, useRef, useEffect } from "react";
import { PaigeReasoningStrip, StepTimeline, upsertStep, type PaigeStep } from "@/components/dashboard/PaigeStepTrace";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Clock, Paperclip } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parsePaigeChatError } from "@/lib/paigeChatError";
import { DictationMicButton } from "@/components/voice/DictationMicButton";
import { appendDictation } from "@/lib/voice/useDictation";
import { ResponseFeedback } from "@/components/chat/ResponseFeedback";
import { MessageMeta } from "@/components/chat/MessageMeta";
import { SlashCommandMenu } from "@/components/chat/SlashCommandMenu";
import { useQuery } from "@tanstack/react-query";
import { getUserClock } from "@/lib/userClock";
import { EntityDiagramCard } from "@/components/chat/EntityDiagramCard";
import { extractEntityDiagram } from "@/lib/entityDiagram";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { PaigeConfirmCard } from "@/components/chat/PaigeConfirmCard";
import { usePlaybook } from "@/lib/playbook";
import { cn } from "@/lib/utils";
import type { QuickChip } from "@/components/paige/commandCenterTypes";
import { usePaigeThreads, type PaigeThread } from "@/hooks/usePaigeThreads";
import { useScopedUserId } from "@/hooks/useScopedUserId";
import { useTenantContext } from "@/hooks/useTenantContext";
import { ThreadRail } from "@/components/dashboard/paige/ThreadRail";
import { PanelLeft } from "lucide-react";
import { useChatDocumentUpload, type AttachedDocument, type AttachedDocKind } from "@/hooks/useChatDocumentUpload";
import { DocumentAttachmentChip } from "@/components/chat/DocumentAttachmentChip";
import { DocumentMessageBubble } from "@/components/chat/DocumentMessageBubble";
import { MessageAudioButton } from "@/components/chat/MessageAudioButton";
import { PaigeThinkingIndicator } from "@/components/paige/chat/PaigeThinkingIndicator";
import { PaigeArtifactCard, type PaigeArtifact } from "@/components/paige/chat/PaigeArtifactCard";
import { PaigeCompactingCard, type CompactingSignal } from "@/components/paige/chat/PaigeCompactingCard";

/** An action Paige filed to the approvals queue this turn (propose→confirm). */
type QueuedApproval = { id: string; summary: string; category: string; contact_id: string | null };
type Message = {
  /** Stable id — survives array splices; underwrites copy/retry/feedback (1c-vi). */
  id: string;
  /** Creation time (ms) — powers the hover timestamp; omitted-time turns hide it. */
  ts: number;
  role: "user" | "assistant";
  content: string;
  /** In-session only (not persisted): the attachment sent on a user turn, so the
   *  transcript shows a document bubble. The extracted content reaches the model
   *  via the POST `document` field, not this label (§13 — honest, no dead chip). */
  documentFileName?: string;
  documentKind?: AttachedDocKind;
  queued?: QueuedApproval[];
  confirm?: Array<{ tool: string; summary: string }>;
  /** True on turns rehydrated from history: their confirm cards render settled,
   *  not as a live Approve button (§15 — never re-fire a past action). */
  confirmResolved?: boolean;
  /** #29 — deliverables Paige produced this turn (document/image), streamed as
   *  `paige_artifact` frames and rendered as inline handoff cards. Live-turn only;
   *  the card re-hydrates from marketing_content by id, so it isn't persisted. */
  artifacts?: PaigeArtifact[];
};

// crypto.randomUUID is undefined in some insecure-context / older webviews — guard
// it so building a message can never white-screen the whole chat (S4).
const safeUuid = (): string => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};
const mkMsg = (m: Omit<Message, "id" | "ts"> & Partial<Pick<Message, "id" | "ts">>): Message =>
  ({ ...m, id: m.id ?? safeUuid(), ts: m.ts ?? Date.now() });

// Optional, back-compatible props (cc-spec §3). Legacy mounts (Dashboard) pass
// none of these and behave exactly as before.
export interface PaigeAIChatProps {
  hideHeader?: boolean;
  /** Command-center mode: fill the region, drop the max-w-4xl centering. */
  fill?: boolean;
  /** Focused customer id — added to the chat POST body so Paige acts on them. */
  clientId?: string | null;
  /** Prose describing the focused customer — added to the chat POST body. */
  clientContext?: string;
  /** Sticky strip above the message list, shown only when a customer is focused. */
  focusBanner?: React.ReactNode;
  /** Quick-action chips above the composer. */
  chips?: QuickChip[];
  /** Opening bubble. Command center passes an operator-flavored opener. */
  greeting?: string;
  /** Fires with the live step trace so a parent surface (Live desk) can render it. */
  onTrace?: (steps: PaigeStep[], loading: boolean) => void;
  /** Suppress the inline reasoning strip (desktop: the Live desk owns the timeline). */
  hideReasoningStrip?: boolean;
  /** Owner "Your Paige" mode (#94): mount the multi-chat history rail, persist
   *  every conversation, and rehydrate on reload. Off by default — legacy and
   *  client-focused mounts keep their exact single-session behavior. */
  enableHistory?: boolean;
  /** Platform-operator mode (#130 / §45): the Super Admin's tenant-less Paige.
   *  Threads are created/listed with lens='platform' + NULL tenant, so this works
   *  with no active tenant. Off by default — every tenant mount is unchanged. */
  platform?: boolean;
  /**
   * Replace the built-in `ThreadRail` with the caller's own, driven by the SAME
   * live thread state (#546 follow-up). The operator console draws Claude Design's
   * 236px rail; without this seam it had to mount its own empty list next to the
   * real one, so the screen carried two "New chat" buttons and two chat lists
   * (§18/§21). The rail is presentation — the threads, the selection and every
   * mutation stay here, so nothing about history changes (§58).
   */
  renderRail?: (api: ChatRailApi) => React.ReactNode;
  /** Rendered inside the conversation frame, above the thread — the caller's own
   *  chat header. Distinct from `focusBanner`, which is the focused-customer strip. */
  conversationHeader?: React.ReactNode;
  /**
   * Which chrome the conversation wears. `app` (default) is byte-for-byte today's
   * surface for every existing mount. `operator` is Claude Design's platform desk:
   * its warm right-aligned bubble, its framed composer with the tool row and the
   * visible prompt chips, and its collapsible reasoning strip. The ENGINE is
   * identical either way — streaming, voice, playback, attachments, artifacts,
   * approvals and thread persistence are the same code (§58).
   */
  presentation?: "app" | "operator";
  /** The line under the operator composer. Absent → no line (never invented). */
  composerFootNote?: string;
}

/** Everything a caller-supplied history rail needs, and nothing it could corrupt. */
export type ChatRailApi = {
  threads: PaigeThread[];
  isLoading: boolean;
  activeThreadId: string | null;
  streamingThreadId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

const PaigeAIChatInner = ({
  hideHeader = false,
  fill = false,
  clientId = null,
  clientContext,
  focusBanner,
  chips,
  greeting,
  onTrace,
  hideReasoningStrip = false,
  enableHistory = false,
  platform = false,
  renderRail,
  conversationHeader,
  presentation = "app",
  composerFootNote,
}: PaigeAIChatProps) => {
  /** Claude Design's operator chrome. Presentation only — never a second engine. */
  const cd = presentation === "operator";
  // The tenant's authored persona names the assistant in the default header —
  // audience-broad, voice-compliant, never a hardcoded vertical (doctrine §2/§3).
  const playbook = usePlaybook();
  const persona = playbook.persona;
  const sessionId = useRef(`session-${Date.now()}`).current;
  
  // Check if user is admin or coach for feedback visibility
  const { data: userRole } = useQuery({
    queryKey: ["user-role-for-feedback"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data || []).map((r: { role: string }) => r.role);
      return { isAdmin: roles.includes("admin"), isCoach: roles.includes("coach") };
    },
    staleTime: 5 * 60 * 1000,
  });
  const showFeedback = userRole?.isAdmin || userRole?.isCoach;
  const [messages, setMessages] = useState<Message[]>([
    mkMsg({ role: "assistant", content: greeting ?? "Hey, how can I help?" }),
  ]);
  const [input, setInput] = useState("");
  const [slashActive, setSlashActive] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [steps, setSteps] = useState<PaigeStep[]>([]);
  // #11 — true once the first answer token arrives this turn (label flips Thinking→Writing).
  const [writingPhase, setWritingPhase] = useState(false);
  // #12 — the live conversation-compacting signal (this surface persists → it can fold). Reset per turn.
  const [compacting, setCompacting] = useState<CompactingSignal | null>(null);
  // The streamed reasoning thoughts (paige_step kind:"thought") exposed under "Thought process".
  const thinkingThoughts = steps
    .filter((s) => s.kind === "thought")
    .map((s) => ({ id: s.id, label: s.label }));
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Document attachment (#480) — PDF/image/DOCX. Shared hook (§18 one home): docx
  // is extracted to text client-side, pdf/image ride as base64; 10MB cap. In-session
  // only (no turn-persistence of the attachment), matching PaigeChat/FloatingChatbot.
  const {
    attachedDoc,
    isDragOver,
    fileInputRef,
    acceptString,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeAttachment,
    openFilePicker,
    setAttachedDoc,
  } = useChatDocumentUpload();

  // ── Multi-chat history (#94) — owner "Your Paige" only (enableHistory). ──
  const scopedUserId = useScopedUserId();
  const { activeTenantId } = useTenantContext();
  const threadsApi = usePaigeThreads({ callerUserId: scopedUserId, tenantId: activeTenantId, platform });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [streamingThreadId, setStreamingThreadId] = useState<string | null>(null);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  // CD's reasoning strip is a disclosure, not an always-open list. Collapsed at rest.
  const [traceOpen, setTraceOpen] = useState(false);
  const openingGreeting = greeting ?? "Hey, how can I help?";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mirror the live step trace up so a parent surface (the Live desk) can render it.
  useEffect(() => { onTrace?.(steps, isLoading); }, [steps, isLoading, onTrace]);

  // Collapse the composer back to one line once it's cleared (after send / new chat).
  useEffect(() => { if (input === "" && inputRef.current) inputRef.current.style.height = "auto"; }, [input]);

  // Chip click: prefill the composer + focus so the operator can edit before
  // Paige acts (cc-spec §3). Only chips flagged autoSend dispatch immediately.
  const handleChip = (chip: QuickChip) => {
    if (chip.autoSend) {
      void handleSend(chip.prompt);
      return;
    }
    setInput(chip.prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Rebuild the message list from a thread's stored turns. Cards are reconstructed
  // from bundle_ref and marked resolved — a reloaded confirm renders settled, never
  // a live Approve button for an action already taken (§15).
  const turnsToMessages = (turns: Awaited<ReturnType<typeof threadsApi.loadTurns>>): Message[] =>
    turns
      .filter((t) => t.role === "user" || t.role === "assistant")
      .map((t) => {
        const b = (t.bundle_ref ?? {}) as Record<string, unknown>;
        const queued = Array.isArray(b.approval_queued) ? (b.approval_queued as QueuedApproval[]) : undefined;
        const confirm = Array.isArray(b.paige_confirm)
          ? (b.paige_confirm as Array<{ tool: string; summary: string }>)
          : undefined;
        // Honest timestamp: use the turn's stored created_at when present; if the
        // stored turn has none, omit it and the hover time simply hides (never faked).
        const tid = (t as { id?: string }).id;
        const created = (t as { created_at?: string }).created_at;
        return mkMsg({
          ...(tid ? { id: tid } : {}),
          ...(created ? { ts: Date.parse(created) } : {}),
          role: t.role as "user" | "assistant",
          content: t.content,
          queued: queued?.length ? queued : undefined,
          confirm: confirm?.length ? confirm : undefined,
          confirmResolved: true,
        });
      });

  const selectThread = async (id: string) => {
    if (id === activeThreadId || isLoading) return; // don't clobber a streaming reply
    try {
      const turns = await threadsApi.loadTurns(id);
      const hydrated = turnsToMessages(turns);
      setMessages(hydrated.length ? hydrated : [mkMsg({ role: "assistant", content: openingGreeting })]);
      setActiveThreadId(id);
      setSteps([]);
    } catch (e) {
      console.error("[PaigeAIChat] load thread failed:", e);
      toast({ title: "Couldn't open that chat", description: "Give it another try in a moment.", variant: "destructive" });
    }
  };

  const startNewChat = () => {
    if (isLoading) return; // let the current reply finish before switching context
    setActiveThreadId(null);
    setMessages([mkMsg({ role: "assistant", content: openingGreeting })]);
    setSteps([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // On first load in history mode, resume the most recent chat (or start fresh).
  // Gate on isFetched (a real, enabled fetch settled) — NOT isLoading, which is
  // false for a disabled query before the user/tenant ids resolve. Latching on
  // that empty pre-resolution render would strand the owner on a blank chat.
  useEffect(() => {
    if (!enableHistory || historyHydrated || !threadsApi.isFetched) return;
    const latest = threadsApi.threads[0];
    if (latest) void selectThread(latest.id);
    setHistoryHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableHistory, historyHydrated, threadsApi.isFetched, threadsApi.threads]);

  // One turn runner, reused by send + regenerate. `base` ends at the user turn to
  // answer; `rollback` is the list restored if the turn fails; `userText` seeds the
  // lazy thread title in history mode. A single assistantId/Ts is threaded through
  // every streamed setMessages so the bubble never remounts mid-stream (copy/retry/
  // feedback stay stable).
  const streamTurn = async (base: Message[], rollback: Message[], userText: string, doc?: AttachedDocument | null) => {
    const newMessages = base;
    setIsLoading(true);
    setSteps([]); // fresh "watch her work" trace per turn
    setWritingPhase(false); // #11 — back to "Thinking…" until the first token this turn
    setCompacting(null); // #12 — clear any prior turn's compacting card
    const assistantId = safeUuid();
    const assistantTs = Date.now();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication Error",
          description: "Please sign in to use Paige AI.",
          variant: "destructive",
        });
        setMessages(rollback);
        setIsLoading(false);
        return;
      }

      // History mode: create the thread lazily on the first send, then stream
      // into it. The server is the single writer of turns — we only pass the id.
      let threadId = activeThreadId;
      if (enableHistory) {
        try {
          if (!threadId) {
            threadId = await threadsApi.ensureThread(userText);
            setActiveThreadId(threadId);
          }
          setStreamingThreadId(threadId);
        } catch (e) {
          console.error("[PaigeAIChat] ensureThread failed:", e);
          toast({ title: "Couldn't start that chat", description: "Give it another try in a moment.", variant: "destructive" });
          setMessages(rollback);
          setIsLoading(false);
          return;
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            ...(threadId ? { threadId } : {}),
            ...(clientId ? { clientId } : {}),
            ...(clientContext ? { clientContext } : {}),
            // Attachment (#480): the edge inlines pdf/image as image_url and docx
            // textContent as a text block. Pass the REAL mimeType/kind/textContent
            // — the hook already extracted docx client-side.
            ...(doc
              ? {
                  document: {
                    base64: doc.base64,
                    fileName: doc.name,
                    mimeType: doc.mimeType,
                    textContent: doc.textContent,
                    kind: doc.kind,
                  },
                }
              : {}),
            ...getUserClock(),
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            title: "Rate Limit Reached",
            description: "Please wait a moment before sending another message.",
            variant: "destructive",
          });
          setMessages(rollback);
          setIsLoading(false);
          return;
        }
        // #587 — read the structured { code, reason, recommendation } body and show the SPECIFIC
        // message (e.g. a 15 MB size limit) instead of a generic "Failed to send message" toast.
        const chatErr = await parsePaigeChatError(response);
        toast({ title: chatErr.title, description: chatErr.description, variant: "destructive" });
        setMessages(rollback);
        setIsLoading(false);
        if (enableHistory) setStreamingThreadId(null);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let queuedThisTurn: QueuedApproval[] = [];
      // Accumulate EVERY pending confirmation this turn — a blanket "Approve" runs
      // all of them, so the operator must see all of them (design-crew B1).
      const confirmThisTurn: Array<{ tool: string; summary: string }> = [];
      // #29 — deliverables (document/image) Paige persisted this turn, streamed as
      // paige_artifact frames BEFORE the reply text, rendered as inline handoff cards.
      const artifactsThisTurn: PaigeArtifact[] = [];
      let textBuffer = "";
      let streamDone = false;

      setMessages([...newMessages, { id: assistantId, ts: assistantTs, role: "assistant", content: "" }]);

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
            // Structured event: a "watch her work" step (#95). Upsert by id, sorted by seq.
            if (parsed.paige_step) {
              setSteps((prev) => upsertStep(prev, parsed.paige_step as PaigeStep));
              continue;
            }
            // #11 — the server confirmed the transition into the reply. A lightweight signal; the
            // client also derives "writing" from the first content delta below, so this is belt-and-braces.
            if (parsed.paige_phase === "writing") { setWritingPhase(true); continue; }
            // #12 — conversation-compacting lifecycle (approaching/start/progress/done/skipped).
            if (parsed.paige_compacting) { setCompacting(parsed.paige_compacting as CompactingSignal); continue; }
            // Structured event: Paige queued an action to the approvals desk.
            if (Array.isArray(parsed.approval_queued)) {
              queuedThisTurn = parsed.approval_queued as QueuedApproval[];
              // #29 §39 — carry artifacts here too so the invariant "the card survives every rebuild"
              // never depends on the backend's frame ORDER (today approval_queued precedes paige_artifact,
              // but a reorder or a second approval_queued after an artifact must not wipe the card).
              setMessages([...newMessages, { id: assistantId, ts: assistantTs, role: "assistant", content: assistantMessage, queued: queuedThisTurn, confirm: confirmThisTurn.length ? confirmThisTurn : undefined, artifacts: artifactsThisTurn.length ? [...artifactsThisTurn] : undefined }]);
              continue;
            }
            // Structured event: Paige is asking to confirm a mutating action → render an approve/deny card.
            if (parsed.paige_confirm?.summary) {
              confirmThisTurn.push({ tool: String(parsed.paige_confirm.tool || "action"), summary: String(parsed.paige_confirm.summary) });
              setMessages([...newMessages, { id: assistantId, ts: assistantTs, role: "assistant", content: assistantMessage, queued: queuedThisTurn.length ? queuedThisTurn : undefined, confirm: [...confirmThisTurn], artifacts: artifactsThisTurn.length ? [...artifactsThisTurn] : undefined }]);
              continue;
            }
            // #29 — Paige handed the user a deliverable (document/image) → attach an inline handoff card.
            // Arrives BEFORE the reply text, so build the assistant bubble now; the content rebuild below
            // preserves artifactsThisTurn so the card survives the streaming text.
            if (parsed.paige_artifact?.id && (parsed.paige_artifact.artifactType === "document" || parsed.paige_artifact.artifactType === "image")) {
              const a = parsed.paige_artifact as PaigeArtifact;
              // Capture the frame's tenant_id — the EXACT tenant the row was saved under — so the card's
              // RLS-safe hydrate scopes to it, not the viewer's activeTenantId (they diverge when an
              // operator manages another tenant → wrong-tenant query → 0 rows → "Preview unavailable").
              artifactsThisTurn.push({ id: String(a.id), title: String(a.title ?? ""), url: a.url ?? undefined, artifactType: a.artifactType, tenantId: (parsed.paige_artifact.tenant_id as string | undefined) ?? undefined });
              setMessages([...newMessages, { id: assistantId, ts: assistantTs, role: "assistant", content: assistantMessage, queued: queuedThisTurn.length ? queuedThisTurn : undefined, confirm: confirmThisTurn.length ? [...confirmThisTurn] : undefined, artifacts: [...artifactsThisTurn] }]);
              continue;
            }
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              if (!assistantMessage) setWritingPhase(true); // #11 — first token → "Writing…"
              assistantMessage += content;
              setMessages([...newMessages, { id: assistantId, ts: assistantTs, role: "assistant", content: assistantMessage, queued: queuedThisTurn.length ? queuedThisTurn : undefined, confirm: confirmThisTurn.length ? [...confirmThisTurn] : undefined, artifacts: artifactsThisTurn.length ? [...artifactsThisTurn] : undefined }]);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      setIsLoading(false);
      if (enableHistory) {
        setStreamingThreadId(null);
        // Reorder the rail + pick up the server-side auto-title. The assistant
        // turn + title write run in the edge fn's waitUntil after the stream
        // closes, so refresh once now and again shortly to catch that commit.
        threadsApi.onTurnPersisted();
        window.setTimeout(() => threadsApi.onTurnPersisted(), 1800);
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      setMessages(rollback);
      setIsLoading(false);
      if (enableHistory) setStreamingThreadId(null);
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    // Allow a send with text OR an attachment alone (#480). An override (confirm
    // card Approve/Deny) never carries a doc, so snapshot only on a real compose.
    const currentDoc = overrideText === undefined ? attachedDoc : null;
    if ((!text && !currentDoc) || isLoading) return;
    const rollback = messages;
    const userContent = text || (currentDoc ? `Analyze this document: ${currentDoc.name}` : "");
    const base = [
      ...messages,
      mkMsg({
        role: "user",
        content: userContent,
        ...(currentDoc ? { documentFileName: currentDoc.name, documentKind: currentDoc.kind } : {}),
      }),
    ];
    setMessages(base);
    setInput("");
    if (currentDoc) setAttachedDoc(null);
    await streamTurn(base, rollback, userContent, currentDoc);
  };

  // Regenerate an assistant turn: re-run the nearest preceding user turn and REPLACE
  // the stale answer (truncate to that user turn, then stream a fresh one). Guarded
  // against in-flight + live voice. History mode is gated off at the call site (the
  // server is the single turn-writer; a retry would double-write) until the server
  // grows a regenerate flag — filed as a fast-follow.
  const handleRetry = (assistantId: string) => {
    if (isLoading) return;
    const aIdx = messages.findIndex((m) => m.id === assistantId);
    if (aIdx < 0) return;
    let uIdx = -1;
    for (let i = aIdx - 1; i >= 0; i--) {
      if (messages[i].role === "user") { uIdx = i; break; }
    }
    if (uIdx < 0) return; // nothing to regenerate (e.g. the opening greeting)
    const rollback = messages;
    const base = messages.slice(0, uIdx + 1);
    setMessages(base);
    void streamTurn(base, rollback, messages[uIdx].content);
  };

  const visibleChips = (chips ?? []).filter((c) => !c.visibleWhenFocused || !!clientId);

  // Slash-command palette (replaces the always-visible chips). The commands ARE the
  // quick-chips; the menu opens only while the value is a bare "/token" — anchoring
  // to ^/ means a mid-sentence "/" (e.g. "and/or") never triggers it and a trailing
  // space closes it, so the value is then sent literally.
  const slashMatch = /^\/(\S*)$/.exec(input);
  const slashQuery = slashMatch?.[1] ?? "";
  const filteredCommands = slashMatch
    ? visibleChips.filter((c) => c.label.toLowerCase().includes(slashQuery.toLowerCase()))
    : [];
  const slashOpen = !!slashMatch && filteredCommands.length > 0 && !isLoading;
  const pickCommand = (c: QuickChip) => { setInput(""); setSlashActive(0); handleChip(c); };

  // The user turn that produced the assistant message at `index` — stored as the
  // L2 eval-case input alongside the thumbs rating.
  const precedingUserText = (index: number): string | undefined => {
    for (let i = index - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
    return undefined;
  };

  // CD's trace label, computed from the REAL streamed steps — how many of her
  // departments actually worked this turn, never a written-in number (§13/§14).
  const traceDepartments = new Set(steps.filter((st) => st.kind !== "thought").map((st) => st.group)).size;
  const traceLabel =
    steps.length === 0
      ? `${persona.name || "Paige"} is getting started`
      : traceDepartments > 0
        ? `${traceDepartments} ${traceDepartments === 1 ? "department" : "departments"} worked on this`
        : `${steps.length} ${steps.length === 1 ? "step" : "steps"} so far`;

  // The composer's pieces, built once and arranged by presentation. Both chromes
  // drive the SAME handlers — one engine, two frames (§18: no forked composer).
  const composerTextarea = (
    <Textarea
      ref={inputRef}
      value={input}
      rows={1}
      onChange={(e) => {
        setInput(e.target.value);
        setSlashActive(0);
        const el = e.target; el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      }}
      onKeyDown={(e) => {
        // IME composition: don't hijack Enter/nav while composing (N3).
        if (e.nativeEvent.isComposing) return;
        // Slash palette open → arrows/enter/escape drive the menu.
        if (slashOpen) {
          if (e.key === "ArrowDown") { e.preventDefault(); setSlashActive((a) => (a + 1) % filteredCommands.length); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setSlashActive((a) => (a - 1 + filteredCommands.length) % filteredCommands.length); return; }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); pickCommand(filteredCommands[Math.min(slashActive, filteredCommands.length - 1)]); return; }
          if (e.key === "Escape") { e.preventDefault(); setInput(""); return; }
        }
        // Enter sends; Shift+Enter inserts a newline (so long messages wrap).
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
      }}
      placeholder={
        cd
          ? "Ask about the platform — the fleet, the rails, the machine"
          : `Message ${persona.name || "Paige"} — type / for commands`
      }
      className={cn(
        "max-h-40 resize-none",
        cd
          // Inside CD's frame the input carries no border of its own.
          ? "min-h-[2.25rem] min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[13px] leading-[1.5] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          : "min-h-[2.5rem] flex-1",
      )}
      disabled={isLoading}
    />
  );

  /* Attach a document (#480) — ghost icon, never gold (Send owns the gold act, §11).
     Guarded while a reply is streaming. */
  const attachButton = (
    <Button
      onClick={openFilePicker}
      variant="ghost"
      size="icon"
      aria-label="Attach a document"
      disabled={isLoading}
      title="Attach a PDF, image, or Word document"
      className={cd ? "h-[27px] w-[27px] rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted" : undefined}
    >
      {cd ? <span aria-hidden className="text-[11.5px] leading-none">＋</span> : <Paperclip className="w-4 h-4" />}
    </Button>
  );

  /* Hold-to-dictate — neutral/indigo mic, never gold. Dictated words append into
     the composer; the operator edits before sending. */
  const micButton = (
    <DictationMicButton
      onText={(seg) => setInput((prev) => appendDictation(prev, seg))}
      onError={(msg) => toast({ title: "Voice typing", description: msg, variant: "destructive" })}
      disabled={isLoading}
    />
  );

  return (
    <div className={fill ? "w-full h-full" : `max-w-4xl mx-auto w-full ${hideHeader ? "h-full" : "h-[calc(100vh-4rem)]"}`}>
      <div className={enableHistory ? (cd ? "flex h-full min-h-0 gap-3.5" : "flex h-full min-h-0 gap-4 px-3 pt-3 md:px-4") : "flex flex-col h-full"}>
        {/* History rail. The caller may draw its own (the operator console draws
            Claude Design's) — it gets the SAME live threads and the SAME handlers,
            so rename/archive/delete/select/new-chat all keep working (§58). */}
        {enableHistory &&
          (renderRail
            ? renderRail({
                threads: threadsApi.threads,
                isLoading: threadsApi.isLoading,
                activeThreadId,
                streamingThreadId,
                onSelect: (id) => void selectThread(id),
                onNewChat: startNewChat,
                onRename: threadsApi.renameThread,
                onArchive: threadsApi.archiveThread,
                onDelete: (id) => {
                  if (id === activeThreadId) startNewChat();
                  void threadsApi.deleteThread(id);
                },
                mobileOpen: mobileRailOpen,
                onMobileOpenChange: setMobileRailOpen,
              })
            : (
              <ThreadRail
                threads={threadsApi.threads}
                isLoading={threadsApi.isLoading}
                activeThreadId={activeThreadId}
                streamingThreadId={streamingThreadId}
                onSelect={(id) => void selectThread(id)}
                onNewChat={startNewChat}
                onRename={threadsApi.renameThread}
                onArchive={threadsApi.archiveThread}
                onDelete={(id) => { if (id === activeThreadId) startNewChat(); void threadsApi.deleteThread(id); }}
                mobileOpen={mobileRailOpen}
                onMobileOpenChange={setMobileRailOpen}
              />
            ))}
        <div
          className={enableHistory ? "flex flex-col h-full min-w-0 flex-1" : "contents"}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
        {!hideHeader && (
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-foreground">
              Chat with {persona.name || "Paige"}
            </h2>
            <p className="text-muted-foreground mt-2">
              Talk to her about your work — she's here to help.
            </p>
          </div>
        )}

        {enableHistory && (
          <div className={cn("mb-3 flex items-center gap-2", cd ? "lg:hidden" : "md:hidden")}>
            <Button variant="outline" size="sm" onClick={() => setMobileRailOpen(true)}>
              <PanelLeft className="mr-2 h-4 w-4" /> Chats
            </Button>
            <Button variant="gold" size="sm" onClick={startNewChat}>
              New chat
            </Button>
          </div>
        )}

        <Card
          className={cn(
            "relative flex-1 min-h-0 flex flex-col bg-card border-border overflow-hidden",
            // CD's conversation card: 14px radius, hairline border, no drop shadow —
            // depth comes from the elevation stack around it, not a shadow (§22).
            cd ? "rounded-[14px] shadow-none" : "shadow-card",
          )}
        >
          {/* Drop target overlay (#480) — tokened, theme-aware, motion-safe. Solid indigo frame
              (no dashed "upload-widget" tell, §25); gold stays reserved for the send act (§11/§23).
              Drag handlers live on the wrapper above so a drop on the header can't escape to the
              browser (they catch child drops via bubbling). */}
          {isDragOver && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none animate-in fade-in duration-150 motion-reduce:animate-none">
              <div className="rounded-xl border-2 border-primary bg-card px-6 py-4 text-center shadow-lg">
                <p className="text-sm font-medium text-primary">Drop file here</p>
                <p className="mt-0.5 text-xs text-muted-foreground">PDF, image, or Word document · up to 10MB</p>
              </div>
            </div>
          )}
          {conversationHeader}
          {focusBanner}
          <div
            ref={scrollRef}
            className={cn(
              "flex-1 min-h-0 overflow-y-auto",
              cd ? "px-4 py-3.5 space-y-4" : "p-6 space-y-4",
            )}
          >
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={cn(
                  "flex min-w-0",
                  cd ? "gap-[11px]" : "gap-3",
                  message.role === "user" ? "flex-row-reverse" : "flex-row",
                )}
              >
                {message.role === "assistant" && (
                  <img
                    src={paigeAvatar}
                    alt={persona.name || "Paige"}
                    className={cn(
                      "rounded-full border-2 border-primary",
                      cd ? "mt-px h-6 w-6 flex-none" : "w-10 h-10",
                    )}
                  />
                )}
                <div
                  className={cn(
                    "group relative",
                    // CD's operator thread: the operator's own turn is the warm
                    // right-aligned bubble (cream ground, hairline border, one square
                    // corner); Paige's answer carries NO card at all — her avatar,
                    // her name and the words, the way the pack draws it. The app
                    // presentation is untouched for every tenant mount.
                    cd
                      ? message.role === "user"
                        ? "max-w-[76%] min-w-0 rounded-[14px_14px_4px_14px] border border-border bg-muted px-[13px] py-2.5 text-[13.5px] leading-[1.6]"
                        : "min-w-0 flex-1 text-[13.5px] leading-[1.66]"
                      : cn(
                          "max-w-[80%] rounded-lg p-4",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 border border-border",
                        ),
                  )}
                >
                  {message.role === "assistant" ? (() => {
                    const { before, diagram, after } = extractEntityDiagram(message.content);
                    return (
                      <>
                        {before && <MarkdownMessage content={before} />}
                        {diagram && <EntityDiagramCard data={diagram} />}
                        {after && <MarkdownMessage content={after} />}
                        {message.queued?.map((q) => (
                          <div key={q.id} className="mt-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug">{q.summary}</p>
                              <p className="text-xs text-muted-foreground">Paige queued this — it's waiting on you. Approve it in your Live desk and it goes out.</p>
                            </div>
                          </div>
                        ))}
                        {!!message.confirm?.length && !message.confirmResolved && index === messages.length - 1 && !isLoading && (
                          <PaigeConfirmCard
                            items={message.confirm.map((c) => c.summary)}
                            disabled={isLoading}
                            onApprove={() => void handleSend("Approved — run it.")}
                            onDeny={() => void handleSend("Hold off — skip that one.")}
                          />
                        )}
                        {/* Reloaded from history: the confirm moment already passed —
                            show it settled, never a live Approve button (§15). */}
                        {!!message.confirm?.length && message.confirmResolved && (
                          <div className="mt-2 rounded-md border border-border bg-muted/30 p-2.5">
                            <p className="text-xs text-muted-foreground">
                              Earlier, Paige asked you to confirm: {message.confirm.map((c) => c.summary).join("; ")}
                            </p>
                          </div>
                        )}
                        {/* #29 — inline handoff cards for the deliverables Paige produced this turn. Open
                            renders the real artifact; Send prefills the composer so Paige drives the send
                            through her own tools (§10/§16 — never a dead-end send button). Gold is spent
                            only on that Send inside the card. Needs a resolved tenant for the RLS hydrate. */}
                        {!!message.artifacts?.length && activeTenantId && (
                          <div className="mt-2 flex flex-col gap-2">
                            {message.artifacts.map((a) => (
                              <PaigeArtifactCard
                                key={a.id}
                                artifact={a}
                                tenantId={a.tenantId ?? activeTenantId}
                                onSend={() => {
                                  setInput(`Send "${a.title}" to `);
                                  requestAnimationFrame(() => inputRef.current?.focus());
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })() : (
                    <>
                      {message.documentFileName && (
                        <DocumentMessageBubble fileName={message.documentFileName} kind={message.documentKind} />
                      )}
                      {message.content && <p className="text-sm">{message.content}</p>}
                    </>
                  )}
                  {/* Hover-revealed meta: timestamp + copy (both roles), regenerate
                      (assistant only, non-history), and the thumbs feedback slot. */}
                  {message.content && (
                    <MessageMeta
                      role={message.role}
                      content={message.content}
                      ts={message.ts}
                      onRetry={
                        message.role === "assistant" && !enableHistory && index === messages.length - 1 && !isLoading
                          ? () => handleRetry(message.id)
                          : undefined
                      }
                      audioSlot={
                        message.role === "assistant"
                          ? <MessageAudioButton messageId={message.id} content={message.content} />
                          : undefined
                      }
                      feedback={
                        message.role === "assistant" && showFeedback
                          ? (
                            <ResponseFeedback
                              messageContent={message.content}
                              messageId={message.id}
                              userPrompt={precedingUserText(index)}
                              sessionId={sessionId}
                            />
                          )
                          : undefined
                      }
                    />
                  )}
                </div>
              </div>
            ))}

            {/* #11/#12 — live thinking timer + conversation-compacting card. Aligned under the
                assistant bubbles (avatar gutter). The card renders only when the server streams a
                compacting frame; this surface persists threads, so it can genuinely fold (§13). */}
            {(isLoading || compacting) && (
              <div className={cn("flex flex-col gap-2", cd ? "pl-[35px]" : "pl-[52px]")}>
                <PaigeThinkingIndicator
                  active={isLoading}
                  writing={writingPhase}
                  thoughts={thinkingThoughts}
                  personaName={persona.name}
                />
                <PaigeCompactingCard signal={compacting} personaName={persona.name} />
              </div>
            )}
          </div>

          {/* Her working. CD draws it as a collapsible strip with a right-aligned
              meter; the app draws the persistent "on watch" strip. Same REAL steps
              (`paige_step` frames) either way — CD's per-message trace has no backing
              here, because the engine streams a trace per TURN and never persists it,
              so the strip sits with the live turn instead of under an old answer, and
              the meter reads "—" rather than a plausible latency (§13). */}
          {!hideReasoningStrip && cd && (isLoading || steps.length > 0) && (
            <div className="flex-none border-t border-border px-3.5 py-2">
              <button
                type="button"
                aria-expanded={traceOpen}
                onClick={() => setTraceOpen((o) => !o)}
                className="flex w-full min-w-0 items-center gap-2 rounded-[9px] border border-border bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="flex-none text-[10px] text-[hsl(var(--primary))]">
                  {traceOpen ? "▾" : "▸"}
                </span>
                <span className="min-w-0 truncate text-[11px]">{traceLabel}</span>
                <span
                  title="Latency and token cost aren't reported back to this surface yet."
                  className="ml-auto flex-none font-mono text-[9.5px] text-muted-foreground"
                >
                  —
                </span>
              </button>
              {traceOpen && (
                <div className="mt-1.5 border-l-2 border-[hsl(var(--primary)/0.35)] pl-[11px]">
                  <StepTimeline steps={steps} loading={isLoading} />
                </div>
              )}
            </div>
          )}

          {!hideReasoningStrip && !cd && (isLoading || steps.length > 0) && (
            <div className="border-t border-border px-4 pt-3">
              <PaigeReasoningStrip steps={steps} loading={isLoading} personaName={persona.name} />
            </div>
          )}

          <div
            className={cn(
              cd
                // CD's composer well: the whole footer sits on the raised ground and
                // the input is a framed card inside it.
                ? "flex-none border-t border-border bg-muted/40 px-3 pb-[11px] pt-[9px]"
                : "border-t border-border p-4",
            )}
          >
            {/* Hidden picker — accepts ALL supported kinds (pdf/image/docx), not
                pdf-only. Change resets its value in the hook so re-picking the same
                file re-fires. */}
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptString}
              onChange={handleFileSelect}
              className="hidden"
            />
            {/* CD's prompt chips. These are the SAME `chips` the slash palette already
                serves — the operator console just shows them instead of making the
                human know to type "/" first (§36). Clicking one writes the prompt into
                the composer; nothing is sent without the operator pressing Send. */}
            {cd && visibleChips.length > 0 && (
              <div className="flex items-center gap-[7px] overflow-x-auto pb-2">
                {visibleChips.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => handleChip(c)}
                    disabled={isLoading}
                    className="flex-none whitespace-nowrap rounded-full border border-border bg-card px-[11px] py-1.5 text-[11px] transition-colors hover:border-border-strong hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {/* Pending attachment chip — sits above the input, removable (§13). */}
            {attachedDoc && (
              <div className="mb-2">
                <DocumentAttachmentChip
                  fileName={attachedDoc.name}
                  kind={attachedDoc.kind}
                  sizeBytes={attachedDoc.size}
                  onRemove={removeAttachment}
                />
              </div>
            )}
            {/* Composer + slash palette + inline voice. The palette anchors above the
                input in both chromes and focus never leaves the Textarea. */}
            <div
              className={cn(
                "relative",
                cd
                  // CD's framed well: input on top, the tool row beneath it.
                  ? "overflow-visible rounded-xl border border-border bg-card focus-within:border-border-strong"
                  : "flex items-end gap-2",
              )}
            >
              <SlashCommandMenu
                open={slashOpen}
                items={filteredCommands}
                activeIndex={Math.min(slashActive, Math.max(0, filteredCommands.length - 1))}
                onHover={setSlashActive}
                onPick={pickCommand}
              />
              {cd ? (
                <>
                  <div className="flex min-w-0 items-start gap-2.5 px-3 pb-1 pt-2.5">
                    <span aria-hidden className="mt-1 flex-none text-[12px] text-muted-foreground">✦</span>
                    {composerTextarea}
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 px-2.5 pb-2 pt-1.5">
                    {attachButton}
                    {/* CD's other two tool keys. Neither has a seam behind it yet, so
                        each is rendered in CD's shape and DISABLED, saying what it is
                        waiting on — never a control that looks live and does nothing
                        (§13). They light up when the seam lands, not before. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled
                      aria-label="Reference a tenant"
                      title="Reference a tenant — not wired to the fleet record yet."
                      className="h-[27px] w-[27px] rounded-lg border border-border bg-card text-muted-foreground"
                    >
                      <span aria-hidden className="text-[11.5px] leading-none">⌗</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled
                      aria-label="Run a skill"
                      title="Run a skill — the skill runner isn't callable from this composer yet."
                      className="h-[27px] w-[27px] rounded-lg border border-border bg-card text-muted-foreground"
                    >
                      <span aria-hidden className="text-[11.5px] leading-none">⚡</span>
                    </Button>
                    <span className="ml-auto flex-none font-mono text-[9.5px] text-muted-foreground">
                      ⌘↵ to send
                    </span>
                    {micButton}
                    <Button
                      onClick={() => handleSend()}
                      disabled={isLoading || (!input.trim() && !attachedDoc)}
                      variant="gold"
                      size="sm"
                      className="h-[29px] flex-none gap-1.5 rounded-[9px] px-3.5 text-[12px] font-semibold"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                      ) : (
                        <span aria-hidden className="text-[10px] leading-none">↑</span>
                      )}
                      Send
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {composerTextarea}
                  {attachButton}
                  {micButton}
                  <Button
                    onClick={() => handleSend()}
                    disabled={isLoading || (!input.trim() && !attachedDoc)}
                    variant="gold"
                    size="icon"
                    aria-label="Send message"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <Send className="w-4 h-4" />}
                  </Button>
                </>
              )}
            </div>
            {cd && composerFootNote && (
              <div className="mt-[7px] text-[10px] text-muted-foreground">{composerFootNote}</div>
            )}
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
};

export const PaigeAIChat = (props: PaigeAIChatProps = {}) => <PaigeAIChatInner {...props} />;
