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
import { useConversation } from "@11labs/react";
import { useChatDocumentUpload } from "@/hooks/useChatDocumentUpload";
import { usePaigeMemory } from "@/hooks/usePaigeMemory";
import { useClientChatContext } from "@/hooks/useClientChatContext";
import { DocumentAttachmentChip } from "@/components/chat/DocumentAttachmentChip";
import { DocumentMessageBubble } from "@/components/chat/DocumentMessageBubble";
import { SyncStatusPanel } from "@/components/chat/SyncStatusPanel";
import { useQueryClient } from "@tanstack/react-query";

type Message = {
  role: "user" | "assistant";
  content: string;
  documentFileName?: string;
  syncStatus?: any;
};

export const FloatingChatbot = ({ clientId }: { clientId?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { contextBlock } = useClientChatContext(clientId, clientId ? null : currentUserId);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hey, how can I help?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get current user id for context
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
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

  const conversation = useConversation({
    onConnect: () => { toast({ title: "Voice chat started", description: "You can now speak with Paige" }); },
    onDisconnect: () => { toast({ title: "Voice chat ended", description: "The conversation has been closed" }); },
    onMessage: (message) => {
      if (message.source === "ai") setMessages(prev => [...prev, { role: "assistant", content: message.message || "" }]);
      else if (message.source === "user") setMessages(prev => [...prev, { role: "user", content: message.message || "" }]);
    },
    onError: (error) => {
      console.error("ElevenLabs error:", error);
      toast({ title: "Voice chat error", description: typeof error === 'string' ? error : "Failed to connect to voice chat", variant: "destructive" });
    },
  });

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
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("elevenlabs-signed-url", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;

      // Inject full client context so voice Paige has the same data as text Paige
      const voiceSystemPrompt = contextBlock
        ? `You are Paige, the AI credit strategist for PaigeAgent.ai. You have full access to this client's credit file data. Use it to give specific, data-driven answers — never ask the client to share information you already have.\n\nCLIENT DATA:\n${contextBlock}\n\nRULES:\n- Reference specific scores, accounts, and amounts from the client data above\n- If the client asks about their scores, read them from the data\n- If they ask about utilization, calculate from the data\n- If there are active alerts, mention them proactively at the start\n- Never fabricate data — only reference what is in the client data above\n- Be conversational and concise (2-3 sentences per response)\n- Connect insights to their funding goals when relevant`
        : undefined;

      await conversation.startSession({
        signedUrl: data.signedUrl,
        ...(voiceSystemPrompt ? {
          overrides: {
            agent: {
              prompt: { prompt: voiceSystemPrompt },
              firstMessage: "Hey — I've got your file pulled up. What do you want to work on?",
            },
          },
        } : {}),
      });
    } catch (err) {
      console.error("Error starting widget voice chat:", err);
      toast({ title: "Error", description: "Failed to start voice chat.", variant: "destructive" });
    }
  };

  const stopVoiceChat = async () => {
    try { await conversation.endSession(); } catch (e) { console.warn("Error ending session", e); }
  };

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

  const chatContent = (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-glow z-[9999]"
          variant="gold"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {isOpen && (
        <Card
          className={`fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-32px)] h-[min(600px,calc(100vh-48px))] shadow-glow z-[9999] flex flex-col relative ${isDragOver ? "ring-2 ring-primary" : ""}`}
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

          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src={paigeAvatar} alt="PaigeAgent.ai" className="w-8 h-8 rounded-full" />
              <div>
                <h3 className="font-semibold">PaigeAgent.ai</h3>
                <p className="text-xs text-muted-foreground">Your Credit Coach</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" && (
                    <img src={paigeAvatar} alt="PaigeAgent.ai" className="w-8 h-8 rounded-full flex-shrink-0" />
                  )}
                  <div className={`rounded-lg px-4 py-2 max-w-[80%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {message.documentFileName && <DocumentMessageBubble fileName={message.documentFileName} />}
                    {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
                    {message.syncStatus && <SyncStatusPanel syncStatus={message.syncStatus} />}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border flex-shrink-0">
            {conversation.status === "connected" && (
              <div className="mb-3 flex items-center justify-center gap-4 text-sm">
                {conversation.isSpeaking ? (
                  <div className="flex items-center gap-2 text-primary"><Volume2 className="h-4 w-4 animate-pulse" /><span>Speaking...</span></div>
                ) : (
                  <div className="flex items-center gap-2 text-primary"><div className="h-2 w-2 rounded-full bg-primary animate-pulse" /><span>Listening...</span></div>
                )}
              </div>
            )}

            {attachedDoc && (
              <div className="mb-2">
                <DocumentAttachmentChip fileName={attachedDoc.name} onRemove={removeAttachment} />
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-primary" onClick={openFilePicker} disabled={isLoading || conversation.status === "connected"} title="Attach PDF">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handleSend()} placeholder={attachedDoc ? "Add a message..." : "Ask me anything..."} disabled={isLoading || conversation.status === "connected"} />
              <Button onClick={handleSend} disabled={isLoading || (!input.trim() && !attachedDoc) || conversation.status === "connected"} size="icon">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
              <Button onClick={conversation.status === "connected" ? stopVoiceChat : startVoiceChat} variant={conversation.status === "connected" ? "destructive" : "secondary"} size="icon">
                {conversation.status === "connected" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );

  return createPortal(chatContent, document.body);
};
