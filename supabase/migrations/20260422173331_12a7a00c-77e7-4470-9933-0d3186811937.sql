-- =========================================================
-- SUPPORT TICKETS
-- =========================================================

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START 1;

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL DEFAULT ('PT-' || LPAD(nextval('public.support_ticket_number_seq')::text, 5, '0')),
  user_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('billing','technical_issue','account_access','paige_question','credit_report','funding_question','broker_issue','general')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_on_client','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to UUID NULL,
  resolution_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_assigned_to ON public.support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff view all tickets"
  ON public.support_tickets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Users create own tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tickets"
  ON public.support_tickets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Staff update all tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- SUPPORT TICKET MESSAGES
-- =========================================================

CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client','support','system')),
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_ticket_messages_ticket_id ON public.support_ticket_messages(ticket_id);
CREATE INDEX idx_support_ticket_messages_created_at ON public.support_ticket_messages(created_at);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ticket messages (non-internal)"
  ON public.support_ticket_messages FOR SELECT
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff view all ticket messages"
  ON public.support_ticket_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Users post on own tickets"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_internal = false
    AND sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff post on any ticket"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

-- =========================================================
-- FEATURE REQUESTS
-- =========================================================

CREATE TABLE public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('credit_intelligence','funding','paige_ai','business_tools','broker_workspace','mobile','integrations','reporting','other')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','planned','in_progress','shipped','declined')),
  vote_count INTEGER NOT NULL DEFAULT 1,
  admin_response TEXT NULL,
  planned_release TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_requests_status ON public.feature_requests(status);
CREATE INDEX idx_feature_requests_vote_count ON public.feature_requests(vote_count DESC);
CREATE INDEX idx_feature_requests_created_at ON public.feature_requests(created_at DESC);
CREATE INDEX idx_feature_requests_user_id ON public.feature_requests(user_id);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view non-declined requests"
  ON public.feature_requests FOR SELECT
  TO authenticated
  USING (status <> 'declined' OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Users create own feature requests"
  ON public.feature_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own feature requests"
  ON public.feature_requests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Staff update all feature requests"
  ON public.feature_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE TRIGGER update_feature_requests_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- FEATURE REQUEST VOTES
-- =========================================================

CREATE TABLE public.feature_request_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feature_request_id, user_id)
);

CREATE INDEX idx_feature_request_votes_request_id ON public.feature_request_votes(feature_request_id);
CREATE INDEX idx_feature_request_votes_user_id ON public.feature_request_votes(user_id);

ALTER TABLE public.feature_request_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own votes"
  ON public.feature_request_votes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff view all votes"
  ON public.feature_request_votes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Users create own votes"
  ON public.feature_request_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own votes"
  ON public.feature_request_votes FOR DELETE
  USING (auth.uid() = user_id);

-- =========================================================
-- VOTE COUNT SYNC TRIGGER
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_feature_request_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feature_requests
    SET vote_count = vote_count + 1, updated_at = now()
    WHERE id = NEW.feature_request_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feature_requests
    SET vote_count = GREATEST(vote_count - 1, 0), updated_at = now()
    WHERE id = OLD.feature_request_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER feature_request_votes_sync
  AFTER INSERT OR DELETE ON public.feature_request_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_feature_request_vote_count();

-- =========================================================
-- AUTO-RESOLVED_AT WHEN STATUS=resolved
-- =========================================================

CREATE OR REPLACE FUNCTION public.set_ticket_resolved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('resolved','closed') AND OLD.status NOT IN ('resolved','closed') THEN
    NEW.resolved_at := now();
  ELSIF NEW.status NOT IN ('resolved','closed') AND OLD.status IN ('resolved','closed') THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_tickets_resolved_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_resolved_at();