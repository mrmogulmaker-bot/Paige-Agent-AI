-- Create chat_messages table to store Paige AI conversation history
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  audio_transcript TEXT,
  function_call JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can view own messages
CREATE POLICY "Users can view own chat messages"
  ON public.chat_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all messages
CREATE POLICY "Service role can manage chat messages"
  ON public.chat_messages
  FOR ALL
  USING (current_setting('role') = 'service_role');

-- Create index for efficient queries
CREATE INDEX idx_chat_messages_user_session ON public.chat_messages(user_id, session_id, created_at DESC);
CREATE INDEX idx_chat_messages_user_recent ON public.chat_messages(user_id, created_at DESC);