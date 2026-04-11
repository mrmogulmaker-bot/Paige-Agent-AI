import { useState, useRef, useEffect } from "react";
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
import { DocumentAttachmentChip } from "@/components/chat/DocumentAttachmentChip";
import { DocumentMessageBubble } from "@/components/chat/DocumentMessageBubble";

type Message = {
  role: "user" | "assistant";
  content: string;
  documentFileName?: string;
};

export const FloatingChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hey, how can I help?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
    onConnect: () => {
      toast({ title: "Voice chat started", description: "You can now speak with Paige" });
    },
    onDisconnect: () => {
      toast({ title: "Voice chat ended", description: "The conversation has been closed" });
    },
    onMessage: (message) => {
      if (message.source === "ai") {
        setMessages(prev => [...prev, { role: "assistant", content: message.message || "" }]);
      } else if (message.source === "user") {
        setMessages(prev => [...prev, { role: "user", content: message.message || "" }]);
      }
    },
    onError: (error) => {
      console.error("ElevenLabs error:", error);
      toast({ title: "Voice chat error", description: typeof error === 'string' ? error : "Failed to connect to voice chat", variant: "destructive" });
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startVoiceChat = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("elevenlabs-signed-url", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      await conversation.startSession({ signedUrl: data.signedUrl });
    } catch (err) {
      console.error("Error starting widget voice chat:", err);
      toast({ title: "Error", description: "Failed to start voice chat.", variant: "destructive" });
    }
  };

  const stopVoiceChat = async () => {
    try {
      await conversation.endSession();
    } catch (e) {
      console.warn("Error ending session (ignored)", e);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedDoc) || isLoading) return;

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
            Authorization: `Bearer ${session?.access_token}`,
          },
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
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { role: "assistant", content: assistantMessage };
                  return newMessages;
                });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-glow z-50"
          variant="gold"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {isOpen && (
        <Card
          className={`fixed bottom-6 right-6 w-96 h-[500px] shadow-glow z-50 flex flex-col relative ${isDragOver ? "ring-2 ring-primary" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 bg-primary/10 z-10 flex items-center justify-center rounded-xl pointer-events-none">
              <p className="text-sm font-medium text-primary">Drop PDF here</p>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <img src={paigeAvatar} alt="PaigeAgent.ai" className="w-8 h-8 rounded-full" />
              <div>
                <h3 className="font-semibold">PaigeAgent.ai</h3>
                <p className="text-xs text-muted-foreground">Your Credit Coach</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <img src={paigeAvatar} alt="PaigeAgent.ai" className="w-8 h-8 rounded-full flex-shrink-0" />
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {message.documentFileName && (
                      <DocumentMessageBubble fileName={message.documentFileName} />
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border">
            {conversation.status === "connected" && (
              <div className="mb-3 flex items-center justify-center gap-4 text-sm">
                {conversation.isSpeaking ? (
                  <div className="flex items-center gap-2 text-primary">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <span>Speaking...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-primary">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span>Listening...</span>
                  </div>
                )}
              </div>
            )}

            {attachedDoc && (
              <div className="mb-2">
                <DocumentAttachmentChip fileName={attachedDoc.name} onRemove={removeAttachment} />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-primary"
                onClick={openFilePicker}
                disabled={isLoading || conversation.status === "connected"}
                title="Attach PDF"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder={attachedDoc ? "Add a message..." : "Ask me anything..."}
                disabled={isLoading || conversation.status === "connected"}
              />
              <Button
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && !attachedDoc) || conversation.status === "connected"}
                size="icon"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
              <Button
                onClick={conversation.status === "connected" ? stopVoiceChat : startVoiceChat}
                variant={conversation.status === "connected" ? "destructive" : "secondary"}
                size="icon"
              >
                {conversation.status === "connected" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
};
