
-- 1) Add missing columns to public.businesses (project's business profile table)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS dnb_paydex_score integer,
  ADD COLUMN IF NOT EXISTS dnb_delinquency_score integer,
  ADD COLUMN IF NOT EXISTS dnb_financial_stress_score integer,
  ADD COLUMN IF NOT EXISTS dnb_duns_number text,
  ADD COLUMN IF NOT EXISTS dnb_report_date date,
  ADD COLUMN IF NOT EXISTS experian_intelliscore_score integer,
  ADD COLUMN IF NOT EXISTS experian_financial_stability_risk integer,
  ADD COLUMN IF NOT EXISTS experian_days_beyond_terms integer,
  ADD COLUMN IF NOT EXISTS experian_report_date date,
  ADD COLUMN IF NOT EXISTS equifax_sbfe_score integer,
  ADD COLUMN IF NOT EXISTS equifax_payment_index_score integer,
  ADD COLUMN IF NOT EXISTS equifax_report_date date,
  ADD COLUMN IF NOT EXISTS business_credit_last_updated timestamptz;

-- 2) Create business_credit_reports table
CREATE TABLE IF NOT EXISTS public.business_credit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  bureau text NOT NULL CHECK (bureau IN ('dnb','experian_business','equifax_sbfe')),
  report_date date,
  raw_text text,
  paydex_score integer,
  intelliscore integer,
  sbfe_score integer,
  payment_trend text,
  days_beyond_terms integer,
  trade_line_count integer,
  derogatory_count integer,
  highest_credit_extended numeric,
  file_url text,
  file_path text,
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending','extracted','failed')),
  extraction_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_credit_reports_user ON public.business_credit_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_credit_reports_business ON public.business_credit_reports(business_id, bureau, report_date DESC);

ALTER TABLE public.business_credit_reports ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own reports
CREATE POLICY "Users view own business credit reports"
  ON public.business_credit_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own business credit reports"
  ON public.business_credit_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own business credit reports"
  ON public.business_credit_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own business credit reports"
  ON public.business_credit_reports FOR DELETE
  USING (auth.uid() = user_id);

-- Admins read all
CREATE POLICY "Admins read all business credit reports"
  ON public.business_credit_reports FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
CREATE TRIGGER update_business_credit_reports_updated_at
  BEFORE UPDATE ON public.business_credit_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Storage bucket for business credit report PDFs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-credit-reports', 'business-credit-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — files stored at <user_id>/<filename>
CREATE POLICY "Users read own business credit report files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'business-credit-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own business credit report files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'business-credit-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own business credit report files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'business-credit-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins read all business credit report files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'business-credit-reports'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
