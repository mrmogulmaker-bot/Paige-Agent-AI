
-- Add new columns to credit_accounts
ALTER TABLE public.credit_accounts 
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS current_balance DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS account_open_date DATE,
  ADD COLUMN IF NOT EXISTS account_close_date DATE,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_authorized_user BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_history_json JSONB,
  ADD COLUMN IF NOT EXISTS last_reported_date DATE;

-- Add new columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT DEFAULT 'welcome',
  ADD COLUMN IF NOT EXISTS estimated_fico_tu INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_fico_ex INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_fico_eq INTEGER,
  ADD COLUMN IF NOT EXISTS credit_goals JSONB,
  ADD COLUMN IF NOT EXISTS funding_goals JSONB;

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_factor_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_funding_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_negative_items;
