import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { useVapi } from '@/hooks/useVapi';
import { cn } from '@/lib/utils';

export const VoiceInterface = () => {
  const {
    isConnected,
    isSpeaking,
    isListening,
    messages,
    startConversation,
    endConversation,
  } = useVapi();

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <Card className="p-6 space-y-4 w-80">
        {/* Status Indicators */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-3 h-3 rounded-full transition-colors",
              isConnected ? "bg-green-500 animate-pulse" : "bg-muted"
            )} />
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {isConnected && (
            <div className="flex items-center gap-2">
              {isSpeaking && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-xs text-muted-foreground">Speaking</span>
                </div>
              )}
              {isListening && (
                <div className="flex items-center gap-1">
                  <Mic className="w-4 h-4 text-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground">Listening</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div className="max-h-60 overflow-y-auto space-y-2">
            {messages.slice(-5).map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-2 rounded text-sm",
                  msg.type === 'user' && "bg-primary text-primary-foreground ml-8",
                  msg.type === 'assistant' && "bg-muted mr-8",
                  msg.type === 'function' && "bg-accent text-accent-foreground text-xs"
                )}
              >
                {msg.content && <p>{msg.content}</p>}
                {msg.functionCall && (
                  <p className="font-mono">
                    {msg.functionCall.name}({JSON.stringify(msg.functionCall.parameters)})
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {!isConnected ? (
            <Button
              size="lg"
              onClick={startConversation}
              className="rounded-full w-16 h-16"
            >
              <Phone className="w-6 h-6" />
            </Button>
          ) : (
            <Button
              size="lg"
              variant="destructive"
              onClick={endConversation}
              className="rounded-full w-16 h-16"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          {isConnected ? 'Tap to end call' : 'Tap to start voice conversation'}
        </p>
      </Card>
    </div>
  );
};
