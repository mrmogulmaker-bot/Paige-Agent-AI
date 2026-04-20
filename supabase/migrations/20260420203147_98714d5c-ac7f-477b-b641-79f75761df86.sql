ALTER TABLE public.quickbooks_connections
  ADD COLUMN IF NOT EXISTS last_webhook_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_revenue_sync BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_expense_sync BOOLEAN NOT NULL DEFAULT false;