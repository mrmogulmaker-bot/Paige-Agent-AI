-- Create client_memory table
CREATE TABLE public.client_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id UUID NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('report_upload', 'milestone_completed', 'dispute_generated', 'funding_secured', 'lender_researched', 'session_summary', 'coach_note')),
  content TEXT NOT NULL,
  source_session_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_client_memory_user_active ON public.client_memory (client_user_id, is_active, created_at DESC);

-- Enable RLS
ALTER TABLE public.client_memory ENABLE ROW LEVEL SECURITY;

-- Users can read their own memory
CREATE POLICY "Users can view their own memory"
ON public.client_memory FOR SELECT
TO authenticated
USING (auth.uid() = client_user_id);

-- Admins full access
CREATE POLICY "Admins have full access to client_memory"
ON public.client_memory FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Coaches can view their assigned clients' memory
CREATE POLICY "Coaches can view assigned client memory"
ON public.client_memory FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_user_id = auth.uid()
      AND client_user_id = client_memory.client_user_id
      AND status = 'active'
  )
);

-- Coaches can insert memory for assigned clients
CREATE POLICY "Coaches can insert memory for assigned clients"
ON public.client_memory FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_user_id = auth.uid()
      AND client_user_id = client_memory.client_user_id
      AND status = 'active'
  )
);

-- Coaches can update (deactivate) memory for assigned clients
CREATE POLICY "Coaches can update assigned client memory"
ON public.client_memory FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_user_id = auth.uid()
      AND client_user_id = client_memory.client_user_id
      AND status = 'active'
  )
);

-- Timestamp trigger
CREATE TRIGGER update_client_memory_updated_at
BEFORE UPDATE ON public.client_memory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();