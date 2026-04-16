import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Mic, MicOff, Volume2, Paperclip } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import type { User, Session } from "@supabase/supabase-js";
import { useConversation } from "@11labs/react";
import { useChatDocumentUpload } from "@/hooks/useChatDocumentUpload";
import { usePaigeMemory } from "@/hooks/usePaigeMemory";
import { useClientChatContext } from "@/hooks/useClientChatContext";
import { DocumentAttachmentChip } from "@/components/chat/DocumentAttachmentChip";
import { DocumentMessageBubble } from "@/components/chat/DocumentMessageBubble";
import { SyncStatusPanel } from "@/components/chat/SyncStatusPanel";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";

type Message = {
  role: "user" | "assistant";
  content: string;
  documentFileName?: string;
  syncStatus?: any;
};

interface PaigeChatProps {
  user: User;
  session: Session | null;
  clientId?: string;
}

const quickActions = [
  { label: "My Credit Score", prompt: "Show me my credit factor breakdown" },
  { label: "Run Funding Match", prompt: "Run a funding match search for me" },
  { label: "Start a Dispute", prompt: "I need to dispute an item on my credit report" },
  { label: "What Should I Do Next?", prompt: "What's the highest impact action I should take right now?" },
];

export function PaigeChat({ user, session, clientId }: PaigeChatProps) {
  const { contextBlock, isLoading: contextLoading, hasCreditData } = useClientChatContext(clientId, clientId ? null : user.id);
  const contextInjectedRef = useRef(false);
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "What's good — I'm Paige, your AI credit strategist. Stop guessing. Let's look at the data. What do you want to hit today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // When context loads, send a context-aware opening via the AI
  useEffect(() => {
    if (contextInjectedRef.current || contextLoading || messages.length !== 1) return;
    if (!contextBlock) return;

    if (!hasCreditData) {
      contextInjectedRef.current = true;
      setMessages([
        {
          role: "assistant",
          content: "I don't see any credit data in your file yet. Upload your credit report and I will analyze it and give you a full picture of your credit situation.",
        },
      ]);
      return;
    }

    contextInjectedRef.current = true;
    (async () => {
      try {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (!freshSession) return;

        setIsLoading(true);
        const greetMessages = [{ role: "user" as const, content: "Give me a brief personalized greeting based on my client context. Don't repeat all my data — just acknowledge my situation warmly and ask what I want to work on today." }];

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshSession.access_token}` },
            body: JSON.stringify({
              messages: greetMessages,
              clientContext: contextBlock,
              ...(clientId ? { clientId } : {}),
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
  }, [clientId, contextBlock, contextLoading, hasCreditData, messages.length]);
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
  const conversation = useConversation({
    onConnect: () => { toast({ title: "Voice chat started", description: "You can now speak with Paige" }); },
    onDisconnect: () => { toast({ title: "Voice chat ended", description: "The conversation has been closed" }); },
    onMessage: (message) => {
      if (message.source === "ai") setMessages(prev => [...prev, { role: "assistant", content: message.message || "" }]);
      else if (message.source === "user") setMessages(prev => [...prev, { role: "user", content: message.message || "" }]);
    },
    onError: (error) => {
      console.error("ElevenLabs error:", error);
      const errorMsg = typeof error === 'string' ? error : "Failed to connect to voice chat";
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

  const startVoiceChat = async () => {
    try {
      // Check denied permission first to give clear guidance
      if (micPermission === 'denied') {
        toast({
          title: "Microphone Blocked",
          description: "Tap the lock icon in your browser's address bar to enable microphone access.",
          variant: "destructive",
        });
        return;
      }

      // Request mic permission — must be in gesture context (we're in a click handler, so this is fine)
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');

      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("elevenlabs-signed-url", {
        headers: { Authorization: `Bearer ${freshSession?.access_token}` },
      });
      if (error) throw error;

      const voiceSystemPrompt = contextBlock
        ? `You are Paige, the AI credit strategist for PaigeAgent.ai. You have full access to this client's credit file data. Use it to give specific, data-driven answers — never ask the client to share information you already have.\n\nCLIENT DATA:\n${contextBlock}\n\nRULES:\n- Reference specific scores, accounts, and amounts from the client data above\n- If the client has no credit data on file, say so clearly and direct them to upload a report\n- If the client asks about their scores, read them from the data\n- If they ask about utilization, calculate from the data\n- If there are active alerts, mention them proactively at the start\n- Never fabricate data — only reference what is in the client data above\n- Be conversational and concise (2-3 sentences per response)\n- Connect insights to their funding goals when relevant`
        : undefined;

      await conversation.startSession({
        signedUrl: data.signedUrl,
        ...(voiceSystemPrompt ? {
          overrides: {
            agent: {
              prompt: { prompt: voiceSystemPrompt },
              firstMessage: contextBlock
                ? hasCreditData
                  ? `Hey ${user.user_metadata?.full_name?.split(" ")[0] || "there"} — I've got your file pulled up. What do you want to work on?`
                  : "I don't see any credit data in your file yet. Upload your credit report and I will analyze it and give you a full picture of your credit situation."
                : undefined,
            },
          },
        } : {}),
      });
    } catch (err: any) {
      console.error("Error starting voice chat:", err);
      if (err?.name === "NotAllowedError" || err?.message?.includes("Permission")) {
        setMicPermission('denied');
        toast({
          title: "Microphone Access Required",
          description: isMobile
            ? "Please enable microphone in your browser settings. On iPhone: Settings > Safari > Microphone."
            : "Please allow microphone access when prompted.",
          variant: "destructive",
        });
      } else if (err?.name === "NotFoundError") {
        toast({
          title: "No Microphone Found",
          description: "Please connect a microphone and try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: "Failed to start voice chat. Please try again.", variant: "destructive" });
      }
    }
  };

  const stopVoiceChat = async () => {
    try { await conversation.endSession(); } catch (e) { console.warn("Error ending session", e); }
  };

  useEffect(() => {
    const handleFactoryReset = async () => {
      contextInjectedRef.current = false;
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

  const handleSend = async (overrideInput?: string) => {
    const messageText = overrideInput || input;
    if ((!messageText.trim() && !attachedDoc) || isLoading) return;

    resetInactivityTimer();

    const userMessage: Message = {
      role: "user",
      content: messageText.trim() || (attachedDoc ? `Analyze this document: ${attachedDoc.name}` : ""),
      documentFileName: attachedDoc?.name,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

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
        ...(contextBlock ? { clientContext: contextBlock } : {}),
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
            <h2 className="font-bold text-foreground text-sm">PaigeAgent.ai</h2>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">Your credit & funding strategist</p>
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
                <p className={`text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap ${message.role === "assistant" ? "text-foreground" : ""}`}>
                  {message.content}
                </p>
              )}
              {message.syncStatus && <SyncStatusPanel syncStatus={message.syncStatus} />}
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

      {/* Quick actions — horizontally scrollable on mobile */}
      <div className="px-3 sm:px-4 pb-1.5 sm:pb-2 flex-shrink-0">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleSend(action.prompt)}
              disabled={isLoading || conversation.status === "connected"}
              className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border border-border bg-background hover:bg-accent/10 hover:border-accent/40 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
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
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Type to Paige while talking..."
                className="flex-1 text-sm bg-muted/30 border-border/50"
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
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Or type to Paige..."
              className="flex-1 text-sm bg-muted/30 border-border/50 h-10"
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
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-9 sm:w-9 flex-shrink-0 text-muted-foreground hover:text-primary" onClick={openFilePicker} disabled={isLoading || conversation.status === "connected"} title="Attach credit report or financial document (PDF)">
            <Paperclip className="w-4 h-4" />
          </Button>
          {conversation.status !== "connected" && (
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={attachedDoc ? "Add a message or send document..." : "Ask Paige anything..."}
              className="flex-1 text-sm h-10"
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
    </div>
  );
}
