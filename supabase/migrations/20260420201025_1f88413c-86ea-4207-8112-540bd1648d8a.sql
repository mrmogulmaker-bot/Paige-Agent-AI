-- Enable pgcrypto for token encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- QUICKBOOKS CONNECTIONS
-- ============================================================
CREATE TABLE public.quickbooks_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  qb_realm_id TEXT NOT NULL,
  qb_company_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qb_connections_user ON public.quickbooks_connections(user_id);
CREATE INDEX idx_qb_connections_active ON public.quickbooks_connections(is_active) WHERE is_active = true;

ALTER TABLE public.quickbooks_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own QB connection"
  ON public.quickbooks_connections FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
  );

CREATE POLICY "Users insert own QB connection"
  ON public.quickbooks_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own QB connection"
  ON public.quickbooks_connections FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users delete own QB connection"
  ON public.quickbooks_connections FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access QB connections"
  ON public.quickbooks_connections FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- QUICKBOOKS FINANCIALS
-- ============================================================
CREATE TABLE public.quickbooks_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  qb_connection_id UUID NOT NULL REFERENCES public.quickbooks_connections(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue NUMERIC(14,2) DEFAULT 0,
  total_expenses NUMERIC(14,2) DEFAULT 0,
  gross_profit NUMERIC(14,2) DEFAULT 0,
  gross_margin_percent NUMERIC(6,2) DEFAULT 0,
  net_income NUMERIC(14,2) DEFAULT 0,
  net_margin_percent NUMERIC(6,2) DEFAULT 0,
  cogs NUMERIC(14,2) DEFAULT 0,
  operating_expenses NUMERIC(14,2) DEFAULT 0,
  payroll_expenses NUMERIC(14,2) DEFAULT 0,
  marketing_expenses NUMERIC(14,2) DEFAULT 0,
  professional_fees NUMERIC(14,2) DEFAULT 0,
  cash_and_bank_balance NUMERIC(14,2) DEFAULT 0,
  accounts_receivable NUMERIC(14,2) DEFAULT 0,
  accounts_payable NUMERIC(14,2) DEFAULT 0,
  monthly_burn_rate NUMERIC(14,2) DEFAULT 0,
  cash_runway_months NUMERIC(6,2),
  revenue_per_month JSONB DEFAULT '[]'::jsonb,
  top_expense_categories JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qb_financials_user ON public.quickbooks_financials(user_id, synced_at DESC);
CREATE INDEX idx_qb_financials_connection ON public.quickbooks_financials(qb_connection_id, synced_at DESC);

ALTER TABLE public.quickbooks_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own QB financials"
  ON public.quickbooks_financials FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
  );

CREATE POLICY "Service role full access QB financials"
  ON public.quickbooks_financials FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- QUICKBOOKS TRANSACTIONS
-- ============================================================
CREATE TABLE public.quickbooks_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  qb_connection_id UUID NOT NULL REFERENCES public.quickbooks_connections(id) ON DELETE CASCADE,
  qb_transaction_id TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  category TEXT,
  vendor_or_customer TEXT,
  description TEXT,
  is_business_expense BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(qb_connection_id, qb_transaction_id, transaction_type)
);

CREATE INDEX idx_qb_txn_user_date ON public.quickbooks_transactions(user_id, transaction_date DESC);
CREATE INDEX idx_qb_txn_connection ON public.quickbooks_transactions(qb_connection_id, transaction_date DESC);

ALTER TABLE public.quickbooks_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own QB transactions"
  ON public.quickbooks_transactions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
  );

CREATE POLICY "Service role full access QB transactions"
  ON public.quickbooks_transactions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER trg_qb_connections_updated_at
  BEFORE UPDATE ON public.quickbooks_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TOKEN ENCRYPTION HELPERS
-- Uses pgcrypto symmetric encryption with key from internal secret
-- ============================================================
CREATE OR REPLACE FUNCTION public.qb_encrypt_token(_plaintext TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key TEXT;
BEGIN
  SELECT value INTO _key FROM public._internal_secrets WHERE key = 'qb_token_key' LIMIT 1;
  IF _key IS NULL THEN
    RAISE EXCEPTION 'qb_token_key not configured in _internal_secrets';
  END IF;
  RETURN encode(extensions.pgp_sym_encrypt(_plaintext, _key), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.qb_decrypt_token(_ciphertext TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key TEXT;
BEGIN
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Only service role can decrypt QB tokens';
  END IF;
  SELECT value INTO _key FROM public._internal_secrets WHERE key = 'qb_token_key' LIMIT 1;
  IF _key IS NULL THEN
    RAISE EXCEPTION 'qb_token_key not configured';
  END IF;
  RETURN extensions.pgp_sym_decrypt(decode(_ciphertext, 'base64')::bytea, _key);
END;
$$;