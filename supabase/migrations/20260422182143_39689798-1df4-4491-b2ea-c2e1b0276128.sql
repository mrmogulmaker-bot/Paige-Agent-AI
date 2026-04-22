-- Add timestamp tracking for last fundability score calculation per user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_fundability_calculated timestamptz;

-- Optional: store the latest calculated three-score snapshot for fast read &
-- biannual diffing. Lightweight JSONB so we don't need a new table.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_fundability_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_last_fundability_calculated
  ON public.profiles (last_fundability_calculated);
