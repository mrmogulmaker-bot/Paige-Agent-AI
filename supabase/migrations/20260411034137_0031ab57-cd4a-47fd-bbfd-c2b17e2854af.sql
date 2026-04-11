CREATE TABLE public.manual_banking_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  avg_monthly_revenue NUMERIC DEFAULT 0,
  avg_daily_balance NUMERIC DEFAULT 0,
  monthly_nsf_count INTEGER DEFAULT 0,
  accounts_separated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.manual_banking_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own manual banking entries"
ON public.manual_banking_entries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own manual banking entries"
ON public.manual_banking_entries FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own manual banking entries"
ON public.manual_banking_entries FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own manual banking entries"
ON public.manual_banking_entries FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all manual banking entries"
ON public.manual_banking_entries FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view client manual banking entries"
ON public.manual_banking_entries FOR SELECT
USING (public.has_role(auth.uid(), 'coach'));

CREATE TRIGGER update_manual_banking_entries_updated_at
BEFORE UPDATE ON public.manual_banking_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();