
-- Add bureau score columns to businesses table
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS dnb_paydex integer,
  ADD COLUMN IF NOT EXISTS dnb_delinquency_predictor integer,
  ADD COLUMN IF NOT EXISTS dnb_failure_score integer,
  ADD COLUMN IF NOT EXISTS dnb_duns text,
  ADD COLUMN IF NOT EXISTS dnb_last_verified timestamptz,
  ADD COLUMN IF NOT EXISTS experian_intelliscore integer,
  ADD COLUMN IF NOT EXISTS experian_last_verified timestamptz,
  ADD COLUMN IF NOT EXISTS equifax_payment_index integer,
  ADD COLUMN IF NOT EXISTS equifax_credit_risk integer,
  ADD COLUMN IF NOT EXISTS equifax_failure_score integer,
  ADD COLUMN IF NOT EXISTS equifax_last_verified timestamptz,
  ADD COLUMN IF NOT EXISTS fico_sbss integer,
  ADD COLUMN IF NOT EXISTS fico_sbss_last_verified timestamptz;

-- Create business credit history table
CREATE TABLE public.business_credit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  bureau text NOT NULL,
  metric_name text NOT NULL,
  score_value integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_credit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit history"
  ON public.business_credit_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credit history"
  ON public.business_credit_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credit history"
  ON public.business_credit_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credit history"
  ON public.business_credit_history FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_business_credit_history_business ON public.business_credit_history(business_id);
CREATE INDEX idx_business_credit_history_bureau ON public.business_credit_history(bureau, metric_name);
