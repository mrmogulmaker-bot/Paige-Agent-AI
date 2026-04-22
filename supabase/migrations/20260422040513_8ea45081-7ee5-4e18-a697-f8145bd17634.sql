ALTER TABLE public.communication_preferences
  ADD COLUMN IF NOT EXISTS email_affiliate_program BOOLEAN NOT NULL DEFAULT TRUE;