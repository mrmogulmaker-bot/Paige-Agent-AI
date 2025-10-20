import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Mic, MicOff } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useConversation } from "@11labs/react";

type Message = { role: "user" | "assistant"; content: string };

export const PaigeAIChat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey, how can I help?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // ElevenLabs conversation hook
  const conversation = useConversation({
    overrides: {
      agent: {
        prompt: {
          prompt: `You are Paige, a concise and focused credit coaching assistant. Follow these rules strictly:
1. Keep responses brief - 2-3 sentences maximum by default
2. Ask clarifying questions before giving advice
3. When a topic requires detailed explanation, ALWAYS ask first: "Do you have a moment for me to explain everything about [topic]?" or similar
4. Only provide detailed explanations AFTER the user confirms they want to hear more
5. Be direct and to the point
6. Guide users through questions rather than lectures
7. Never assume the user wants a long explanation - always check first

Your goal is conversation, not monologue. Be helpful but concise. Respect the user's time by asking before diving into lengthy explanations.`
        }
      }
    },
    onConnect: () => {
      console.log("ElevenLabs connected - conversation ready");
      toast({
        title: "Voice chat started",
        description: "You can now speak with Paige",
      });
    },
    onDisconnect: () => {
      console.log("ElevenLabs disconnected");
      toast({
        title: "Voice chat ended",
        description: "The conversation has been closed",
      });
    },
    onMessage: (message) => {
      console.log("Received message:", message);
      
      // ElevenLabs message format: { message: string, source: 'user' | 'ai' }
      if (message.source === "ai") {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: message.message || ""
        }]);
      } else if (message.source === "user") {
        setMessages(prev => [...prev, {
          role: "user",
          content: message.message || ""
        }]);
      }
    },
    onError: (error) => {
      console.error("ElevenLabs error:", error);
      toast({
        title: "Voice chat error",
        description: typeof error === 'string' ? error : "Failed to connect to voice chat",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Voice chat functions
  const startVoiceChat = async () => {
    try {
      console.log("Starting voice chat...");
      
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted");
      
      // Get signed URL from backend
      const { data: { session } } = await supabase.auth.getSession();
      console.log("Got session, invoking elevenlabs-signed-url...");
      
      const { data, error } = await supabase.functions.invoke("elevenlabs-signed-url", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }
      
      console.log("Got signed URL, starting session...");
      console.log("Using ElevenLabs Agent ID:", data.agentId);

      // Start conversation with signed URL
      await conversation.startSession({
        signedUrl: data.signedUrl
      });

      console.log("Voice chat started successfully");

    } catch (error) {
      console.error("Error starting voice chat:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start voice chat",
        variant: "destructive",
      });
    }
  };
  
  const stopVoiceChat = async () => {
    await conversation.endSession();
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
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
          body: JSON.stringify({ messages: newMessages }),
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

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)]">
      <div className="flex flex-col h-full">
        <div className="mb-6">
          <h2 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Chat with PaigeAgent.ai
          </h2>
          <p className="text-muted-foreground mt-2">
            Your personal credit coaching assistant
          </p>
        </div>

        <Card className="flex-1 flex flex-col bg-card border-border shadow-card overflow-hidden">
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
                  <p className={`text-sm ${message.role === "assistant" ? "text-foreground" : ""}`}>
                    {message.content}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-4 space-y-3">
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
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask Paige about your credit journey..."
                className="flex-1"
                disabled={isLoading || conversation.status === "connected"}
              />
              <Button 
                onClick={handleSend} 
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
    </div>
  );
};
