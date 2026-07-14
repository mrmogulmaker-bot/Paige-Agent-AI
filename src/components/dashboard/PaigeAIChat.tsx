import { useState, useRef, useEffect, useCallback } from "react";
import { PaigeReasoningStrip, upsertStep, type PaigeStep } from "@/components/dashboard/PaigeStepTrace";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Mic, MicOff, Clock } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useConversation, ConversationProvider } from "@elevenlabs/react";
import { primeMicAndAudio, startManagedVoiceSession, describeVoiceError } from "@/lib/voice/startVoiceSession";
import { ResponseFeedback } from "@/components/chat/ResponseFeedback";
import { useQuery } from "@tanstack/react-query";
import { getUserClock } from "@/lib/userClock";
import { useLocation } from "react-router-dom";
import { getCurrentPageName } from "@/lib/pageContext";
import { VoiceDock } from "@/components/voice/VoiceDock";
import type { VoiceModalStatus, VoiceTranscriptEntry } from "@/components/voice/types";
import { EntityDiagramCard } from "@/components/chat/EntityDiagramCard";
import { extractEntityDiagram } from "@/lib/entityDiagram";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { PaigeConfirmCard } from "@/components/chat/PaigeConfirmCard";
import { usePlaybook } from "@/lib/playbook";
import type { QuickChip } from "@/components/paige/commandCenterTypes";
import { usePaigeThreads } from "@/hooks/usePaigeThreads";
import { useScopedUserId } from "@/hooks/useScopedUserId";
import { useTenantContext } from "@/hooks/useTenantContext";
import { ThreadRail } from "@/components/dashboard/paige/ThreadRail";
import { PanelLeft } from "lucide-react";

/** An action Paige filed to the approvals queue this turn (propose→confirm). */
type QueuedApproval = { id: string; summary: string; category: string; contact_id: string | null };
type Message = {
  role: "user" | "assistant";
  content: string;
  queued?: QueuedApproval[];
  confirm?: Array<{ tool: string; summary: string }>;
  /** True on turns rehydrated from history: their confirm cards render settled,
   *  not as a live Approve button (§15 — never re-fire a past action). */
  confirmResolved?: boolean;
};

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
}

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
}: PaigeAIChatProps) => {
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
      const roles = (data || []).map((r: any) => r.role);
      return { isAdmin: roles.includes("admin"), isCoach: roles.includes("coach") };
    },
    staleTime: 5 * 60 * 1000,
  });
  const showFeedback = userRole?.isAdmin || userRole?.isCoach;
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: greeting ?? "Hey, how can I help?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [steps, setSteps] = useState<PaigeStep[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const location = useLocation();
  const currentPageName = getCurrentPageName(location.pathname);

  // ── Multi-chat history (#94) — owner "Your Paige" only (enableHistory). ──
  const scopedUserId = useScopedUserId();
  const { activeTenantId } = useTenantContext();
  const threadsApi = usePaigeThreads({ callerUserId: scopedUserId, tenantId: activeTenantId });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [streamingThreadId, setStreamingThreadId] = useState<string | null>(null);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const openingGreeting = greeting ?? "Hey, how can I help?";

  // Modal-driven voice UI state
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceModalStatus>("connecting");
  const [voiceTranscript, setVoiceTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [voiceMuted, setVoiceMuted] = useState(false);

  // ElevenLabs conversation hook
  const conversation = useConversation({
    // IMPORTANT: Register web_search as a client tool in your ElevenLabs agent dashboard at
    // elevenlabs.io under your Paige agent → Conversational AI → Tools → Add Client Tool.
    // Name: web_search
    // Description: Search the web for current, real-time information relevant to the client's question.
    // Parameter: query (string, required) — the search query to execute.
    clientTools: {
      web_search: async ({ query }: { query: string }) => {
        try {
          const { data, error } = await supabase.functions.invoke("paige-web-search", {
            body: { query },
          });
          if (error) throw error;
          return JSON.stringify({
            query,
            results: data?.results ?? [],
            note: data?.note,
          });
        } catch (err) {
          console.error("[PaigeAIChat] web_search tool failed:", err);
          return JSON.stringify({ error: err instanceof Error ? err.message : "Search failed", results: [] });
        }
      },
    },
    onConnect: () => {
      setVoiceTranscript([]);
      setVoiceStatus("listening");
      setVoiceModalOpen(true);
    },
    onDisconnect: (details) => {
      console.warn("[PaigeAIChat] Voice session disconnected", details);
      setVoiceModalOpen(false);
      setVoiceStatus("connecting");
      toast({ title: "Voice chat ended", description: "The conversation has been closed" });
    },
    onMessage: (message) => {
      const role = message.source === "ai" ? "assistant" : "user";
      const content = message.message || "";
      if (content) setVoiceTranscript(prev => [...prev, { role, content }]);
      if (message.source === "ai") setMessages(prev => [...prev, { role: "assistant", content }]);
      else if (message.source === "user") setMessages(prev => [...prev, { role: "user", content }]);
    },
    onError: (error) => {
      const e: any = error;
      console.error("[PaigeAIChat] ElevenLabs onError raw:", error);
      console.error("[PaigeAIChat] ElevenLabs onError details:", {
        type: typeof error,
        name: e?.name,
        code: e?.code,
        reason: e?.reason,
        message: e?.message,
        context: e?.context,
        stack: e?.stack,
        stringified: (() => { try { return JSON.stringify(error); } catch { return String(error); } })(),
      });
      const msg = typeof error === 'string' ? error : (e?.message || e?.reason || "Failed to connect to voice chat");
      toast({ title: "Voice chat error", description: msg, variant: "destructive" });
    },
  });

  // Sync ElevenLabs speaking state -> modal status
  useEffect(() => {
    if (!voiceModalOpen) return;
    if (conversation.status !== "connected") return;
    setVoiceStatus(conversation.isSpeaking ? "speaking" : "listening");
  }, [conversation.isSpeaking, conversation.status, voiceModalOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mirror the live step trace up so a parent surface (the Live desk) can render it.
  useEffect(() => { onTrace?.(steps, isLoading); }, [steps, isLoading, onTrace]);

  // Collapse the composer back to one line once it's cleared (after send / new chat).
  useEffect(() => { if (input === "" && inputRef.current) inputRef.current.style.height = "auto"; }, [input]);

  // Voice chat functions
  const startVoiceChat = async () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let audioCtx: AudioContext | null = null;
    try {
      setVoiceTranscript([]);
      setVoiceMuted(false);
      setVoiceStatus("connecting");
      setVoiceModalOpen(true);

      const primed = await primeMicAndAudio();
      audioCtx = primed.audioContext;

      const { data: { session } } = await supabase.auth.getSession();

      const recentChatMessages = messages.filter(m => m.content?.trim()).slice(-5).map(m => ({ role: m.role, content: m.content }));

      let greeting: string | undefined;
      try {
        const { data: greetingData } = await supabase.functions.invoke("paige-voice-greeting", {
          body: { currentPage: currentPageName, recentChatMessages },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        greeting = greetingData?.greeting;
        console.log("[PaigeAIChat] Voice greeting:", greeting);
      } catch (greetErr) {
        console.warn("[PaigeAIChat] Greeting fetch failed:", greetErr);
      }

      // ElevenLabs rejects `firstMessage` overrides unless explicitly enabled
      // in the agent dashboard config — sending one closes the socket with
      // code 1008. Skip the override and rely on the agent's default greeting.
      const voiceSession = await startManagedVoiceSession({
        conversation,
        authToken: session?.access_token,
        logLabel: "[PaigeAIChat]",
      });
      console.log("[PaigeAIChat] startSession resolved", voiceSession);
    } catch (error) {
      console.error("[PaigeAIChat] Error starting voice chat:", error);
      setVoiceModalOpen(false);
      if (audioCtx) { try { await audioCtx.close(); } catch {} }
      const { title, description } = describeVoiceError(error, isMobile);
      toast({ title, description, variant: "destructive" });
    }
  };

  const stopVoiceChat = async () => {
    try { await conversation.endSession(); } catch (e) { console.warn(e); }
    setVoiceModalOpen(false);
  };

  const toggleVoiceMute = useCallback(async () => {
    const next = !voiceMuted;
    setVoiceMuted(next);
    try {
      const conv: any = conversation;
      if (typeof conv.setMicMuted === "function") await conv.setMicMuted(next);
      else if (typeof conv.setVolume === "function") await conv.setVolume({ volume: next ? 0 : 1 });
    } catch (err) { console.warn("Mute toggle failed:", err); }
  }, [conversation, voiceMuted]);



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
        return {
          role: t.role as "user" | "assistant",
          content: t.content,
          queued: queued?.length ? queued : undefined,
          confirm: confirm?.length ? confirm : undefined,
          confirmResolved: true,
        };
      });

  const selectThread = async (id: string) => {
    if (id === activeThreadId || isLoading) return; // don't clobber a streaming reply
    try {
      const turns = await threadsApi.loadTurns(id);
      const hydrated = turnsToMessages(turns);
      setMessages(hydrated.length ? hydrated : [{ role: "assistant", content: openingGreeting }]);
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
    setMessages([{ role: "assistant", content: openingGreeting }]);
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

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setSteps([]); // fresh "watch her work" trace per turn

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication Error",
          description: "Please sign in to use Paige AI.",
          variant: "destructive",
        });
        setMessages(messages);
        setIsLoading(false);
        return;
      }

      // History mode: create the thread lazily on the first send, then stream
      // into it. The server is the single writer of turns — we only pass the id.
      let threadId = activeThreadId;
      if (enableHistory) {
        try {
          if (!threadId) {
            threadId = await threadsApi.ensureThread(text);
            setActiveThreadId(threadId);
          }
          setStreamingThreadId(threadId);
        } catch (e) {
          console.error("[PaigeAIChat] ensureThread failed:", e);
          toast({ title: "Couldn't start that chat", description: "Give it another try in a moment.", variant: "destructive" });
          setMessages(messages);
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
          body: JSON.stringify({ messages: newMessages, ...(threadId ? { threadId } : {}), ...(clientId ? { clientId } : {}), ...(clientContext ? { clientContext } : {}), ...getUserClock() }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            title: "Rate Limit Reached",
            description: "Please wait a moment before sending another message.",
            variant: "destructive",
          });
          setMessages(messages);
          setIsLoading(false);
          return;
        }
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let queuedThisTurn: QueuedApproval[] = [];
      // Accumulate EVERY pending confirmation this turn — a blanket "Approve" runs
      // all of them, so the operator must see all of them (design-crew B1).
      const confirmThisTurn: Array<{ tool: string; summary: string }> = [];
      let textBuffer = "";
      let streamDone = false;

      setMessages([...newMessages, { role: "assistant", content: "" }]);

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
            // Structured event: Paige queued an action to the approvals desk.
            if (Array.isArray(parsed.approval_queued)) {
              queuedThisTurn = parsed.approval_queued as QueuedApproval[];
              setMessages([...newMessages, { role: "assistant", content: assistantMessage, queued: queuedThisTurn, confirm: confirmThisTurn.length ? confirmThisTurn : undefined }]);
              continue;
            }
            // Structured event: Paige is asking to confirm a mutating action → render an approve/deny card.
            if (parsed.paige_confirm?.summary) {
              confirmThisTurn.push({ tool: String(parsed.paige_confirm.tool || "action"), summary: String(parsed.paige_confirm.summary) });
              setMessages([...newMessages, { role: "assistant", content: assistantMessage, queued: queuedThisTurn.length ? queuedThisTurn : undefined, confirm: [...confirmThisTurn] }]);
              continue;
            }
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantMessage += content;
              setMessages([...newMessages, { role: "assistant", content: assistantMessage, queued: queuedThisTurn.length ? queuedThisTurn : undefined, confirm: confirmThisTurn.length ? [...confirmThisTurn] : undefined }]);
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
      setMessages(messages);
      setIsLoading(false);
      if (enableHistory) setStreamingThreadId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (conversation.status === "connected") {
        conversation.endSession();
      }
    };
  }, []); // cleanup only on unmount

  const visibleChips = (chips ?? []).filter((c) => !c.visibleWhenFocused || !!clientId);

  return (
    <div className={fill ? "w-full h-full" : `max-w-4xl mx-auto w-full ${hideHeader ? "h-full" : "h-[calc(100vh-4rem)]"}`}>
      <div className={enableHistory ? "flex h-full min-h-0 gap-4 px-3 pt-3 md:px-4" : "flex flex-col h-full"}>
        {enableHistory && (
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
        )}
        <div className={enableHistory ? "flex flex-col h-full min-w-0 flex-1" : "contents"}>
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
          <div className="mb-3 flex items-center gap-2 md:hidden">
            <Button variant="outline" size="sm" onClick={() => setMobileRailOpen(true)}>
              <PanelLeft className="mr-2 h-4 w-4" /> Chats
            </Button>
            <Button variant="gold" size="sm" onClick={startNewChat}>
              New chat
            </Button>
          </div>
        )}

        <Card className="relative flex-1 min-h-0 flex flex-col bg-card border-border shadow-card overflow-hidden">
          {focusBanner}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {message.role === "assistant" && (
                  <img
                    src={paigeAvatar}
                    alt={persona.name || "Paige"}
                    className="w-10 h-10 rounded-full border-2 border-primary"
                  />
                )}
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 border border-border"
                  }`}
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
                      </>
                    );
                  })() : (
                    <p className="text-sm">{message.content}</p>
                  )}
                  {message.role === "assistant" && showFeedback && message.content && (
                    <div className="mt-2 flex items-center">
                      <ResponseFeedback
                        messageContent={message.content}
                        messageIndex={index}
                        sessionId={sessionId}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!hideReasoningStrip && (isLoading || steps.length > 0) && (
            <div className="border-t border-border px-4 pt-3">
              <PaigeReasoningStrip steps={steps} loading={isLoading} personaName={persona.name} />
            </div>
          )}

          <div className="border-t border-border p-4 space-y-3">
            {visibleChips.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-0.5 -mb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleChips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleChip(chip)}
                    disabled={isLoading || conversation.status === "connected"}
                    className="shrink-0 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-[hsl(var(--ring))] hover:text-foreground disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target; el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter inserts a newline (so long messages wrap).
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                placeholder={`Ask ${persona.name || "Paige"} anything…`}
                className="max-h-40 min-h-[2.5rem] flex-1 resize-none"
                disabled={isLoading || conversation.status === "connected"}
              />
              <Button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim() || conversation.status === "connected"}
                variant="gold"
                size="icon"
                aria-label="Send message"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            
            <Button
              onClick={conversation.status === "connected" ? stopVoiceChat : startVoiceChat}
              variant={conversation.status === "connected" ? "destructive" : "outline"}
              className="w-full"
            >
              {conversation.status === "connected" ? (
                <>
                  <MicOff className="w-4 h-4 mr-2" />
                  End Voice Chat
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 mr-2" />
                  Start Voice Chat
                </>
              )}
            </Button>
          </div>

          {/* Voice session UI — scoped to THIS chat card, not the viewport. Owner
              can keep typing to Paige mid-call via the dock's type-while-talking row. */}
          <VoiceDock
            open={voiceModalOpen}
            status={voiceStatus}
            isMuted={voiceMuted}
            pageName={currentPageName}
            transcript={voiceTranscript}
            onToggleMute={toggleVoiceMute}
            onEndCall={stopVoiceChat}
            inputValue={input}
            onInputChange={setInput}
            onSendText={() => handleSend()}
            isSending={isLoading}
          />
        </Card>
        </div>
      </div>
    </div>
  );
};

export const PaigeAIChat = (props: PaigeAIChatProps = {}) => (
  <ConversationProvider>
    <PaigeAIChatInner {...props} />
  </ConversationProvider>
);
