-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding + metadata to client_memory
ALTER TABLE public.client_memory
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS client_memory_embedding_idx
  ON public.client_memory
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS client_memory_user_active_idx
  ON public.client_memory (client_user_id, is_active);

-- New table for chat message embeddings (kept separate from chat_messages to keep inserts fast)
CREATE TABLE IF NOT EXISTS public.chat_message_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  client_user_id uuid,
  session_id text,
  role text NOT NULL,
  content_excerpt text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_message_embeddings_user_idx
  ON public.chat_message_embeddings (user_id);

CREATE INDEX IF NOT EXISTS chat_message_embeddings_client_user_idx
  ON public.chat_message_embeddings (client_user_id);

CREATE INDEX IF NOT EXISTS chat_message_embeddings_vec_idx
  ON public.chat_message_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.chat_message_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own chat embeddings"
  ON public.chat_message_embeddings
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = client_user_id
         OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Service role can insert chat embeddings"
  ON public.chat_message_embeddings
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete chat embeddings"
  ON public.chat_message_embeddings
  FOR DELETE
  USING (auth.uid() = user_id
         OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Semantic search function
CREATE OR REPLACE FUNCTION public.match_paige_memory(
  _query_embedding vector(1536),
  _target_user_id uuid,
  _target_client_id uuid DEFAULT NULL,
  _match_threshold float DEFAULT 0.7,
  _memory_count int DEFAULT 5,
  _message_count int DEFAULT 5
)
RETURNS TABLE (
  source text,
  id uuid,
  memory_type text,
  content text,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: caller must be the owner, the linked client, an admin or a coach
  IF auth.uid() IS DISTINCT FROM _target_user_id
     AND auth.uid() IS DISTINCT FROM _target_client_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'coach'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  (
    SELECT
      'memory'::text AS source,
      cm.id,
      cm.memory_type,
      cm.content,
      1 - (cm.embedding <=> _query_embedding) AS similarity,
      cm.created_at
    FROM public.client_memory cm
    WHERE cm.is_active = true
      AND cm.embedding IS NOT NULL
      AND (
        cm.client_user_id = _target_user_id
        OR (_target_client_id IS NOT NULL AND cm.client_id = _target_client_id)
      )
      AND 1 - (cm.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY cm.embedding <=> _query_embedding
    LIMIT _memory_count
  )
  UNION ALL
  (
    SELECT
      'chat'::text AS source,
      ce.message_id AS id,
      ce.role AS memory_type,
      ce.content_excerpt AS content,
      1 - (ce.embedding <=> _query_embedding) AS similarity,
      ce.created_at
    FROM public.chat_message_embeddings ce
    WHERE ce.embedding IS NOT NULL
      AND (
        ce.user_id = _target_user_id
        OR (_target_client_id IS NOT NULL AND ce.client_user_id = _target_client_id)
      )
      AND 1 - (ce.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY ce.embedding <=> _query_embedding
    LIMIT _message_count
  );
END;
$$;