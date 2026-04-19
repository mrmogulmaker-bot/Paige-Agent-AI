DROP POLICY IF EXISTS "Service role can insert chat embeddings" ON public.chat_message_embeddings;

CREATE POLICY "Users can insert their own chat embeddings"
  ON public.chat_message_embeddings
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );