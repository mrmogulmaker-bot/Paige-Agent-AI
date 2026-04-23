ALTER TABLE public.banking_relationships
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS qb_account_id TEXT,
  ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'banking_relationships_source_check'
  ) THEN
    ALTER TABLE public.banking_relationships
      ADD CONSTRAINT banking_relationships_source_check
      CHECK (source IN ('manual', 'quickbooks', 'plaid'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_banking_relationships_qb_account
  ON public.banking_relationships (user_id, qb_account_id)
  WHERE qb_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_banking_relationships_user_source
  ON public.banking_relationships (user_id, source);
