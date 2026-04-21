import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X, Send, Loader2, Mic, MicOff, Volume2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { useConversation, ConversationProvider } from "@elevenlabs/react";
import { useChatDocumentUpload } from "@/hooks/useChatDocumentUpload";
import { usePaigeMemory } from "@/hooks/usePaigeMemory";
import { useClientChatContext } from "@/hooks/useClientChatContext";
import { DocumentAttachmentChip } from "@/components/chat/DocumentAttachmentChip";
import { DocumentMessageBubble } from "@/components/chat/DocumentMessageBubble";
import { SyncStatusPanel } from "@/components/chat/SyncStatusPanel";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { EntityDiagramCard } from "@/components/chat/EntityDiagramCard";
import { extractEntityDiagram } from "@/lib/entityDiagram";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { getUserClock } from "@/lib/userClock";
import { primeMicAndAudio, startManagedVoiceSession, describeVoiceError } from "@/lib/voice/startVoiceSession";
import { getCurrentPageName } from "@/lib/pageContext";
import { VoiceSessionModal, type VoiceModalStatus, type VoiceTranscriptEntry } from "@/components/voice/VoiceSessionModal";

type Message = {
  role: "user" | "assistant";
  content: string;
  documentFileName?: string;
  syncStatus?: any;
};

