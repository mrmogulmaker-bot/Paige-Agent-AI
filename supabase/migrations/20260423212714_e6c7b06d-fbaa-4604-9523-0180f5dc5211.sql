-- Add consent tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS consent_privacy_policy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_data_usage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_marketing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS credit_report_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_report_consent_timestamp timestamptz;

-- Backfill timestamp for existing accounts so they aren't blocked, leaving consent flags false
COMMENT ON COLUMN public.profiles.consent_privacy_policy IS 'User actively agreed to Privacy Policy + ToS at signup';
COMMENT ON COLUMN public.profiles.consent_data_usage IS 'User actively acknowledged data is never sold';
COMMENT ON COLUMN public.profiles.consent_marketing IS 'Optional marketing email opt-in';
COMMENT ON COLUMN public.profiles.consent_timestamp IS 'When the signup consents were captured';
COMMENT ON COLUMN public.profiles.credit_report_consent IS 'User confirmed credit report data usage disclosures before first upload';
COMMENT ON COLUMN public.profiles.credit_report_consent_timestamp IS 'When credit report consent was captured';