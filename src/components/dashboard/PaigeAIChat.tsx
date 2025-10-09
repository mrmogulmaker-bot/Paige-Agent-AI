import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";

export const PaigeAIChat = () => {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I'm Paige, your AI credit coach. I'm here to guide you through your credit repair and building journey. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    
    setMessages([...messages, { role: "user", content: input }]);
    setInput("");
    
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I understand you're asking about your credit journey. While I'm currently in demo mode, I'm being built to provide personalized guidance on credit repair, dispute strategies, and fundability optimization. Soon I'll be able to analyze your specific situation and provide actionable advice!",
        },
      ]);
    }, 1000);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)]">
      <div className="flex flex-col h-full">
        <div className="mb-6">
          <h2 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Chat with Paige AI
          </h2>
          <p className="text-muted-foreground mt-2">
            Your personal credit coaching assistant
          </p>
        </div>

        <Card className="flex-1 flex flex-col bg-card border-border shadow-card overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                    alt="Paige AI"
                    className="w-10 h-10 rounded-full border-2 border-primary"
                  />
                )}
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary"
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask Paige about your credit journey..."
                className="flex-1"
              />
              <Button onClick={handleSend} variant="gold" size="icon">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
