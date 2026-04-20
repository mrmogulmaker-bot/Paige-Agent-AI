-- Enum for prediction types
DO $$ BEGIN
  CREATE TYPE public.credit_prediction_type AS ENUM (
    'score_drop_warning',
    'score_increase_opportunity',
    'reporting_date_optimization',
    'account_age_risk',
    'utilization_spike_warning',
    'inquiry_strategy',
    'new_account_timing',
    'payment_history_risk',
    'credit_mix_opportunity',
    'funding_window_alert'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.credit_prediction_confidence AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.credit_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  prediction_type public.credit_prediction_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  impact_score INTEGER,
  action_required TEXT,
  action_url TEXT,
  deadline_date TIMESTAMPTZ,
  bureau TEXT,
  account_id UUID REFERENCES public.credit_accounts(id) ON DELETE SET NULL,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  is_acted_on BOOLEAN NOT NULL DEFAULT false,
  confidence public.credit_prediction_confidence NOT NULL DEFAULT 'medium',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_credit_predictions_user_active
  ON public.credit_predictions (user_id, is_dismissed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_predictions_user_type
  ON public.credit_predictions (user_id, prediction_type);
CREATE INDEX IF NOT EXISTS idx_credit_predictions_deadline
  ON public.credit_predictions (deadline_date) WHERE deadline_date IS NOT NULL;

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_credit_predictions_updated_at ON public.credit_predictions;
CREATE TRIGGER trg_credit_predictions_updated_at
BEFORE UPDATE ON public.credit_predictions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.credit_predictions ENABLE ROW LEVEL SECURITY;

-- Clients see their own predictions
CREATE POLICY "Users view own predictions"
ON public.credit_predictions FOR SELECT
USING (auth.uid() = user_id);

-- Coaches and admins can view all predictions
CREATE POLICY "Coaches and admins view all predictions"
ON public.credit_predictions FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'coach'::public.app_role)
);

-- Clients can dismiss / mark acted-on (UPDATE) on their own predictions
CREATE POLICY "Users update own predictions"
ON public.credit_predictions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can update / delete any
CREATE POLICY "Admins update any predictions"
ON public.credit_predictions FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete predictions"
ON public.credit_predictions FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Inserts come from service role (edge function); admins may also insert manually
CREATE POLICY "Admins insert predictions"
ON public.credit_predictions FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
