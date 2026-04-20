-- 1. Enums
CREATE TYPE public.denial_reason_category AS ENUM (
  'credit_score_too_low',
  'insufficient_time_in_business',
  'insufficient_revenue',
  'too_much_existing_debt',
  'no_collateral',
  'incomplete_application',
  'industry_restriction',
  'too_many_recent_inquiries',
  'derogatory_items',
  'insufficient_cash_flow',
  'personal_guarantee_declined',
  'entity_structure_issue',
  'other'
);

CREATE TYPE public.funding_journey_status AS ENUM (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'denied',
  'withdrawn',
  'funded'
);

CREATE TYPE public.funding_milestone_type AS ENUM (
  'first_application',
  'first_approval',
  'first_funding',
  'score_threshold_crossed',
  'debt_cleared',
  'business_credit_established',
  'dscr_qualified',
  'sba_eligible'
);

-- 2. funding_journey_applications table
CREATE TABLE public.funding_journey_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  lender_name TEXT NOT NULL,
  lender_id UUID,
  product_category TEXT,
  product_name TEXT,
  amount_requested INTEGER,
  amount_approved INTEGER,
  interest_rate NUMERIC(6,3),
  term_months INTEGER,
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  decision_date DATE,
  status public.funding_journey_status NOT NULL DEFAULT 'draft',
  denial_reason_category public.denial_reason_category,
  denial_reason_detail TEXT,
  denial_letter_url TEXT,
  credit_score_at_application INTEGER,
  bureau_pulled TEXT,
  notes TEXT,
  next_steps TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funding_journey_user ON public.funding_journey_applications(user_id, application_date DESC);
CREATE INDEX idx_funding_journey_status ON public.funding_journey_applications(status, updated_at DESC);

ALTER TABLE public.funding_journey_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own journey applications"
  ON public.funding_journey_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own journey applications"
  ON public.funding_journey_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own journey applications"
  ON public.funding_journey_applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own journey applications"
  ON public.funding_journey_applications FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and coaches view all journey applications"
  ON public.funding_journey_applications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Admins and coaches update all journey applications"
  ON public.funding_journey_applications FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Admins and coaches insert journey applications"
  ON public.funding_journey_applications FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE TRIGGER funding_journey_applications_updated_at
  BEFORE UPDATE ON public.funding_journey_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. funding_milestones table
CREATE TABLE public.funding_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  milestone_type public.funding_milestone_type NOT NULL,
  milestone_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount INTEGER,
  lender_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funding_milestones_user ON public.funding_milestones(user_id, milestone_date DESC);

ALTER TABLE public.funding_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own funding milestones"
  ON public.funding_milestones FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own funding milestones"
  ON public.funding_milestones FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and coaches view all funding milestones"
  ON public.funding_milestones FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Admins and coaches insert funding milestones"
  ON public.funding_milestones FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

-- 4. Storage bucket for denial letters
INSERT INTO storage.buckets (id, name, public)
VALUES ('denial-letters', 'denial-letters', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own denial letters"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'denial-letters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own denial letters"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'denial-letters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own denial letters"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'denial-letters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins and coaches read all denial letters"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'denial-letters'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role))
  );

-- 5. businesses column additions for conversational capture
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS estimated_annual_revenue NUMERIC,
  ADD COLUMN IF NOT EXISTS employee_count INTEGER;