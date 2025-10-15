import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { AudioRecorder, encodeAudioForAPI, AudioQueue, createWavFromPCM } from "@/utils/VoiceAudio";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export const FloatingChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey, how can I help?"
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const lastCancelAtRef = useRef<number>(0);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startVoiceChat = async () => {
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      audioQueueRef.current = new AudioQueue(audioContextRef.current);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const wsUrl = `wss://${projectId}.supabase.co/functions/v1/paige-voice-chat`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('Voice chat WebSocket connected');
        setIsVoiceActive(true);
      };

      wsRef.current.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data.type);

        if (data.type === 'response.audio.delta' && data.delta) {
          setIsSpeaking(true);
          const binaryString = atob(data.delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          await audioQueueRef.current?.addToQueue(bytes);
        } else if (data.type === 'response.audio.done') {
          setIsSpeaking(false);
        } else if (data.type === 'response.audio_transcript.delta') {
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.content += data.delta;
            } else {
              newMessages.push({ role: 'assistant', content: data.delta });
            }
            return newMessages;
          });
        } else if (data.type === 'conversation.item.input_audio_transcription.completed') {
          setMessages(prev => [...prev, { role: 'user', content: data.transcript }]);
        } else if (data.type === 'response.function_call_arguments.done') {
          console.log('Function executed:', data.name, data.arguments);
          try {
            const result = JSON.parse(data.arguments);
            
            if (data.name === 'navigate_to' && result.path) {
              window.location.href = result.path;
            }
            
            if (result.success && result.message) {
              toast({
                title: "Action Complete",
                description: result.message,
              });
            }
          } catch (e) {
            console.error('Error parsing function result:', e);
          }
        } else if (data.type === 'input_audio_buffer.speech_started') {
          setIsListening(true);
        } else if (data.type === 'input_audio_buffer.speech_stopped') {
          setIsListening(false);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: "Connection Error",
          description: "Failed to connect to voice chat",
          variant: "destructive",
        });
      };

      wsRef.current.onclose = () => {
        console.log('Voice chat WebSocket closed');
        setIsVoiceActive(false);
        setIsSpeaking(false);
        setIsListening(false);
      };

      recorderRef.current = new AudioRecorder((audioData) => {
        // Compute RMS to detect when the user starts speaking (barge-in detection)
        let sumSquares = 0;
        for (let i = 0; i < audioData.length; i++) sumSquares += audioData[i] * audioData[i];
        const rms = Math.sqrt(sumSquares / audioData.length);

        // If AI is speaking and the user starts talking, cancel current response immediately
        if (isSpeaking && rms > 0.02) {
          const now = Date.now();
          if (wsRef.current?.readyState === WebSocket.OPEN && now - lastCancelAtRef.current > 800) {
            console.log('Barge-in detected: cancelling current response');
            wsRef.current.send(JSON.stringify({ type: 'response.cancel' }));
            audioQueueRef.current?.clear();
            setIsSpeaking(false);
            lastCancelAtRef.current = now;
          }
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const encoded = encodeAudioForAPI(audioData);
          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: encoded
          }));
        }
      });

      await recorderRef.current.start();
    } catch (error) {
      console.error('Error starting voice chat:', error);
      toast({
        title: "Error",
        description: "Failed to start voice chat. Please check microphone permissions.",
        variant: "destructive",
      });
    }
  };

  const stopVoiceChat = () => {
    recorderRef.current?.stop();
    wsRef.current?.close();
    audioQueueRef.current?.clear();
    audioContextRef.current?.close();
    
    recorderRef.current = null;
    wsRef.current = null;
    audioQueueRef.current = null;
    audioContextRef.current = null;
    
    setIsVoiceActive(false);
    setIsSpeaking(false);
    setIsListening(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage],
          }),
        }
      );

      if (response.status === 429) {
        toast({
          title: "Rate limit exceeded",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

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
                  newMessages[newMessages.length - 1] = {
                    role: "assistant",
                    content: assistantMessage,
                  };
                  return newMessages;
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
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

      {/* Chat window */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-96 h-[500px] shadow-glow z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <img src={paigeAvatar} alt="PaigeAgent.ai" className="w-8 h-8 rounded-full" />
              <div>
                <h3 className="font-semibold">PaigeAgent.ai</h3>
                <p className="text-xs text-muted-foreground">Your Financial Coach</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <img
                      src={paigeAvatar}
                      alt="PaigeAgent.ai"
                      className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border">
            {isVoiceActive && (
              <div className="mb-3 flex items-center justify-center gap-4 text-sm">
                {isSpeaking && (
                  <div className="flex items-center gap-2 text-primary">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <span>Speaking...</span>
                  </div>
                )}
                {isListening && (
                  <div className="flex items-center gap-2 text-primary">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span>Listening...</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask me anything..."
                disabled={isLoading || isVoiceActive}
              />
              <Button
                onClick={handleSend}
                disabled={isLoading || !input.trim() || isVoiceActive}
                size="icon"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={isVoiceActive ? stopVoiceChat : startVoiceChat}
                variant={isVoiceActive ? "destructive" : "secondary"}
                size="icon"
              >
                {isVoiceActive ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
};
