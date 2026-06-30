
-- 1. Extend paige_subagents with factory metadata
ALTER TABLE public.paige_subagents
  ADD COLUMN IF NOT EXISTS system_prompt text,
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS daily_invocation_cap integer DEFAULT 200,
  ADD COLUMN IF NOT EXISTS monthly_token_cap integer DEFAULT 2000000,
  ADD COLUMN IF NOT EXISTS auto_disabled_reason text;

-- Drop the old runtime CHECK if it exists, then re-add allowing 'soft'
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.paige_subagents'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%runtime%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.paige_subagents DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.paige_subagents
  ADD CONSTRAINT paige_subagents_runtime_check
  CHECK (runtime IN ('local','langgraph','soft'));

-- 2. Proposals table
CREATE TABLE IF NOT EXISTS public.paige_subagent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_slug text NOT NULL,
  proposed_name text NOT NULL,
  domain text NOT NULL,
  description text NOT NULL,
  rationale text NOT NULL,
  runtime text NOT NULL CHECK (runtime IN ('soft','local','langgraph')),
  system_prompt text NOT NULL,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggers text[] NOT NULL DEFAULT ARRAY[]::text[],
  data_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','rejected','generated','live','failed')),
  proposed_by uuid,
  proposed_by_agent text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  resulting_subagent_id uuid REFERENCES public.paige_subagents(id) ON DELETE SET NULL,
  approval_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.paige_subagent_proposals TO authenticated;
GRANT ALL ON public.paige_subagent_proposals TO service_role;
ALTER TABLE public.paige_subagent_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage proposals"
  ON public.paige_subagent_proposals FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "coaches read proposals"
  ON public.paige_subagent_proposals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

CREATE INDEX IF NOT EXISTS idx_subagent_proposals_status
  ON public.paige_subagent_proposals(status, created_at DESC);

-- 3. Daily quota tracking
CREATE TABLE IF NOT EXISTS public.paige_subagent_factory_quota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  proposals_count integer NOT NULL DEFAULT 0,
  soft_shipped integer NOT NULL DEFAULT 0,
  hard_shipped integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quota_date)
);

GRANT SELECT ON public.paige_subagent_factory_quota TO authenticated;
GRANT ALL ON public.paige_subagent_factory_quota TO service_role;
ALTER TABLE public.paige_subagent_factory_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read quota"
  ON public.paige_subagent_factory_quota FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_subagent_proposals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_subagent_proposals_updated_at ON public.paige_subagent_proposals;
CREATE TRIGGER trg_subagent_proposals_updated_at
  BEFORE UPDATE ON public.paige_subagent_proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_subagent_proposals_updated_at();
