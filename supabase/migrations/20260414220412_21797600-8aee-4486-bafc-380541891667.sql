
-- Add backfill tracking columns to credit_report_uploads
ALTER TABLE public.credit_report_uploads
  ADD COLUMN IF NOT EXISTS backfill_status text DEFAULT 'not_needed',
  ADD COLUMN IF NOT EXISTS backfill_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS backfill_fields_updated jsonb;

-- Create extraction quality log table
CREATE TABLE IF NOT EXISTS public.extraction_quality_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.credit_report_uploads(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  extraction_date timestamptz NOT NULL DEFAULT now(),
  account_count_original integer,
  account_count_reextracted integer,
  score_consistency_check jsonb,
  creditor_consistency_check jsonb,
  required_fields_percentage numeric,
  quality_flags jsonb,
  overall_quality_score integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.extraction_quality_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quality logs"
  ON public.extraction_quality_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all quality logs"
  ON public.extraction_quality_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert quality logs"
  ON public.extraction_quality_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update quality logs"
  ON public.extraction_quality_log FOR UPDATE
  USING (true);