const FloatingChatbotInner = ({ clientId }: { clientId?: string }) => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { contextBlock, hasCreditData } = useClientChatContext(clientId, clientId ? null : currentUserId);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hey, how can I help?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Allow other components (e.g. PostUploadNextSteps) to open Paige programmatically
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("paige-open-chat", handleOpen);
    return () => window.removeEventListener("paige-open-chat", handleOpen);
  }, []);

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

  // Modal-driven voice UI state
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceModalStatus>("connecting");
  const [voiceTranscript, setVoiceTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const currentPageName = getCurrentPageName(location.pathname);

  const conversation = useConversation({
    onConnect: () => {
      setVoiceTranscript([]);
      setVoiceStatus("listening");
      setVoiceModalOpen(true);
    },
    onDisconnect: (details) => {
      console.warn("[FloatingChatbot] Voice session disconnected", details);
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
      // Verbose logging to capture exact ElevenLabs failure (deprecated voice, bad agent, etc.)
      const e: any = error;
      console.error("[FloatingChatbot] ElevenLabs onError raw:", error);
      console.error("[FloatingChatbot] ElevenLabs onError details:", {
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
      if (errorMsg.includes("NotAllowed") || errorMsg.includes("Permission")) {
        toast({ title: "Microphone Access Required", description: "Please allow microphone access in your browser settings, then try again.", variant: "destructive" });
        setMicPermission('denied');
      } else {
        toast({ title: "Voice chat error", description: errorMsg, variant: "destructive" });
      }
    },
  });

  // Sync ElevenLabs speaking state -> modal status
  useEffect(() => {
    if (!voiceModalOpen) return;
    if (conversation.status !== "connected") return;
    setVoiceStatus(conversation.isSpeaking ? "speaking" : "listening");
  }, [conversation.isSpeaking, conversation.status, voiceModalOpen]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const resetInactivityTimer = useCallback(() => {
    trackActivity();
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      if (messages.length > 2) {
        generateSessionSummary(messages.map(m => ({ role: m.role, content: m.content })), sessionIdRef.current);
      }
    }, 30 * 60 * 1000);
  }, [messages, trackActivity, generateSessionSummary]);

  const handleClose = useCallback(() => {
    if (messages.length > 2) {
      generateSessionSummary(messages.map(m => ({ role: m.role, content: m.content })), sessionIdRef.current);
    }
    setIsOpen(false);
  }, [messages, generateSessionSummary]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

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
      // Open the modal immediately so user sees feedback while we connect.
      setVoiceTranscript([]);
      setVoiceMuted(false);
      setVoiceStatus("connecting");
      setVoiceModalOpen(true);

      // 1) Prime mic + audio output INSIDE the click gesture (iOS Safari requirement).
      const primed = await primeMicAndAudio();
      audioCtx = primed.audioContext;
      setMicPermission('granted');

      // 2) Fetch credentials (WebRTC token preferred; signed URL fallback).
      const { data: { session } } = await supabase.auth.getSession();
      // Last 5 messages from current chat for continuity context.
      const recentChatMessages = messages
        .filter(m => m.content && m.content.trim())
        .slice(-5)
        .map(m => ({ role: m.role, content: m.content }));

      // Fetch dynamic, page-aware greeting.
      let greeting: string | undefined;
      try {
        const { data: greetingData } = await supabase.functions.invoke("paige-voice-greeting", {
          body: { currentPage: currentPageName, recentChatMessages },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        greeting = greetingData?.greeting;
        console.log("[FloatingChatbot] Voice greeting:", greeting);
      } catch (greetErr) {
        console.warn("[FloatingChatbot] Greeting fetch failed; using default:", greetErr);
      }

      const historyBlock = recentChatMessages.length > 0
        ? `\n\nRECENT CHAT HISTORY (last ${recentChatMessages.length} turns — pick up from here):\n${recentChatMessages.map(m => `${m.role === "user" ? "Client" : "Paige"}: ${m.content}`).join("\n")}`
        : "";

      const voiceSystemPrompt = contextBlock
        ? `You are Paige, the AI credit strategist for PaigeAgent.ai. You have full access to this client's credit file data.\n\nCurrent page: ${currentPageName}\n\nCLIENT DATA:\n${contextBlock}${historyBlock}\n\nRULES:\n- Reference specific scores, accounts, and amounts from the client data\n- Never fabricate data\n- VOICE: Be conversational and concise (1-2 short sentences per turn). Use natural acknowledgments like "Got it", "Right". Never read bullet points aloud.\n- Connect insights to funding goals when relevant`
        : `You are Paige, the AI credit strategist for PaigeAgent.ai. Current page: ${currentPageName}.${historyBlock}\n\nVOICE: Be conversational and concise. Use short sentences and natural acknowledgments.`;

      // ElevenLabs rejects firstMessage/prompt overrides unless explicitly
      // enabled in the agent dashboard. Skip the override payload so the
      // session can connect; rely on the agent's default first message.
      voicePendingContextRef.current = { systemPrompt: voiceSystemPrompt, greeting };

      const voiceSession = await startManagedVoiceSession({
        conversation,
        authToken: session?.access_token,
        logLabel: "[FloatingChatbot]",
      });
      console.log("[FloatingChatbot] startSession resolved", voiceSession);
    } catch (err: any) {
      console.error("[FloatingChatbot] Voice start failed:", err);
      console.error("[FloatingChatbot] Voice start error details:", {
        name: err?.name, code: err?.code, message: err?.message, reason: err?.reason,
        stringified: (() => { try { return JSON.stringify(err); } catch { return String(err); } })(),
      });
      setVoiceModalOpen(false);
      // Tear down audio context if start failed.
      if (audioCtx) { try { await audioCtx.close(); } catch {} }
      if (err?.name === "NotAllowedError" || err?.message?.toLowerCase?.().includes("permission")) {
        setMicPermission('denied');
      }
      const { title, description } = describeVoiceError(err, isMobile);
      toast({ title, description, variant: "destructive" });
    }
  };

  const stopVoiceChat = async () => {
    try { await conversation.endSession(); } catch (e) { console.warn("Error ending session", e); }
    setVoiceModalOpen(false);
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
      resetSession();
      setInput("");
      setMessages([
        {
          role: "assistant",
          content: "I don't see any credit data in your file yet. Upload your credit report and I will analyze it and give you a full picture of your credit situation.",
        },
      ]);
      if (conversation.status === "connected") {
        try {
          await conversation.endSession();
        } catch (error) {
          console.warn("Error ending widget voice session after reset", error);
        }
      }
    };

    window.addEventListener("paige-factory-reset", handleFactoryReset);
    return () => window.removeEventListener("paige-factory-reset", handleFactoryReset);
  }, [conversation, resetSession]);

  const handleSend = async () => {
    if ((!input.trim() && !attachedDoc) || isLoading) return;

    resetInactivityTimer();

    const userMessage: Message = {
      role: "user",
      content: input.trim() || (attachedDoc ? `Analyze this document: ${attachedDoc.name}` : ""),
      documentFileName: attachedDoc?.name,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    if (isMobile && inputRef.current) {
      inputRef.current.blur();
    }

    const currentDoc = attachedDoc;
    setAttachedDoc(null);
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const payload: any = {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
          ...(m.documentFileName ? { documentFileName: m.documentFileName } : {}),
        })),
        sessionDocumentContext: getSessionDocumentContext(),
        ...(clientId ? { clientId } : {}),
        ...(contextBlock ? { clientContext: contextBlock } : {}),
        ...getUserClock(),
      };

      if (currentDoc) {
        payload.document = { base64: currentDoc.base64, fileName: currentDoc.name, mimeType: "application/pdf" };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 429) {
        toast({ title: "Rate limit exceeded", description: "Please try again in a moment.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let syncStatus: any = null;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.sync_status) {
                syncStatus = parsed.sync_status;
                continue;
              }
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { role: "assistant", content: assistantMessage };
                  return newMessages;
                });
              }
            } catch { /* skip */ }
          }
        }
      }

      if (currentDoc && assistantMessage.length > 100) {
        extractDocumentSummary(assistantMessage, currentDoc.name);
        if (syncStatus) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "", syncStatus },
          ]);
          queryClient.invalidateQueries({ queryKey: ["credit-factors"] });
          queryClient.invalidateQueries({ queryKey: ["credit-factors-history"] });
          queryClient.invalidateQueries({ queryKey: ["funding-matches"] });
          queryClient.invalidateQueries({ queryKey: ["funding-matches-profile-scores"] });
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  // On mobile: hide on /app (PaigeChat is full-screen there) and on non-app pages (auth, landing, etc.)
  const hideChatbot = isMobile && (location.pathname === "/app" || !location.pathname.startsWith("/app"));

  const chatContent = (
    <>
      {!isOpen && !hideChatbot && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-glow z-[9999]"
          variant="gold"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {isOpen && !hideChatbot && (
        <Card
          className={`fixed z-[9999] flex flex-col ${isDragOver ? "ring-2 ring-primary" : ""} ${
            isMobile
              ? "inset-0 w-full h-full rounded-none animate-in fade-in slide-in-from-bottom-4 duration-200"
              : "bottom-6 right-6 w-[380px] max-w-[calc(100vw-32px)] h-[min(600px,calc(100vh-48px))] origin-bottom-right animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200"
          } shadow-glow`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver && (
            <div className="absolute inset-0 bg-primary/10 z-10 flex items-center justify-center rounded-xl pointer-events-none">
              <p className="text-sm font-medium text-primary">Drop PDF here</p>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />

          <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src={paigeAvatar} alt="PaigeAgent.ai" className="w-8 h-8 rounded-full" />
              <div>
                <h3 className="font-semibold text-sm">PaigeAgent.ai</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Your Credit Coach</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Mobile voice status + end button in header */}
              {isMobile && conversation.status === "connected" && (
                <div className="flex items-center gap-1.5 mr-2">
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
                  <Button onClick={stopVoiceChat} variant="destructive" size="sm" className="h-7 px-2 text-[10px]">
                    <MicOff className="w-3 h-3 mr-1" />
                    End
                  </Button>
                </div>
              )}
              {/* Desktop voice status icon */}
              {!isMobile && conversation.status === "connected" && (
                <div className="flex items-center gap-1 text-primary text-xs mr-2">
                  {conversation.isSpeaking ? (
                    <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  )}
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 p-3 sm:p-4 overflow-y-auto" ref={scrollRef}>
            <div className="space-y-3 sm:space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex gap-2 sm:gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" && (
                    <img src={paigeAvatar} alt="PaigeAgent.ai" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0" />
                  )}
                  <div className={`rounded-lg px-3 py-2 sm:px-4 sm:py-2 max-w-[85%] sm:max-w-[80%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {message.documentFileName && <DocumentMessageBubble fileName={message.documentFileName} />}
                    {message.content && (
                      message.role === "assistant" ? (() => {
                        const { before, diagram, after } = extractEntityDiagram(message.content);
                        return (
                          <>
                            {before && <MarkdownMessage content={before} />}
                            {diagram && <EntityDiagramCard data={diagram} />}
                            {after && <MarkdownMessage content={after} />}
                          </>
                        );
                      })() : (
                        <p className="text-[13px] sm:text-sm whitespace-pre-wrap">{message.content}</p>
                      )
                    )}
                    {message.syncStatus && <SyncStatusPanel syncStatus={message.syncStatus} />}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 sm:p-4 border-t border-border flex-shrink-0 pb-[env(safe-area-inset-bottom,8px)]">
            {conversation.status === "connected" && (
              <div className="mb-2 sm:mb-3 space-y-2">
                {!isMobile && (
                  <div className="flex items-center justify-center gap-4 text-sm">
                    {conversation.isSpeaking ? (
                      <div className="flex items-center gap-2 text-primary"><Volume2 className="h-4 w-4 animate-pulse" /><span>Speaking...</span></div>
                    ) : (
                      <div className="flex items-center gap-2 text-primary"><div className="h-2 w-2 rounded-full bg-primary animate-pulse" /><span>Listening...</span></div>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground text-center">Voice active — type to send a text message instead</p>
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Type to Paige while talking..."
                    className="bg-muted/30 border-border/50 h-10"
                  />
                  <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon" className="h-10 w-10">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {attachedDoc && (
              <div className="mb-2">
                <DocumentAttachmentChip fileName={attachedDoc.name} onRemove={removeAttachment} />
              </div>
            )}

            <div className="flex gap-1.5 sm:gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-primary" onClick={openFilePicker} disabled={isLoading || conversation.status === "connected"} title="Attach PDF">
                <Paperclip className="h-4 w-4" />
              </Button>
              {conversation.status !== "connected" && (
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSend()}
                  placeholder={attachedDoc ? "Add a message..." : "Ask me anything..."}
                  disabled={isLoading}
                  className="h-10"
                />
              )}
              {conversation.status !== "connected" && (
                <Button onClick={handleSend} disabled={isLoading || (!input.trim() && !attachedDoc)} size="icon" className="h-10 w-10">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              )}
              <Button
                onClick={conversation.status === "connected" ? stopVoiceChat : startVoiceChat}
                variant={conversation.status === "connected" ? "destructive" : "secondary"}
                size="icon"
                className={`flex-shrink-0 ${isMobile ? "h-10 w-10" : "h-10 w-10"} ${micPermission === 'denied' ? 'opacity-60' : ''}`}
                title={
                  micPermission === 'denied'
                    ? "Microphone blocked — tap to learn how to enable"
                    : conversation.status === "connected"
                      ? "End voice chat"
                      : "Start voice chat with Paige"
                }
              >
                {conversation.status === "connected" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Premium voice session UI — full-screen modal */}
      <VoiceSessionModal
        open={voiceModalOpen}
        status={voiceStatus}
        isMuted={voiceMuted}
        pageName={currentPageName}
        transcript={voiceTranscript}
        onToggleMute={toggleVoiceMute}
        onEndCall={stopVoiceChat}
      />
    </>
  );

  return createPortal(chatContent, document.body);
};

/**
 * v1.x SDK requires useConversation to live inside ConversationProvider.
 * This wrapper preserves the public API so existing imports keep working.
 */
export const FloatingChatbot = (props: { clientId?: string }) => (
  <ConversationProvider>
    <FloatingChatbotInner {...props} />
  </ConversationProvider>
);
