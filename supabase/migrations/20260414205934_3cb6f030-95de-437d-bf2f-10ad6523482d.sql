
-- Add account_number to credit_accounts
ALTER TABLE public.credit_accounts ADD COLUMN IF NOT EXISTS account_number text;

-- Add needs_review and validation_flags to credit_accounts
ALTER TABLE public.credit_accounts ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.credit_accounts ADD COLUMN IF NOT EXISTS validation_flags jsonb;

-- Add account_number to credit_negative_items
ALTER TABLE public.credit_negative_items ADD COLUMN IF NOT EXISTS account_number text;

-- Add needs_review and validation_flags to credit_negative_items
ALTER TABLE public.credit_negative_items ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.credit_negative_items ADD COLUMN IF NOT EXISTS validation_flags jsonb;

-- Add last_analyzed_at to credit_report_uploads
ALTER TABLE public.credit_report_uploads ADD COLUMN IF NOT EXISTS last_analyzed_at timestamptz;

-- Create index on account_number for dedup lookups
CREATE INDEX IF NOT EXISTS idx_credit_accounts_account_number ON public.credit_accounts (user_id, account_number) WHERE account_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_negative_items_account_number ON public.credit_negative_items (user_id, account_number) WHERE account_number IS NOT NULL;
