
CREATE TABLE public.funding_secured (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_user_id UUID NOT NULL,
  date_secured DATE NOT NULL DEFAULT CURRENT_DATE,
  lender_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest_rate NUMERIC(5,2),
  factor_rate NUMERIC(5,4),
  term_length_months INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funding_secured ENABLE ROW LEVEL SECURITY;

-- Admins and coaches can do everything
CREATE POLICY "Admins can manage all funding_secured"
  ON public.funding_secured FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can manage funding_secured"
  ON public.funding_secured FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'coach'::app_role));

-- Clients can view their own records
CREATE POLICY "Clients can view own funding_secured"
  ON public.funding_secured FOR SELECT
  TO authenticated
  USING (client_user_id = auth.uid());

CREATE TRIGGER update_funding_secured_updated_at
  BEFORE UPDATE ON public.funding_secured
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.funding_secured;
