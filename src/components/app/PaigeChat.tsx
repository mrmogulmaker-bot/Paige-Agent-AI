import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Mic, MicOff, Volume2, Paperclip } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { getCurrentPageName, getPageOpeningInstruction } from "@/lib/pageContext";
import type { User, Session } from "@supabase/supabase-js";
import { useConversation, ConversationProvider } from "@elevenlabs/react";
import { useChatDocumentUpload } from "@/hooks/useChatDocumentUpload";
import { usePaigeMemory } from "@/hooks/usePaigeMemory";
import { useClientChatContext } from "@/hooks/useClientChatContext";
import { DocumentAttachmentChip } from "@/components/chat/DocumentAttachmentChip";
import { DocumentMessageBubble } from "@/components/chat/DocumentMessageBubble";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { EntityDiagramCard } from "@/components/chat/EntityDiagramCard";
import { extractEntityDiagram } from "@/lib/entityDiagram";
import { RootCauseCard, extractRootCauseAnalysis } from "@/components/chat/RootCauseCard";
import { SyncStatusPanel } from "@/components/chat/SyncStatusPanel";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { getUserClock } from "@/lib/userClock";
import { primeMicAndAudio, startManagedVoiceSession, describeVoiceError } from "@/lib/voice/startVoiceSession";
import { ExtractionProposalCard, type ExtractionProposal } from "@/components/chat/ExtractionProposalCard";
import { extractFromMessage } from "@/lib/conversationalExtractor";
import { fieldToWriteBackUpdate } from "@/lib/extractionProposal";
import { useProfileSnapshot } from "@/hooks/useProfileSnapshot";
import { VoiceSessionModal, type VoiceModalStatus, type VoiceTranscriptEntry } from "@/components/voice/VoiceSessionModal";
import { trackEvent } from "@/hooks/useAnalytics";
import { usePlaybook } from "@/lib/playbook";
import { PaigeReasoningStrip, upsertStep, type PaigeStep } from "@/components/dashboard/PaigeStepTrace";

type Message = {
  role: "user" | "assistant";
  content: string;
  documentFileName?: string;
  syncStatus?: any;
  /** Inline extraction proposal rendered as a confirmation card after this message. */
  extractionProposal?: ExtractionProposal;
};

interface PaigeChatProps {
  user: User;
  session: Session | null;
  clientId?: string;
}

