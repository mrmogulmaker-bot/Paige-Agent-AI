import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Mic, MicOff } from "lucide-react";
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
import { VoiceSessionModal, type VoiceModalStatus, type VoiceTranscriptEntry } from "@/components/voice/VoiceSessionModal";
import { EntityDiagramCard } from "@/components/chat/EntityDiagramCard";
import { extractEntityDiagram } from "@/lib/entityDiagram";
import { usePlaybook } from "@/lib/playbook";
import type { QuickChip } from "@/components/paige/commandCenterTypes";

type Message = { role: "user" | "assistant"; content: string };

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
}

const PaigeAIChatInner = ({
  hideHeader = false,
  fill = false,
  clientId = null,
  clientContext,
  focusBanner,
  chips,
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
      content: "Hey, how can I help?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const location = useLocation();
  const currentPageName = getCurrentPageName(location.pathname);

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

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

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

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ messages: newMessages, ...(clientId ? { clientId } : {}), ...(clientContext ? { clientContext } : {}), ...getUserClock() }),
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

      setIsLoading(false);
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      setMessages(messages);
      setIsLoading(false);
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
      <div className="flex flex-col h-full">
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

        <Card className="flex-1 flex flex-col bg-card border-border shadow-card overflow-hidden">
          {focusBanner}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
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
                    alt="PaigeAgent.ai"
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
                        {before && <p className="text-sm text-foreground whitespace-pre-wrap">{before}</p>}
                        {diagram && <EntityDiagramCard data={diagram} />}
                        {after && <p className="text-sm text-foreground whitespace-pre-wrap">{after}</p>}
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

          <div className="border-t border-border p-4 space-y-3">
            {visibleChips.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-0.5 -mb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleChips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleChip(chip)}
                    disabled={isLoading || conversation.status === "connected"}
                    className="shrink-0 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            {conversation.status === "connected" && (
              <div className="flex items-center justify-center gap-2 text-sm">
                {conversation.isSpeaking ? (
                  <div className="flex items-center gap-2 text-primary">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span>Paige is speaking...</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Listening...</span>
                )}
              </div>
            )}
            
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder={`Ask ${persona.name || "Paige"} anything…`}
                className="flex-1"
                disabled={isLoading || conversation.status === "connected"}
              />
              <Button 
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim() || conversation.status === "connected"}
                className="bg-gradient-gold hover:opacity-90"
                size="icon"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
        </Card>
      </div>

      {/* Premium voice session UI — full-screen modal with avatar, transcript, controls. */}
      <VoiceSessionModal
        open={voiceModalOpen}
        status={voiceStatus}
        isMuted={voiceMuted}
        pageName={currentPageName}
        transcript={voiceTranscript}
        onToggleMute={toggleVoiceMute}
        onEndCall={stopVoiceChat}
      />
    </div>
  );
};

export const PaigeAIChat = (props: PaigeAIChatProps = {}) => (
  <ConversationProvider>
    <PaigeAIChatInner {...props} />
  </ConversationProvider>
);
