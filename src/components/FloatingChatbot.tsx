import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X, Send, Loader2, Paperclip, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parsePaigeChatError } from "@/lib/paigeChatError";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { DictationMicButton } from "@/components/voice/DictationMicButton";
import { appendDictation } from "@/lib/voice/useDictation";
import { useChatDocumentUpload } from "@/hooks/useChatDocumentUpload";
import { usePaigeMemory } from "@/hooks/usePaigeMemory";
import { useClientChatContext } from "@/hooks/useClientChatContext";
import { DocumentAttachmentChip } from "@/components/chat/DocumentAttachmentChip";
import { DocumentMessageBubble } from "@/components/chat/DocumentMessageBubble";
import { SyncStatusPanel, type SyncStatus } from "@/components/chat/SyncStatusPanel";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { EntityDiagramCard } from "@/components/chat/EntityDiagramCard";
import { extractEntityDiagram } from "@/lib/entityDiagram";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { getUserClock } from "@/lib/userClock";

type Message = {
  role: "user" | "assistant";
  content: string;
  documentFileName?: string;
  syncStatus?: SyncStatus;
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

  useEffect(() => {
    const handleFactoryReset = () => {
      resetSession();
      setInput("");
      setMessages([
        {
          role: "assistant",
          content: "I don't have any of your workspace data yet. Connect your workspace and I'll get up to speed so I can help you run your business.",
        },
      ]);
    };

    window.addEventListener("paige-factory-reset", handleFactoryReset);
    return () => window.removeEventListener("paige-factory-reset", handleFactoryReset);
  }, [resetSession]);

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

      const payload: Record<string, unknown> = {
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

      if (!response.ok) {
        // #587 — show the structured { code, reason, recommendation } (e.g. a size/page limit) rather
        // than a generic outage toast. Roll back the just-added user message like the catch below.
        const chatErr = await parsePaigeChatError(response);
        toast({ title: chatErr.title, description: chatErr.description, variant: "destructive" });
        setMessages((prev) => prev.slice(0, -1));
        setIsLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let syncStatus: SyncStatus | null = null;

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
            queryClient.invalidateQueries({ queryKey: ["three-fundability-inputs"] });
            queryClient.invalidateQueries({ queryKey: ["funding-readiness-supplemental"] });
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  // §66 ruling — FAB hidden on admin routes. Coach-lens Paige lives inside
  // ContactPaigePanel on contact detail pages; no persistent floating widget
  // on admin surface. Also hide on mobile /app, where AppShell renders the
  // full-screen PaigeChat as the primary surface — a second FAB on top of it
  // would stack duplicate chat entries (finding 895fa35c).
  const hideChatbot =
    location.pathname.startsWith("/admin") ||
    (isMobile && location.pathname === "/app");

  // --- Draggable floating button + tuck-to-edge "pocket" mode ---
  // Persisted across reloads so the user's chosen spot sticks.
  const POS_KEY = "paige-fab-pos-v1";
  const POCKET_KEY = "paige-fab-pocket-v1";
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [pocketed, setPocketed] = useState<boolean>(() => {
    try { return localStorage.getItem(POCKET_KEY) === "1"; } catch { return false; }
  });
  const dragStateRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const clampPos = (x: number, y: number, size = 56) => {
    const pad = 8;
    const maxX = window.innerWidth - size - pad;
    const maxY = window.innerHeight - size - pad;
    return { x: Math.max(pad, Math.min(maxX, x)), y: Math.max(pad, Math.min(maxY, y)) };
  };

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    dragStateRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: rect.left, origY: rect.top, moved: false,
    };
    target.setPointerCapture(e.pointerId);
  };
  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && Math.hypot(dx, dy) < 5) return;
    ds.moved = true;
    const next = clampPos(ds.origX + dx, ds.origY + dy);
    setFabPos(next);
  };
  const onFabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragStateRef.current;
    dragStateRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (ds?.moved && fabPos) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(fabPos)); } catch { /* ignore */ }
      return; // treat as drag, not click
    }
    // treat as click → open
    setIsOpen(true);
  };

  const togglePocket = () => {
    setPocketed((p) => {
      const next = !p;
      try { localStorage.setItem(POCKET_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const fabStyle: React.CSSProperties = fabPos
    ? { left: fabPos.x, top: fabPos.y, right: "auto", bottom: "auto" }
    : {};

  const chatContent = (
    <>
      {!isOpen && !hideChatbot && !pocketed && (
        <div className="fixed z-[9999]" style={fabPos ? fabStyle : { right: 24, bottom: 24 }}>
          <Button
            onPointerDown={onFabPointerDown}
            onPointerMove={onFabPointerMove}
            onPointerUp={onFabPointerUp}
            className="h-14 w-14 rounded-full shadow-glow touch-none cursor-grab active:cursor-grabbing"
            variant="gold"
            size="icon"
            title="Drag to move • Click to open"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
          <button
            onClick={togglePocket}
            className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-background border border-border shadow flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="Tuck to side"
            aria-label="Tuck Paige to side"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!isOpen && !hideChatbot && pocketed && (
        <button
          onClick={togglePocket}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] h-16 w-6 rounded-l-md bg-primary text-primary-foreground shadow-glow flex items-center justify-center hover:w-7 transition-all"
          title="Bring Paige back"
          aria-label="Restore Paige chat"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
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
                <p className="text-[10px] sm:text-xs text-muted-foreground">Your AI Business Partner</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
            {attachedDoc && (
              <div className="mb-2">
                <DocumentAttachmentChip fileName={attachedDoc.name} onRemove={removeAttachment} />
              </div>
            )}

            <div className="flex gap-1.5 sm:gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-primary" onClick={openFilePicker} disabled={isLoading} title="Attach PDF">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder={attachedDoc ? "Add a message..." : "Ask me anything..."}
                disabled={isLoading}
                className="h-10"
              />
              {/* Hold-to-dictate — neutral/indigo mic (never gold; Send owns the act, §11). */}
              <DictationMicButton
                onText={(seg) => setInput((prev) => appendDictation(prev, seg))}
                onError={(msg) => toast({ title: "Voice typing", description: msg, variant: "destructive" })}
                disabled={isLoading}
                variant="secondary"
                className="h-10 w-10 flex-shrink-0"
              />
              <Button onClick={handleSend} disabled={isLoading || (!input.trim() && !attachedDoc)} size="icon" className="h-10 w-10">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );

  return createPortal(chatContent, document.body);
};

export const FloatingChatbot = (props: { clientId?: string }) => (
  <FloatingChatbotInner {...props} />
);
