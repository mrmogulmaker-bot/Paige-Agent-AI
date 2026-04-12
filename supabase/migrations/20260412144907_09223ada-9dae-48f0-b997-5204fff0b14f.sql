
-- ============================================================
-- LAYER 2 — Platform Intelligence Engine Placeholder
-- When dispute_outcomes reaches 100+ records, build an aggregation
-- service that feeds outcome statistics into Paige's system prompt
-- as real-time context. This will allow Paige to say things like:
-- "Based on 47 disputes filed against this bureau in the past 6 months,
-- the deletion rate for charge-off accounts under $10,000 is 23% and
-- the average response time is 28 days."
-- This context should be injected as a structured section in the system
-- prompt alongside the PME Knowledge Base, updated nightly from the
-- outcomes tables. The aggregation service should be built as a separate
-- Supabase edge function called generate-platform-intelligence that runs
-- on a cron schedule and writes a cached summary to a platform_intelligence
-- table that the paige-ai-chat edge function reads from.
-- ============================================================

-- 1. Dispute Outcomes Table
CREATE TABLE public.dispute_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  bureau TEXT NOT NULL,
  creditor_name TEXT NOT NULL,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'deleted', 'updated_to_paid', 'updated_to_settled',
    'verified_no_change', 'no_response_35_days', 'withdrawn'
  )),
  submission_date DATE,
  response_date DATE,
  response_time_days INTEGER,
  dispute_round INTEGER,
  score_impact INTEGER,
  admin_notes TEXT,
  recorded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispute_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dispute outcomes"
  ON public.dispute_outcomes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all dispute outcomes"
  ON public.dispute_outcomes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view all dispute outcomes"
  ON public.dispute_outcomes FOR SELECT
  USING (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Admins can insert dispute outcomes"
  ON public.dispute_outcomes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can insert dispute outcomes"
  ON public.dispute_outcomes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Admins can update dispute outcomes"
  ON public.dispute_outcomes FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access dispute outcomes"
  ON public.dispute_outcomes FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_dispute_outcomes_updated_at
  BEFORE UPDATE ON public.dispute_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- LAYER 2 — Platform Intelligence Engine Placeholder
-- When funding_application_outcomes reaches 100+ records, build
-- an aggregation service comparing predicted_match_score against
-- actual approval outcomes by product category. Feed accuracy
-- metrics into Paige's system prompt to calibrate recommendations.
-- ============================================================

-- 2. Funding Application Outcomes Table
CREATE TABLE public.funding_application_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  lender_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  application_date DATE NOT NULL,
  amount_requested NUMERIC NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'approved', 'approved_lower_amount', 'declined',
    'counter_offered', 'withdrawn', 'pending'
  )),
  approved_amount NUMERIC,
  interest_rate NUMERIC,
  factor_rate NUMERIC,
  decline_reason TEXT CHECK (decline_reason IS NULL OR decline_reason IN (
    'credit_score_too_low', 'too_many_derogatory_items',
    'insufficient_time_in_business', 'insufficient_revenue',
    'no_business_credit_history', 'fraud_alert_on_file',
    'security_freeze', 'application_incomplete', 'other'
  )),
  decline_reason_other TEXT,
  follow_up_date DATE,
  predicted_match_score INTEGER,
  admin_notes TEXT,
  recorded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funding_application_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own funding outcomes"
  ON public.funding_application_outcomes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all funding outcomes"
  ON public.funding_application_outcomes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view all funding outcomes"
  ON public.funding_application_outcomes FOR SELECT
  USING (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Admins can insert funding outcomes"
  ON public.funding_application_outcomes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can insert funding outcomes"
  ON public.funding_application_outcomes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Admins can update funding outcomes"
  ON public.funding_application_outcomes FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access funding outcomes"
  ON public.funding_application_outcomes FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_funding_outcomes_updated_at
  BEFORE UPDATE ON public.funding_application_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Response Quality Feedback Table
CREATE TABLE public.response_quality_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  message_content TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  reason_category TEXT CHECK (reason_category IS NULL OR reason_category IN (
    'factually_incorrect', 'missing_important_context',
    'recommended_wrong_strategy', 'outdated_information', 'other'
  )),
  reason_other TEXT,
  correction_note TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  rated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.response_quality_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all feedback"
  ON public.response_quality_feedback FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert feedback"
  ON public.response_quality_feedback FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can insert feedback"
  ON public.response_quality_feedback FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Admins can update feedback"
  ON public.response_quality_feedback FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access feedback"
  ON public.response_quality_feedback FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes for common queries
CREATE INDEX idx_dispute_outcomes_client ON public.dispute_outcomes(client_id);
CREATE INDEX idx_dispute_outcomes_bureau ON public.dispute_outcomes(bureau);
CREATE INDEX idx_dispute_outcomes_outcome ON public.dispute_outcomes(outcome_type);
CREATE INDEX idx_funding_outcomes_client ON public.funding_application_outcomes(client_id);
CREATE INDEX idx_funding_outcomes_product ON public.funding_application_outcomes(product_type);
CREATE INDEX idx_funding_outcomes_outcome ON public.funding_application_outcomes(outcome);
CREATE INDEX idx_feedback_session ON public.response_quality_feedback(session_id);
CREATE INDEX idx_feedback_reviewed ON public.response_quality_feedback(reviewed_at) WHERE reviewed_at IS NULL;
