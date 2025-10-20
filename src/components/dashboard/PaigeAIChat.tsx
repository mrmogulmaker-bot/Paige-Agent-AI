import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AudioRecorder, encodeAudioForAPI, AudioQueue, createWavFromPCM } from "@/utils/VoiceAudio";

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
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const currentTranscriptRef = useRef<string>("");
  const lastCancelAtRef = useRef<number>(0);
  const lastCommitAtRef = useRef<number>(0);
  const cooldownUntilRef = useRef<number>(0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Voice chat functions
  const startVoiceChat = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      audioQueueRef.current = new AudioQueue(audioContextRef.current);
      
      const { data: { session } } = await supabase.auth.getSession();
      let wsUrl = `wss://bfmyebsjyuoecmjskqhs.functions.supabase.co/functions/v1/paige-voice-chat`;
      if (session?.access_token) {
        wsUrl += `?token=${session.access_token}`;
      }
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log("Voice chat connected");
        setIsVoiceActive(true);
        toast({
          title: "Voice chat started",
          description: "You can now speak with Paige",
        });
      };
      
      wsRef.current.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "response.audio.delta") {
          const binaryString = atob(data.delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          await audioQueueRef.current?.addToQueue(bytes);
          setIsSpeaking(true);
        } else if (data.type === "response.audio.done") {
          setIsSpeaking(false);
        } else if (data.type === "response.audio_transcript.delta") {
          currentTranscriptRef.current += data.delta;
        } else if (data.type === "response.audio_transcript.done") {
          if (currentTranscriptRef.current) {
            setMessages(prev => [...prev, {
              role: "assistant",
              content: currentTranscriptRef.current
            }]);
            currentTranscriptRef.current = "";
          }
        } else if (data.type === "conversation.item.input_audio_transcription.completed") {
          const transcript = data.transcript 
            || data.item?.content?.find((c: any) => c.type === 'input_text')?.text 
            || data.item?.transcript 
            || data.text;
          if (transcript) {
            setMessages(prev => [...prev, {
              role: "user",
              content: transcript
            }]);
          }
        } else if (data.type === "conversation.item.input_audio_transcription.failed") {
          console.warn("Transcription failed:", data);
          const errMsg = data?.error?.message || "";
          const isRateLimited = errMsg.includes("429") || data?.error?.code === 429;
          if (isRateLimited) {
            // brief backoff to avoid spamming STT
            cooldownUntilRef.current = Date.now() + 2000;
          }
          toast({
            title: isRateLimited ? "Rate limited" : "Couldn't hear you",
            description: isRateLimited
              ? "Too many transcription requests. Pause for a second and try again."
              : "No clear speech detected. Try speaking closer to the mic.",
            variant: "destructive",
          });
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
        } else if (data.type === "input_audio_buffer.speech_started") {
          setIsListening(true);
        } else if (data.type === "input_audio_buffer.speech_stopped") {
          setIsListening(false);
          // Using server VAD; avoid manual commit/response.create to prevent rate limits
        }
      };
      
      wsRef.current.onerror = () => {
        toast({
          title: "Connection error",
          description: "Failed to connect to voice chat",
          variant: "destructive",
        });
      };
      
      wsRef.current.onclose = () => {
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
          const nowCheck = Date.now();
          if (nowCheck < cooldownUntilRef.current) return; // backoff after 429
          if (rms <= 0.004) return; // gate low-signal frames to reduce noise-triggered turns
          const encoded = encodeAudioForAPI(audioData);
          wsRef.current.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: encoded
          }));
        }
      });
      
      await recorderRef.current.start();
      
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start voice chat",
        variant: "destructive",
      });
    }
  };
  
  const stopVoiceChat = () => {
    recorderRef.current?.stop();
    wsRef.current?.close();
    audioQueueRef.current?.clear();
    audioContextRef.current?.close();
    
    wsRef.current = null;
    recorderRef.current = null;
    audioContextRef.current = null;
    audioQueueRef.current = null;
    
    setIsVoiceActive(false);
    setIsSpeaking(false);
    setIsListening(false);
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
      stopVoiceChat();
    };
  }, []);

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
            {isVoiceActive && (
              <div className="flex items-center justify-center gap-2 text-sm">
                {isSpeaking && (
                  <div className="flex items-center gap-2 text-primary">
                    <Volume2 className="w-4 h-4 animate-pulse" />
                    <span>Paige is speaking...</span>
                  </div>
                )}
                {isListening && (
                  <div className="flex items-center gap-2 text-primary">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span>Listening...</span>
                  </div>
                )}
                {!isSpeaking && !isListening && (
                  <span className="text-muted-foreground">Ready to listen</span>
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
                disabled={isLoading || isVoiceActive}
              />
              <Button 
                onClick={handleSend} 
                disabled={isLoading || !input.trim() || isVoiceActive}
                className="bg-gradient-gold hover:opacity-90"
                size="icon"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            
            <Button
              onClick={isVoiceActive ? stopVoiceChat : startVoiceChat}
              variant={isVoiceActive ? "destructive" : "outline"}
              className="w-full"
            >
              {isVoiceActive ? (
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
