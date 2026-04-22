-- Track when a user last viewed a support ticket
CREATE TABLE IF NOT EXISTS public.support_ticket_last_seen (
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

ALTER TABLE public.support_ticket_last_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own last_seen rows"
ON public.support_ticket_last_seen
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and coaches can read all last_seen rows"
ON public.support_ticket_last_seen
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'coach'::public.app_role)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_last_seen_user
  ON public.support_ticket_last_seen(user_id);