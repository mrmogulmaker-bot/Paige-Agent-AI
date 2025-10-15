-- Create table for Plaid transactions
CREATE TABLE IF NOT EXISTS public.plaid_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.connected_bank_accounts(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL UNIQUE,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  name TEXT,
  merchant_name TEXT,
  category TEXT[],
  pending BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create table for balance snapshots
CREATE TABLE IF NOT EXISTS public.balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.connected_bank_accounts(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL,
  available NUMERIC,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create table for financial KPIs
CREATE TABLE IF NOT EXISTS public.financial_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avg_balance_90d NUMERIC,
  avg_balance_30d NUMERIC,
  monthly_inflow NUMERIC,
  monthly_outflow NUMERIC,
  dscr NUMERIC,
  nsf_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Create table for Plaid webhook events
CREATE TABLE IF NOT EXISTS public.plaid_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type TEXT NOT NULL,
  webhook_code TEXT NOT NULL,
  item_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.plaid_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for plaid_transactions
CREATE POLICY "Users can view own transactions"
  ON public.plaid_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage transactions"
  ON public.plaid_transactions FOR ALL
  USING (current_setting('role') = 'service_role');

-- RLS Policies for balance_snapshots
CREATE POLICY "Users can view own snapshots"
  ON public.balance_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage snapshots"
  ON public.balance_snapshots FOR ALL
  USING (current_setting('role') = 'service_role');

-- RLS Policies for financial_kpis
CREATE POLICY "Users can view own KPIs"
  ON public.financial_kpis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage KPIs"
  ON public.financial_kpis FOR ALL
  USING (current_setting('role') = 'service_role');

-- RLS Policies for webhook events
CREATE POLICY "Service role can manage webhook events"
  ON public.plaid_webhook_events FOR ALL
  USING (current_setting('role') = 'service_role');

-- Create indexes
CREATE INDEX idx_plaid_transactions_user_id ON public.plaid_transactions(user_id);
CREATE INDEX idx_plaid_transactions_account_id ON public.plaid_transactions(account_id);
CREATE INDEX idx_plaid_transactions_date ON public.plaid_transactions(date DESC);
CREATE INDEX idx_balance_snapshots_user_id ON public.balance_snapshots(user_id);
CREATE INDEX idx_balance_snapshots_date ON public.balance_snapshots(snapshot_date DESC);
CREATE INDEX idx_webhook_events_processed ON public.plaid_webhook_events(processed, created_at);

-- Add updated_at trigger
CREATE TRIGGER update_plaid_transactions_updated_at
  BEFORE UPDATE ON public.plaid_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_financial_kpis_updated_at
  BEFORE UPDATE ON public.financial_kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();