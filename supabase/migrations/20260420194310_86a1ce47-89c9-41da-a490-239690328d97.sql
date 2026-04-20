-- Elite waitlist captures emails for the high-tier plan signup
CREATE TABLE public.elite_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  phone text,
  notes text,
  source text DEFAULT 'pricing_page',
  user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_elite_waitlist_email ON public.elite_waitlist(lower(email));
CREATE INDEX idx_elite_waitlist_status ON public.elite_waitlist(status);

ALTER TABLE public.elite_waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous visitors) may submit themselves to the waitlist
CREATE POLICY "Anyone can join elite waitlist"
ON public.elite_waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can view/manage
CREATE POLICY "Admins can view elite waitlist"
ON public.elite_waitlist
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update elite waitlist"
ON public.elite_waitlist
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete elite waitlist"
ON public.elite_waitlist
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_elite_waitlist_updated_at
BEFORE UPDATE ON public.elite_waitlist
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();