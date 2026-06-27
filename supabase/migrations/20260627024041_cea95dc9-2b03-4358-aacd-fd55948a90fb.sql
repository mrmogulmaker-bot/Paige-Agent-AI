
-- Extend clients table to act as a real CRM Contacts object
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false;

-- Soft check on lifecycle_stage values (won't break existing rows)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_lifecycle_stage_chk'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_lifecycle_stage_chk
      CHECK (lifecycle_stage IN ('lead','mql','sql','opportunity','customer','evangelist','churned','archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_lifecycle_stage ON public.clients(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_clients_tags ON public.clients USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_clients_last_contacted ON public.clients(last_contacted_at DESC NULLS LAST);

-- Helpful view: deal counts and total value per contact for the contacts list
CREATE OR REPLACE VIEW public.contact_deal_rollup AS
SELECT
  c.id AS contact_id,
  COUNT(d.id) FILTER (WHERE d.status = 'open')   AS open_deals,
  COUNT(d.id) FILTER (WHERE d.status = 'won')    AS won_deals,
  COALESCE(SUM(d.value_cents) FILTER (WHERE d.status = 'open'), 0) AS open_value_cents,
  COALESCE(SUM(d.value_cents) FILTER (WHERE d.status = 'won'),  0) AS won_value_cents
FROM public.clients c
LEFT JOIN public.deals d ON d.contact_client_id = c.id
GROUP BY c.id;

GRANT SELECT ON public.contact_deal_rollup TO authenticated;
GRANT SELECT ON public.contact_deal_rollup TO service_role;
