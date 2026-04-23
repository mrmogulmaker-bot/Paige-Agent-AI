-- Banking relationships table — tracks each personal/business banking relationship a user has.
-- Used by enhanced fundability scoring (15% personal, 15% small business, 10% commercial weights).
CREATE TABLE IF NOT EXISTS public.banking_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_id UUID NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  institution_type TEXT NOT NULL CHECK (institution_type IN ('bank','credit_union','online_bank','investment_broker','cdfi')),
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'checking','savings','money_market','brokerage','cd','ira','mortgage','auto_loan','credit_card','line_of_credit',
    'business_checking','business_savings','business_money_market','merchant_services','business_cd','business_line_of_credit'
  )),
  account_open_date DATE NULL,
  average_monthly_balance NUMERIC(14,2) NULL,
  current_balance NUMERIC(14,2) NULL,
  is_primary_institution BOOLEAN NOT NULL DEFAULT false,
  months_at_institution INTEGER NULL,
  has_direct_deposit BOOLEAN NOT NULL DEFAULT false,
  overdraft_count_last_12_months INTEGER NOT NULL DEFAULT 0,
  nsf_count_last_12_months INTEGER NOT NULL DEFAULT 0,
  account_standing TEXT NOT NULL DEFAULT 'good' CHECK (account_standing IN ('good','restricted','closed','negative')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banking_relationships_user ON public.banking_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_banking_relationships_business ON public.banking_relationships(business_id);
CREATE INDEX IF NOT EXISTS idx_banking_relationships_primary ON public.banking_relationships(user_id, is_primary_institution) WHERE is_primary_institution = true;

ALTER TABLE public.banking_relationships ENABLE ROW LEVEL SECURITY;

-- Users see/manage their own; admins/coaches see all (consistent with other financial tables).
CREATE POLICY "Users select own banking relationships"
  ON public.banking_relationships FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Users insert own banking relationships"
  ON public.banking_relationships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own banking relationships"
  ON public.banking_relationships FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users delete own banking relationships"
  ON public.banking_relationships FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role full access for edge functions
CREATE POLICY "Service role full access banking_relationships"
  ON public.banking_relationships FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_banking_relationships_updated_at
  BEFORE UPDATE ON public.banking_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profile columns for the financial profile / asset-aware scoring.
-- All nullable so existing rows keep working; scoring treats NULL as "unknown" (low signal).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_bank_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS primary_bank_months INTEGER NULL,
  ADD COLUMN IF NOT EXISTS primary_bank_average_balance NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS has_investment_accounts BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS investment_account_value_range TEXT NULL CHECK (investment_account_value_range IS NULL OR investment_account_value_range IN ('under_10k','10k_50k','50k_250k','250k_plus')),
  ADD COLUMN IF NOT EXISTS total_liquid_assets_range TEXT NULL CHECK (total_liquid_assets_range IS NULL OR total_liquid_assets_range IN ('under_5k','5k_25k','25k_100k','100k_plus')),
  ADD COLUMN IF NOT EXISTS has_real_estate_equity BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS real_estate_equity_range TEXT NULL CHECK (real_estate_equity_range IS NULL OR real_estate_equity_range IN ('under_25k','25k_100k','100k_250k','250k_plus')),
  ADD COLUMN IF NOT EXISTS has_equipment_assets BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_invoice_receivables BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_revenue_range TEXT NULL CHECK (monthly_revenue_range IS NULL OR monthly_revenue_range IN ('under_5k','5k_10k','10k_25k','25k_50k','50k_100k','100k_plus'));