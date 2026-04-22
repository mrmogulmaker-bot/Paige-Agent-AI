-- Phase 3 broker workspace: personalization + private session messages

-- 1. Broker personalization columns
ALTER TABLE public.broker_profiles
  ADD COLUMN IF NOT EXISTS specializations text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS typical_client_profile text,
  ADD COLUMN IF NOT EXISTS preferred_greeting text DEFAULT 'first_name',
  ADD COLUMN IF NOT EXISTS firm_description text,
  ADD COLUMN IF NOT EXISTS paige_context_notes text;

ALTER TABLE public.broker_profiles
  DROP CONSTRAINT IF EXISTS broker_profiles_preferred_greeting_check;
ALTER TABLE public.broker_profiles
  ADD CONSTRAINT broker_profiles_preferred_greeting_check
  CHECK (preferred_greeting IN ('first_name','full_name','title_last_name'));

-- 2. Broker-client relationship enrichment
ALTER TABLE public.broker_client_relationships
  ADD COLUMN IF NOT EXISTS broker_notes text,
  ADD COLUMN IF NOT EXISTS relationship_stage text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS shared_goal text,
  ADD COLUMN IF NOT EXISTS last_session_summary text,
  ADD COLUMN IF NOT EXISTS last_session_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.broker_client_relationships
  DROP CONSTRAINT IF EXISTS broker_client_relationships_relationship_stage_check;
ALTER TABLE public.broker_client_relationships
  ADD CONSTRAINT broker_client_relationships_relationship_stage_check
  CHECK (relationship_stage IN ('new','active','monitoring','completed'));

-- 3. broker_session_messages table (turn-by-turn)
CREATE TABLE IF NOT EXISTS public.broker_session_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.broker_paige_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('broker','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_session_messages_session
  ON public.broker_session_messages(session_id, created_at);

ALTER TABLE public.broker_session_messages ENABLE ROW LEVEL SECURITY;

-- Brokers may read messages for sessions belonging to their broker_profile
DROP POLICY IF EXISTS "Brokers read own session messages" ON public.broker_session_messages;
CREATE POLICY "Brokers read own session messages"
  ON public.broker_session_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.broker_paige_sessions s
      JOIN public.broker_profiles bp ON bp.id = s.broker_id
      WHERE s.id = broker_session_messages.session_id
        AND bp.user_id = auth.uid()
    )
  );

-- Brokers may write messages into their own sessions
DROP POLICY IF EXISTS "Brokers insert own session messages" ON public.broker_session_messages;
CREATE POLICY "Brokers insert own session messages"
  ON public.broker_session_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.broker_paige_sessions s
      JOIN public.broker_profiles bp ON bp.id = s.broker_id
      WHERE s.id = broker_session_messages.session_id
        AND bp.user_id = auth.uid()
    )
  );

-- Admins read all
DROP POLICY IF EXISTS "Admins read all broker session messages" ON public.broker_session_messages;
CREATE POLICY "Admins read all broker session messages"
  ON public.broker_session_messages
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role full access (edge functions)
DROP POLICY IF EXISTS "Service role manages broker session messages" ON public.broker_session_messages;
CREATE POLICY "Service role manages broker session messages"
  ON public.broker_session_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');