function PaigeChatInner({ user, session, clientId }: PaigeChatProps) {
  // Persona + quick actions come from the tenant's active Playbook (doctrine
  // §7/§8) so the client-facing Paige is native to the tenant's practice — not
  // a hardcoded credit/funding script. Defaults to neutral coaching today.
  const playbook = usePlaybook();
  const quickActions = playbook.quickActions;
  const { contextBlock, isLoading: contextLoading, hasCreditData } = useClientChatContext(clientId, clientId ? null : user.id);
  // Snapshot of profile/business fields used by the conversational extractor
  // to skip already-populated values. Refreshed after every successful save.
  const { snapshot: profileSnapshot, refresh: refreshProfileSnapshot } = useProfileSnapshot(user.id);
  // Tracks fields a client has explicitly declined in this session so we don't
  // re-prompt them with the same proposal again.
  const declinedFieldsRef = useRef<Set<string>>(new Set());
  const contextInjectedRef = useRef(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  // Page awareness — derive human-readable page name from current route.
  // Tracked in a ref so the latest value is always included in outgoing
  // requests without requiring a re-render of the chat panel.
  const currentPage = useMemo(() => getCurrentPageName(location.pathname), [location.pathname]);
  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Build the contextBlock with the current_page line prepended.
  // Used inside async send handlers so they always see the latest page
  // even if the user navigates mid-chat.
  const buildContextWithPage = useCallback(
    (block: string) => {
      const page = currentPageRef.current;
      if (!block) return `Current page: ${page}`;
      return `Current page: ${page}\n\n${block}`;
    },
    []
  );

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: playbook.persona.greeting,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Paige's live reasoning trace (#95/#125) — the "watch her work" steps she streams.
  const [steps, setSteps] = useState<PaigeStep[]>([]);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Check mic permission on mount
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => {
        setMicPermission(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown');
        result.onchange = () => {
          setMicPermission(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown');
        };
      }).catch(() => { /* permissions API not supported */ });
    }
  }, []);

  // When context loads, send a context-aware, PAGE-AWARE opening via the AI
  useEffect(() => {
    if (contextInjectedRef.current || contextLoading || messages.length !== 1) return;
    if (!contextBlock) return;

    if (!hasCreditData) {
      contextInjectedRef.current = true;
      setMessages([
        {
          role: "assistant",
          content: playbook.persona.greeting,
        },
      ]);
      return;
    }

    contextInjectedRef.current = true;
    (async () => {
      try {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (!freshSession) return;

        // Detect fresh sign-in: auth session created within the last 2 minutes.
        // Supabase issues `expires_at` (epoch seconds) and tokens last ~1h, so
        // session age = 3600 - (expires_at - now). If that's < 120s, the user
        // just signed in and Paige should give a warm "welcome back."
        const nowSec = Math.floor(Date.now() / 1000);
        const expiresAt = (freshSession as any).expires_at as number | undefined;
        const sessionAgeSec = expiresAt ? Math.max(0, 3600 - (expiresAt - nowSec)) : 9999;
        const freshSignIn = sessionAgeSec < 120;

        setIsLoading(true);
        const firstName = (user.user_metadata?.full_name || "").split(" ")[0] || undefined;
        const pageInstruction = getPageOpeningInstruction(currentPageRef.current, firstName, freshSignIn);
        const greetMessages = [{ role: "user" as const, content: pageInstruction }];

        // Inject a session-age line into the context so Paige's system prompt
        // can also see this signal independently of the user-message instruction.
        const sessionLine = freshSignIn
          ? `Session: client just signed in (${sessionAgeSec}s ago) — give a warm "welcome back" greeting, do NOT recite dashboard data on the opener.`
          : `Session: client is mid-session (signed in ${Math.floor(sessionAgeSec / 60)}m ago).`;
        const contextWithSession = `${sessionLine}\n\n${buildContextWithPage(contextBlock)}`;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshSession.access_token}` },
            body: JSON.stringify({
              messages: greetMessages,
              clientContext: contextWithSession,
              ...(clientId ? { clientId } : {}),
              ...getUserClock(),
            }),
          }
        );

        if (!response.ok) { setIsLoading(false); return; }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let greeting = "";

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) greeting += content;
            } catch { /* skip */ }
          }
        }

        if (greeting.trim()) {
          setMessages([{ role: "assistant", content: greeting.trim() }]);
        }
        setIsLoading(false);
      } catch {
        setIsLoading(false);
      }
    })();
  }, [clientId, contextBlock, contextLoading, hasCreditData, messages.length, user, buildContextWithPage]);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    extractDocumentSummary,
    getSessionDocumentContext,
    trackActivity,
    generateSessionSummary,
    resetSession,
  } = usePaigeMemory();

  const {
    attachedDoc,
    isDragOver,
    fileInputRef,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeAttachment,
    openFilePicker,
    setAttachedDoc,
  } = useChatDocumentUpload();

  // --- ElevenLabs voice ---
  // Track voice messages separately so we can summarize them on disconnect
  const voiceMessagesRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  // Modal-driven voice UI state
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceModalStatus>("connecting");
  const [voiceTranscript, setVoiceTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [voiceMuted, setVoiceMuted] = useState(false);

  const conversation = useConversation({
    // IMPORTANT: Register web_search as a client tool in your ElevenLabs agent dashboard at
    // elevenlabs.io under your Paige agent → Conversational AI → Tools → Add Client Tool.
    // Name: web_search
    // Description: Search the web for current vehicle financing rates, lender requirements, and real-time information.
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
          console.error("[PaigeChat] web_search tool failed:", err);
          return JSON.stringify({ error: err instanceof Error ? err.message : "Search failed", results: [] });
        }
      },
    },
    onConnect: () => {
      voiceMessagesRef.current = [];
      setVoiceTranscript([]);
      setVoiceStatus("listening");
      setVoiceModalOpen(true);
    },
    onDisconnect: async (details) => {
      console.warn("[PaigeChat] Voice session disconnected", details);
      setVoiceModalOpen(false);
      setVoiceStatus("connecting");
      toast({ title: "Voice chat ended", description: "The conversation has been closed" });
      // Generate summary + extract preferences from the voice transcript
      const transcript = voiceMessagesRef.current;
      if (transcript.length >= 2) {
        try {
          const { data: summaryData } = await supabase.functions.invoke("paige-voice-summary", {
            body: {
              messages: transcript,
              sessionId: sessionIdRef.current,
              clientId,
              channel: "voice_elevenlabs",
            },
          });
          // Surface any extraction proposal returned from the voice transcript
          // as an inline confirmation card on the most recent assistant message.
          const proposal: ExtractionProposal | undefined = summaryData?.extractionProposal;
          if (proposal && Array.isArray(proposal.fields) && proposal.fields.length > 0) {
            const filteredFields = proposal.fields.filter(
              (f) => !declinedFieldsRef.current.has(f.key)
            );
            if (filteredFields.length > 0) {
              const finalProposal: ExtractionProposal = { ...proposal, fields: filteredFields };
              setMessages(prev => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].role === "assistant") {
                    next[i] = { ...next[i], extractionProposal: finalProposal };
                    return next;
                  }
                }
                next.push({ role: "assistant", content: "", extractionProposal: finalProposal });
                return next;
              });
            }
          }
        } catch (err) {
          console.warn("Voice summary failed:", err);
        }
      }
      voiceMessagesRef.current = [];
    },
    onMessage: (message) => {
      const role = message.source === "ai" ? "assistant" : "user";
      const content = message.message || "";
      if (content) {
        voiceMessagesRef.current.push({ role, content });
        setVoiceTranscript(prev => [...prev, { role, content }]);
      }
      if (message.source === "ai") setMessages(prev => [...prev, { role: "assistant", content }]);
      else if (message.source === "user") setMessages(prev => [...prev, { role: "user", content }]);
    },
    onError: (error) => {
      const e: any = error;
      console.error("[PaigeChat] ElevenLabs onError raw:", error);
      console.error("[PaigeChat] ElevenLabs onError details:", {
        type: typeof error,
        name: e?.name,
        code: e?.code,
        reason: e?.reason,
        message: e?.message,
        context: e?.context,
        stack: e?.stack,
        stringified: (() => { try { return JSON.stringify(error); } catch { return String(error); } })(),
      });
      const errorMsg = typeof error === 'string' ? error : (e?.message || e?.reason || "Failed to connect to voice chat");
      // Give mobile-friendly error guidance
      if (errorMsg.includes("NotAllowed") || errorMsg.includes("Permission")) {
        toast({
          title: "Microphone Access Required",
          description: "Please allow microphone access in your browser settings, then try again.",
          variant: "destructive",
        });
        setMicPermission('denied');
      } else {
        toast({ title: "Voice chat error", description: errorMsg, variant: "destructive" });
      }
    },
  });

  // Sync ElevenLabs speaking state -> modal status pill
  useEffect(() => {
    if (!voiceModalOpen) return;
    if (conversation.status !== "connected") return;
    setVoiceStatus(conversation.isSpeaking ? "speaking" : "listening");
  }, [conversation.isSpeaking, conversation.status, voiceModalOpen]);

  const startVoiceChat = async () => {
    if (micPermission === 'denied') {
      toast({
        title: "Microphone Blocked",
        description: isMobile
          ? "Enable microphone in your browser settings. On iPhone: Settings > Safari > Microphone."
          : "Tap the lock icon in your browser's address bar to enable microphone access.",
        variant: "destructive",
      });
      return;
    }

    let audioCtx: AudioContext | null = null;
    try {
      // Open the modal immediately (status: connecting) so user gets feedback.
      setVoiceTranscript([]);
      setVoiceMuted(false);
      setVoiceStatus("connecting");
      setVoiceModalOpen(true);

      // Prime mic + audio output INSIDE the click gesture (iOS Safari requirement).
      const primed = await primeMicAndAudio();
      audioCtx = primed.audioContext;
      setMicPermission('granted');

      const { data: { session: freshSession } } = await supabase.auth.getSession();

      // Last 5 messages from current chat for continuity context.
      const recentChatMessages = messages
        .filter(m => m.content && m.content.trim())
        .slice(-5)
        .map(m => ({ role: m.role, content: m.content }));

      // Fetch dynamic, page-aware greeting from edge function.
      let greeting: string | undefined;
      try {
        const { data: greetingData } = await supabase.functions.invoke("paige-voice-greeting", {
          body: {
            currentPage: currentPageRef.current,
            recentChatMessages,
          },
          headers: freshSession?.access_token ? { Authorization: `Bearer ${freshSession.access_token}` } : undefined,
        });
        greeting = greetingData?.greeting;
        console.log("[PaigeChat] Voice greeting:", greeting);
      } catch (greetErr) {
        console.warn("[PaigeChat] Greeting fetch failed; falling back:", greetErr);
      }

      const voicePageLine = `Current page: ${currentPageRef.current}`;
      const historyBlock = recentChatMessages.length > 0
        ? `\n\nRECENT CHAT HISTORY (last ${recentChatMessages.length} turns — pick up from here):\n${recentChatMessages.map(m => `${m.role === "user" ? "Client" : "Paige"}: ${m.content}`).join("\n")}`
        : "";

      const voicePersona = `You are ${playbook.persona.name}, ${playbook.persona.role} (${playbook.persona.domain}). Tone: ${playbook.persona.tone}.`;
      const voiceSystemPrompt = contextBlock
        ? `${voicePersona} You have this client's records on file — use them to give specific answers and never ask for information you already have.\n\n${voicePageLine}\n\nCLIENT DATA:\n${contextBlock}${historyBlock}\n\nRULES:\n- Reference specifics from the client data above\n- The client is currently viewing the "${currentPageRef.current}" page — assume their questions relate to what they are seeing there\n- Never fabricate data\n- VOICE: Be conversational and concise (1-2 short sentences per turn). Use natural acknowledgments like "Got it", "Right", "Exactly". Never read bullet points aloud — convert to natural speech.\n- Keep the client moving toward their goals`
        : `${voicePersona} ${voicePageLine}.${historyBlock}\n\nVOICE: Be conversational and concise. Use short sentences and natural acknowledgments.`;

      // NOTE: ElevenLabs rejects `firstMessage` and `prompt` overrides unless
      // they are explicitly enabled in the agent dashboard config. Sending them
      // causes a 1008 close ("Override for field 'X' is not allowed by config").
      // Rely on the agent's dashboard defaults for greeting + system prompt.
      void voiceSystemPrompt; // built above for future use once overrides are enabled
      void greeting;

      const voiceSession = await startManagedVoiceSession({
        conversation,
        authToken: freshSession?.access_token,
        logLabel: "[PaigeChat]",
      });
      (window as unknown as { __paigeVoiceStart?: number }).__paigeVoiceStart = Date.now();
      void trackEvent("voice_session_start", "engagement", { page: currentPageRef.current });
      console.log("[PaigeChat] startSession resolved", voiceSession);
    } catch (err: any) {
      console.error("[PaigeChat] Voice start failed:", err);
      setVoiceModalOpen(false);
      if (audioCtx) { try { await audioCtx.close(); } catch {} }
      if (err?.name === "NotAllowedError" || err?.message?.toLowerCase?.().includes("permission")) {
        setMicPermission('denied');
      }
      const { title, description } = describeVoiceError(err, isMobile);
      toast({ title, description, variant: "destructive" });
    }
  };

  const stopVoiceChat = async () => {
    const startedAt = (window as unknown as { __paigeVoiceStart?: number }).__paigeVoiceStart;
    const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    try { await conversation.endSession(); } catch (e) { console.warn("Error ending session", e); }
    setVoiceModalOpen(false);
    void trackEvent("voice_session_end", "engagement", { duration_seconds: durationSeconds });
  };

  const toggleVoiceMute = useCallback(async () => {
    const next = !voiceMuted;
    setVoiceMuted(next);
    try {
      const conv: any = conversation;
      if (typeof conv.setMicMuted === "function") {
        await conv.setMicMuted(next);
      } else if (typeof conv.setVolume === "function") {
        await conv.setVolume({ volume: next ? 0 : 1 });
      }
    } catch (err) {
      console.warn("Mute toggle failed:", err);
    }
  }, [conversation, voiceMuted]);

  useEffect(() => {
    const handleFactoryReset = async () => {
      contextInjectedRef.current = false;
      resetSession();
      setInput("");
      setMessages([
        {
          role: "assistant",
          content: playbook.persona.greeting,
        },
      ]);
      if (conversation.status === "connected") {
        try {
          await conversation.endSession();
        } catch (error) {
          console.warn("Error ending voice session after reset", error);
        }
      }
    };

    window.addEventListener("paige-factory-reset", handleFactoryReset);
    return () => window.removeEventListener("paige-factory-reset", handleFactoryReset);
  }, [conversation, resetSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const resetInactivityTimer = useCallback(() => {
    trackActivity();
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      if (messages.length > 2) {
        generateSessionSummary(
          messages.map(m => ({ role: m.role, content: m.content })),
          sessionIdRef.current
        );
      }
    }, 30 * 60 * 1000);
  }, [messages, trackActivity, generateSessionSummary]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (messages.length > 2) {
        generateSessionSummary(
          messages.map(m => ({ role: m.role, content: m.content })),
          sessionIdRef.current
        );
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Confirm a conversational extraction proposal — POST selected fields to
   * paige-write-back, then refresh the local profile snapshot so the extractor
   * stops re-detecting them. Throws on failure so the card can show the error.
   */
  const handleExtractionConfirm = async (proposal: ExtractionProposal, selectedKeys: string[]) => {
    const selected = proposal.fields.filter(f => selectedKeys.includes(f.key));
    if (selected.length === 0) return;

    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (!freshSession) throw new Error("Session expired — please sign in again.");

    const { data, error } = await supabase.functions.invoke("paige-write-back", {
      body: {
        updates: selected.map(fieldToWriteBackUpdate),
        source: "conversation",
      },
      headers: { Authorization: `Bearer ${freshSession.access_token}` },
    });
    if (error) throw error;

    const failed = (data?.results || []).filter((r: any) => !r.success);
    if (failed.length > 0 && failed.length === selected.length) {
      throw new Error(failed[0]?.error || "Save failed.");
    }
    if (failed.length > 0) {
      toast({
        title: "Saved with warnings",
        description: `${failed.length} field${failed.length === 1 ? "" : "s"} could not be saved.`,
      });
    }
    // Refresh snapshot so the extractor will skip these fields next time.
    await refreshProfileSnapshot();
    queryClient.invalidateQueries({ queryKey: ["client-chat-context"] });
  };

  const handleExtractionSkip = (proposal: ExtractionProposal) => {
    // Remember declined fields so we don't re-prompt for them this session.
    for (const f of proposal.fields) declinedFieldsRef.current.add(f.key);
  };

  const handleSend = async (overrideInput?: string) => {
    const messageText = overrideInput || input;
    if ((!messageText.trim() && !attachedDoc) || isLoading) return;

    resetInactivityTimer();

    const userMessage: Message = {
      role: "user",
      content: messageText.trim() || (attachedDoc ? `Analyze this document: ${attachedDoc.name}` : ""),
      documentFileName: attachedDoc?.name,
    };
    const isFirstUserMessage = messages.every((m) => m.role !== "user");
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    if (isFirstUserMessage) {
      void trackEvent("paige_session_start", "engagement", { page: currentPageRef.current });
      void trackEvent("first_paige_message", "activation", { page: currentPageRef.current });
    }
    void trackEvent("paige_message_sent", "engagement", {
      has_attachment: !!attachedDoc,
      page: currentPageRef.current,
    });

    // Blur input on mobile to dismiss keyboard after sending
    if (isMobile && inputRef.current) {
      inputRef.current.blur();
    }

    const currentDoc = attachedDoc;
    setAttachedDoc(null);
    setIsLoading(true);

    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();

      if (!freshSession) {
        toast({ title: "Session Expired", description: "Please sign in again.", variant: "destructive" });
        setMessages(messages);
        setIsLoading(false);
        return;
      }

      const payload: any = {
        messages: newMessages.map(m => ({
          role: m.role,
          content: m.content,
          ...(m.documentFileName ? { documentFileName: m.documentFileName } : {}),
        })),
        sessionDocumentContext: getSessionDocumentContext(),
        ...(clientId ? { clientId } : {}),
        ...getUserClock(),
        // Always include current_page even if there's no credit context block yet,
        // so Paige can still tailor responses to the section the client is viewing.
        clientContext: buildContextWithPage(contextBlock || ""),
      };

      if (currentDoc) {
        payload.document = {
          base64: currentDoc.base64,
          fileName: currentDoc.name,
          mimeType: "application/pdf",
        };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${freshSession.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast({ title: "Rate Limit Reached", description: "Please wait a moment.", variant: "destructive" });
          setMessages(messages);
          setIsLoading(false);
          return;
        }
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let textBuffer = "";
      let streamDone = false;
      let syncStatus: any = null;

      setMessages([...newMessages, { role: "assistant", content: "" }]);
      setSteps([]); // clear last turn's reasoning as this one starts

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
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.paige_step) {
              // Live "watch her work" frame — upsert into the reasoning strip.
              setSteps((prev) => upsertStep(prev, parsed.paige_step as PaigeStep));
              continue;
            }
            if (parsed.sync_status) {
              syncStatus = parsed.sync_status;
              continue;
            }
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantMessage += content;
              setMessages([...newMessages, { role: "assistant", content: assistantMessage }]);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (currentDoc && assistantMessage.length > 100) {
        extractDocumentSummary(assistantMessage, currentDoc.name);

        if (syncStatus) {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: "", syncStatus },
          ]);
          queryClient.invalidateQueries({ queryKey: ["credit-factors"] });
          queryClient.invalidateQueries({ queryKey: ["credit-factors-history"] });
          queryClient.invalidateQueries({ queryKey: ["funding-matches"] });
          queryClient.invalidateQueries({ queryKey: ["funding-matches-profile-scores"] });
          queryClient.invalidateQueries({ queryKey: ["funding-projections"] });
          // Score inputs changed — refresh fundability so the dashboard
          // doesn't keep displaying the pre-upload number.
          queryClient.invalidateQueries({ queryKey: ["three-fundability-inputs"] });
          queryClient.invalidateQueries({ queryKey: ["funding-readiness-supplemental"] });
        }
      }

      // Run conversational extractor against the user message AFTER the assistant
      // reply renders. Attach an inline confirmation card to the last assistant message.
      if (!currentDoc && messageText.trim()) {
        try {
          const proposal = extractFromMessage(messageText, profileSnapshot);
          if (proposal) {
            const filteredFields = proposal.fields.filter(
              (f) => !declinedFieldsRef.current.has(f.key)
            );
            if (filteredFields.length > 0) {
              const finalProposal: ExtractionProposal = { ...proposal, fields: filteredFields };
              setMessages(prev => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].role === "assistant") {
                    next[i] = { ...next[i], extractionProposal: finalProposal };
                    return next;
                  }
                }
                next.push({ role: "assistant", content: "", extractionProposal: finalProposal });
                return next;
              });
            }
          }
        } catch (err) {
          console.warn("Conversational extractor failed:", err);
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Chat error:", error);
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
      setMessages(messages);
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-card border-r border-border relative ${isDragOver ? "ring-2 ring-primary ring-inset" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/10 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-card border-2 border-dashed border-primary rounded-xl px-6 py-4 text-center">
            <p className="text-sm font-medium text-primary">Drop PDF here to attach</p>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />

      {/* Header — compact on mobile */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <img src={paigeAvatar} alt="Paige" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-accent" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-foreground text-sm capitalize">{playbook.persona.name}</h2>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate capitalize">{playbook.persona.role}</p>
          </div>
          {/* Voice status in header on mobile for visibility */}
          {isMobile && conversation.status === "connected" && (
            <div className="flex items-center gap-1.5">
              {conversation.isSpeaking ? (
                <div className="flex items-center gap-1 text-primary text-xs">
                  <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                  <span className="text-[10px]">Speaking</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-primary text-xs">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px]">Listening</span>
                </div>
              )}
              <Button
                onClick={stopVoiceChat}
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-[10px]"
              >
                <MicOff className="w-3 h-3 mr-1" />
                End
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {messages.map((message, index) => (
          <div key={index} className={`flex gap-2 sm:gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {message.role === "assistant" && (
              <img src={paigeAvatar} alt="Paige" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-accent flex-shrink-0" />
            )}
            <div className={`max-w-[88%] sm:max-w-[85%] rounded-lg px-3 py-2 sm:px-3.5 sm:py-2.5 ${message.role === "user" ? "bg-accent text-accent-foreground" : "bg-muted/40 border border-border"}`}>
              {message.documentFileName && <DocumentMessageBubble fileName={message.documentFileName} />}
              {message.content && (
                message.role === "assistant" ? (() => {
                  // Two-stage extraction: root-cause card first, then entity diagram in remainder.
                  const rc = extractRootCauseAnalysis(message.content);
                  const remainder = rc.analysis ? `${rc.before}\n\n${rc.after}`.trim() : message.content;
                  const { before, diagram, after } = extractEntityDiagram(remainder);
                  return (
                    <>
                      {before && <MarkdownMessage content={before} />}
                      {diagram && <EntityDiagramCard data={diagram} />}
                      {after && <MarkdownMessage content={after} />}
                      {rc.analysis && <RootCauseCard data={rc.analysis} />}
                    </>
                  );
                })() : (
                  <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                )
              )}
              {message.syncStatus && <SyncStatusPanel syncStatus={message.syncStatus} />}
              {message.extractionProposal && (
                <ExtractionProposalCard
                  proposal={message.extractionProposal}
                  onConfirm={(selectedKeys) => handleExtractionConfirm(message.extractionProposal!, selectedKeys)}
                  onSkip={() => handleExtractionSkip(message.extractionProposal!)}
                />
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-2 sm:gap-3">
            <img src={paigeAvatar} alt="Paige" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-accent flex-shrink-0" />
            <div className="bg-muted/40 border border-border rounded-lg px-3.5 py-2.5">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Paige's live reasoning — the "watch her work" strip (#95/#125), now on the
          primary /app surface. Shows an "on watch" resting pill when idle. */}
      <div className="px-3 sm:px-4 pt-1 flex-shrink-0">
        <PaigeReasoningStrip steps={steps} loading={isLoading} personaName={playbook?.persona?.name} />
      </div>

      {/* Quick actions — horizontally scrollable on mobile */}
      <div className="px-3 sm:px-4 pb-1.5 sm:pb-2 flex-shrink-0">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleSend(action.prompt)}
              disabled={isLoading || conversation.status === "connected"}
              className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border border-border bg-background hover:bg-accent/10 hover:border-accent/40 text-muted-foreground hover:text-gold-dark transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Voice status indicator — desktop only (mobile shows in header) */}
      {!isMobile && conversation.status === "connected" && (
        <div className="px-4 pb-2 space-y-2 flex-shrink-0">
          <div className="flex items-center justify-center gap-4 text-sm">
            {conversation.isSpeaking ? (
              <div className="flex items-center gap-2 text-primary"><Volume2 className="h-4 w-4 animate-pulse" /><span>Speaking...</span></div>
            ) : (
              <div className="flex items-center gap-2 text-primary"><div className="h-2 w-2 rounded-full bg-primary animate-pulse" /><span>Listening...</span></div>
            )}
          </div>
        </div>
      )}

      {attachedDoc && (
        <div className="px-3 pt-1.5 flex-shrink-0">
          <DocumentAttachmentChip fileName={attachedDoc.name} onRemove={removeAttachment} />
        </div>
      )}

      {/* Input area — safe area padding on mobile */}
      <div className="p-2 sm:p-3 border-t border-border space-y-2 flex-shrink-0 pb-[env(safe-area-inset-bottom,8px)]">
        {/* Text input during voice mode — desktop */}
        {!isMobile && conversation.status === "connected" && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground text-center">Voice active — type to send a text message instead</p>
            <div className="flex gap-2 items-center">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type to Paige while talking... (Shift+Enter for new line)"
                rows={1}
                className="flex-1 text-sm bg-muted/30 border-border/50 min-h-[40px] max-h-[160px] resize-none py-2"
              />
              <Button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                className="bg-gradient-gold hover:opacity-90"
                size="icon"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Mobile voice mode: simplified input */}
        {isMobile && conversation.status === "connected" && (
          <div className="flex gap-2 items-center">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Or type to Paige... (Shift+Enter for new line)"
              rows={1}
              className="flex-1 text-sm bg-muted/30 border-border/50 min-h-[40px] max-h-[160px] resize-none py-2"
            />
            <Button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="bg-gradient-gold hover:opacity-90 h-10 w-10"
              size="icon"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        )}

        <div className="flex gap-1.5 sm:gap-2 items-center">
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-9 sm:w-9 flex-shrink-0 text-muted-foreground hover:text-primary" onClick={openFilePicker} disabled={isLoading || conversation.status === "connected"} title="Attach a document (PDF)">
            <Paperclip className="w-4 h-4" />
          </Button>
          {conversation.status !== "connected" && (
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={attachedDoc ? "Add a message or send document... (Shift+Enter for new line)" : "Ask Paige anything... (Shift+Enter for new line)"}
              rows={1}
              className="flex-1 text-sm min-h-[40px] max-h-[200px] resize-none py-2"
              disabled={isLoading}
            />
          )}
          {conversation.status !== "connected" && (
            <Button onClick={() => handleSend()} disabled={isLoading || (!input.trim() && !attachedDoc)} className="bg-gradient-gold hover:opacity-90 h-10 w-10" size="icon">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          )}
          {/* Mic button — larger on mobile for easy tapping */}
          <Button
            onClick={conversation.status === "connected" ? stopVoiceChat : startVoiceChat}
            variant={conversation.status === "connected" ? "destructive" : "secondary"}
            size="icon"
            className={`flex-shrink-0 ${isMobile ? "h-10 w-10" : "h-9 w-9"} ${micPermission === 'denied' ? 'opacity-60' : ''}`}
            title={
              micPermission === 'denied'
                ? "Microphone blocked — tap to learn how to enable"
                : conversation.status === "connected"
                  ? "End voice chat"
                  : "Start voice chat with Paige"
            }
          >
            {conversation.status === "connected" ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Premium voice session UI — full-screen modal with avatar, transcript, controls. */}
      <VoiceSessionModal
        open={voiceModalOpen}
        status={voiceStatus}
        isMuted={voiceMuted}
        pageName={currentPage}
        transcript={voiceTranscript}
        onToggleMute={toggleVoiceMute}
        onEndCall={stopVoiceChat}
      />
    </div>
  );
}

export function PaigeChat(props: PaigeChatProps) {
  return (
    <ConversationProvider>
      <PaigeChatInner {...props} />
    </ConversationProvider>
  );
}
