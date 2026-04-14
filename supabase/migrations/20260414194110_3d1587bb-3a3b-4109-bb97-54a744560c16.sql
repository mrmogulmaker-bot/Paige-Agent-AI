-- Create account_modifications audit table
CREATE TABLE public.account_modifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID,
  account_table TEXT NOT NULL DEFAULT 'credit_negative_items',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  modified_by_user_id UUID NOT NULL,
  modification_type TEXT NOT NULL CHECK (modification_type IN ('edit', 'merge', 'mark_duplicate', 'mark_not_mine', 'delete', 'bureau_correction', 'auto_dedup')),
  previous_value JSONB,
  new_value JSONB,
  modification_source TEXT NOT NULL CHECK (modification_source IN ('client_ui', 'coach_ui', 'admin_ui', 'paige_chat', 'system')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_modifications ENABLE ROW LEVEL SECURITY;

-- Clients see their own logs
CREATE POLICY "Users can view own modification logs"
  ON public.account_modifications FOR SELECT
  USING (auth.uid() = user_id);

-- Coaches see assigned client logs
CREATE POLICY "Coaches can view assigned client logs"
  ON public.account_modifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_user_id = auth.uid()
        AND cc.client_user_id = account_modifications.user_id
        AND cc.status = 'active'
    )
  );

-- Admins see all logs
CREATE POLICY "Admins can view all modification logs"
  ON public.account_modifications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert
CREATE POLICY "Service role can insert modification logs"
  ON public.account_modifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Add duplicate tracking columns to credit_negative_items
ALTER TABLE public.credit_negative_items
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID REFERENCES public.credit_negative_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_disputed_ownership BOOLEAN DEFAULT false;

-- Add duplicate tracking columns to credit_accounts
ALTER TABLE public.credit_accounts
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID REFERENCES public.credit_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_disputed_ownership BOOLEAN DEFAULT false;

-- Index for quick lookups
CREATE INDEX idx_account_modifications_user ON public.account_modifications(user_id);
CREATE INDEX idx_account_modifications_account ON public.account_modifications(account_id);
CREATE INDEX idx_neg_items_duplicate ON public.credit_negative_items(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;
CREATE INDEX idx_credit_accounts_duplicate ON public.credit_accounts(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;