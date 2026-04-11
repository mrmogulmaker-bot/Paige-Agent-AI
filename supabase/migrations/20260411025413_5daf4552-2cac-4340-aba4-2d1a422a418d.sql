
CREATE TABLE public.funding_readiness_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  overall_score INTEGER NOT NULL DEFAULT 0,
  personal_credit_score INTEGER NOT NULL DEFAULT 0,
  business_credit_score INTEGER NOT NULL DEFAULT 0,
  entity_structure_score INTEGER NOT NULL DEFAULT 0,
  banking_history_score INTEGER NOT NULL DEFAULT 0,
  revenue_documentation_score INTEGER NOT NULL DEFAULT 0,
  lender_alignment_score INTEGER NOT NULL DEFAULT 0,
  score_explanations JSONB DEFAULT '{}'::jsonb,
  last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.funding_readiness_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own funding readiness score"
  ON public.funding_readiness_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own funding readiness score"
  ON public.funding_readiness_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own funding readiness score"
  ON public.funding_readiness_scores FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage funding readiness scores"
  ON public.funding_readiness_scores FOR ALL
  USING (current_setting('role'::text) = 'service_role'::text);

CREATE TRIGGER update_funding_readiness_scores_updated_at
  BEFORE UPDATE ON public.funding_readiness_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
