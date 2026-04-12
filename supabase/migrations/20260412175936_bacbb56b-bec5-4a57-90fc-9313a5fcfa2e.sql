
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS build_assessment_answers jsonb DEFAULT null,
  ADD COLUMN IF NOT EXISTS build_score integer DEFAULT null,
  ADD COLUMN IF NOT EXISTS build_assessed_at timestamptz DEFAULT null;
