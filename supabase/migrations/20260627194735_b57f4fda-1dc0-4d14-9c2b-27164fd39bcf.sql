
-- Phase 3 Addendum: Capital-Readiness connectors (Nav, SmartCredit, Plaid scaffold)

-- bureau enum (idempotent)
DO $$ BEGIN
  CREATE TYPE public.owner_credit_bureau AS ENUM ('experian','equifax','transunion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) paige_business_credit_profiles
CREATE TABLE IF NOT EXISTS public.paige_business_credit_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  business_name text,
  ein text,
  nav_profile_id text,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  trade_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_pulled_at timestamptz,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_business_credit_profiles TO authenticated;
GRANT ALL ON public.paige_business_credit_profiles TO service_role;
ALTER TABLE public.paige_business_credit_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_coaches_read_business_credit" ON public.paige_business_credit_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'coach'::public.app_role));
CREATE POLICY "service_writes_business_credit" ON public.paige_business_credit_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pbcp_contact ON public.paige_business_credit_profiles(contact_id);

-- 2) paige_owner_credit_snapshots
CREATE TABLE IF NOT EXISTS public.paige_owner_credit_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bureau public.owner_credit_bureau NOT NULL,
  score int,
  pulled_at timestamptz NOT NULL DEFAULT now(),
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerts_triggered jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_owner_credit_snapshots TO authenticated;
GRANT ALL ON public.paige_owner_credit_snapshots TO service_role;
ALTER TABLE public.paige_owner_credit_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_coaches_read_owner_credit" ON public.paige_owner_credit_snapshots
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'coach'::public.app_role));
CREATE POLICY "service_writes_owner_credit" ON public.paige_owner_credit_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pocs_contact_pulled ON public.paige_owner_credit_snapshots(contact_id, pulled_at DESC);

-- 3) paige_bank_connections
CREATE TABLE IF NOT EXISTS public.paige_bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plaid_item_id text UNIQUE,
  plaid_access_token_encrypted text,
  institution_name text,
  accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_bank_connections TO authenticated;
GRANT ALL ON public.paige_bank_connections TO service_role;
ALTER TABLE public.paige_bank_connections ENABLE ROW LEVEL SECURITY;
-- Only expose non-sensitive fields via UI by selecting columns. Token is service-role only.
CREATE POLICY "admins_coaches_read_bank_connections" ON public.paige_bank_connections
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'coach'::public.app_role));
CREATE POLICY "service_writes_bank_connections" ON public.paige_bank_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pbc_contact ON public.paige_bank_connections(contact_id);

-- 4) paige_bank_transactions
CREATE TABLE IF NOT EXISTS public.paige_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_connection_id uuid NOT NULL REFERENCES public.paige_bank_connections(id) ON DELETE CASCADE,
  plaid_transaction_id text UNIQUE,
  date date NOT NULL,
  amount_cents bigint NOT NULL,
  name text,
  category jsonb,
  pending boolean NOT NULL DEFAULT false,
  account_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_bank_transactions TO authenticated;
GRANT ALL ON public.paige_bank_transactions TO service_role;
ALTER TABLE public.paige_bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_coaches_read_bank_tx" ON public.paige_bank_transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'coach'::public.app_role));
CREATE POLICY "service_writes_bank_tx" ON public.paige_bank_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pbt_conn_date ON public.paige_bank_transactions(bank_connection_id, date DESC);

-- 5) paige_cash_flow_snapshots
CREATE TABLE IF NOT EXISTS public.paige_cash_flow_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_deposits_cents bigint NOT NULL DEFAULT 0,
  total_withdrawals_cents bigint NOT NULL DEFAULT 0,
  avg_daily_balance_cents bigint NOT NULL DEFAULT 0,
  runway_days int,
  funding_readiness_score int,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_cash_flow_snapshots TO authenticated;
GRANT ALL ON public.paige_cash_flow_snapshots TO service_role;
ALTER TABLE public.paige_cash_flow_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_coaches_read_cash_flow" ON public.paige_cash_flow_snapshots
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'coach'::public.app_role));
CREATE POLICY "service_writes_cash_flow" ON public.paige_cash_flow_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pcfs_contact_gen ON public.paige_cash_flow_snapshots(contact_id, generated_at DESC);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_pbcp_updated ON public.paige_business_credit_profiles;
CREATE TRIGGER trg_pbcp_updated BEFORE UPDATE ON public.paige_business_credit_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pbc_updated ON public.paige_bank_connections;
CREATE TRIGGER trg_pbc_updated BEFORE UPDATE ON public.paige_bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- paige_config extensions
ALTER TABLE public.paige_config
  ADD COLUMN IF NOT EXISTS nav_partner_id text,
  ADD COLUMN IF NOT EXISTS nav_threshold_delta int DEFAULT 20,
  ADD COLUMN IF NOT EXISTS smartcredit_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS plaid_activated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS plaid_env text DEFAULT 'sandbox';
