import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Mic, MicOff } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import type { User, Session } from "@supabase/supabase-js";

type Message = { role: "user" | "assistant"; content: string };

interface PaigeChatProps {
  user: User;
  session: Session | null;
}

const quickActions = [
  { label: "My Credit Score", prompt: "Show me my credit factor breakdown" },
  { label: "Run Funding Match", prompt: "Run a funding match search for me" },
  { label: "Start a Dispute", prompt: "I need to dispute an item on my credit report" },
  { label: "What Should I Do Next?", prompt: "What's the highest impact action I should take right now?" },
];

export function PaigeChat({ user, session }: PaigeChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "What's good — I'm Paige, your AI credit strategist. Stop guessing. Let's look at the data. What do you want to hit today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (overrideInput?: string) => {
    const messageText = overrideInput || input;
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: messageText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Always get a fresh session to handle token refresh
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      
      if (!freshSession) {
        toast({
          title: "Session Expired",
          description: "Your session has expired. Please sign in again.",
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

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <img src={paigeAvatar} alt="Paige" className="w-9 h-9 rounded-full border-2 border-accent" />
          <div>
            <h2 className="font-bold text-foreground text-sm">PaigeAgent.ai</h2>
            <p className="text-[11px] text-muted-foreground">Your credit & funding strategist</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {message.role === "assistant" && (
              <img src={paigeAvatar} alt="Paige" className="w-8 h-8 rounded-full border border-accent flex-shrink-0" />
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${
                message.role === "user"
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted/40 border border-border"
              }`}
            >
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${message.role === "assistant" ? "text-foreground" : ""}`}>
                {message.content}
              </p>
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3">
            <img src={paigeAvatar} alt="Paige" className="w-8 h-8 rounded-full border border-accent flex-shrink-0" />
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

      {/* Quick actions */}
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleSend(action.prompt)}
              disabled={isLoading}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-background hover:bg-accent/10 hover:border-accent/40 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask Paige anything..."
            className="flex-1 text-sm"
            disabled={isLoading}
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
    </div>
  );
}
