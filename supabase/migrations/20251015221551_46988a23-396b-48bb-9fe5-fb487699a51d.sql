-- Add cursor tracking for incremental sync
ALTER TABLE public.connected_bank_accounts 
ADD COLUMN IF NOT EXISTS transactions_cursor TEXT,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add event_id for idempotency
ALTER TABLE public.plaid_webhook_events
ADD COLUMN IF NOT EXISTS event_id TEXT UNIQUE;

-- Create index for fast idempotency check
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.plaid_webhook_events(event_id);

-- Add tasks_created column for audit
ALTER TABLE public.plaid_webhook_events
ADD COLUMN IF NOT EXISTS tasks_created TEXT[];

-- Add notification tracking
CREATE TABLE IF NOT EXISTS public.plaid_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  template TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.plaid_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.plaid_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage notifications"
  ON public.plaid_notifications FOR ALL
  USING (current_setting('role') = 'service_role');