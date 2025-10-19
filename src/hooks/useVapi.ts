import { useState, useEffect, useCallback, useRef } from 'react';
import Vapi from '@vapi-ai/web';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface VapiMessage {
  type: string;
  content?: string;
  functionCall?: {
    name: string;
    parameters: Record<string, any>;
  };
}

export const useVapi = () => {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VapiMessage[]>([]);
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY;
    if (!VAPI_PUBLIC_KEY) {
      console.error('VAPI_PUBLIC_KEY not configured');
      return;
    }

    vapiRef.current = new Vapi(VAPI_PUBLIC_KEY);

    // Set up event listeners
    vapiRef.current.on('call-start', () => {
      console.log('Call started');
      setIsConnected(true);
      toast({
        title: 'Connected',
        description: 'Voice session started',
      });
    });

    vapiRef.current.on('call-end', () => {
      console.log('Call ended');
      setIsConnected(false);
      setIsSpeaking(false);
      setIsListening(false);
      toast({
        title: 'Disconnected',
        description: 'Voice session ended',
      });
    });

    vapiRef.current.on('speech-start', () => {
      console.log('Assistant speaking');
      setIsSpeaking(true);
      setIsListening(false);
    });

    vapiRef.current.on('speech-end', () => {
      console.log('Assistant stopped speaking');
      setIsSpeaking(false);
    });

    vapiRef.current.on('volume-level', (level: number) => {
      if (level > 0.01) {
        setIsListening(true);
      } else {
        setIsListening(false);
      }
    });

    vapiRef.current.on('message', (message: any) => {
      console.log('Vapi message:', message);
      
      if (message.type === 'transcript') {
        setMessages(prev => [...prev, {
          type: message.role,
          content: message.transcript,
        }]);
      }

      if (message.type === 'function-call') {
        setMessages(prev => [...prev, {
          type: 'function',
          functionCall: {
            name: message.functionCall.name,
            parameters: message.functionCall.parameters,
          },
        }]);
      }
    });

    vapiRef.current.on('error', (error: any) => {
      console.error('Vapi error:', error);
      toast({
        title: 'Error',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    });

    return () => {
      vapiRef.current?.stop();
    };
  }, [toast]);

  const startConversation = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Create Vapi assistant
      const { data, error } = await supabase.functions.invoke('vapi-create-session', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      setAssistantId(data.assistantId);

      // Start the call
      await vapiRef.current?.start(data.assistantId);

    } catch (error: any) {
      console.error('Error starting conversation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start conversation',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const endConversation = useCallback(() => {
    vapiRef.current?.stop();
    setMessages([]);
    setAssistantId(null);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!vapiRef.current) return;
    vapiRef.current.send({
      type: 'add-message',
      message: {
        role: 'user',
        content: text,
      },
    });
  }, []);

  return {
    isConnected,
    isSpeaking,
    isListening,
    messages,
    startConversation,
    endConversation,
    sendMessage,
  };
};
