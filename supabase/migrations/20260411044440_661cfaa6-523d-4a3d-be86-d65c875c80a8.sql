-- Add cross-bureau discrepancy tracking to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cross_bureau_discrepancies jsonb NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS has_discrepancies boolean NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_report_source text NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_report_analyzed_at timestamptz NULL DEFAULT NULL;