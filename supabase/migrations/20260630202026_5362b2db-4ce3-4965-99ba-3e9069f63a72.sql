
-- ============================================================
-- Doctrine §120 Phase B — Self-Enforcement Infrastructure
-- ============================================================

-- 1) Canonical enum registry
CREATE TABLE IF NOT EXISTS public.doctrine_120_canonical_enums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  canonical_values text[] NOT NULL,
  constraint_schema text NOT NULL DEFAULT 'public',
  constraint_table text NOT NULL,
  constraint_name text NOT NULL,
  mcp_tool_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.doctrine_120_canonical_enums TO authenticated;
GRANT ALL ON public.doctrine_120_canonical_enums TO service_role;

ALTER TABLE public.doctrine_120_canonical_enums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read doctrine_120 registry" ON public.doctrine_120_canonical_enums;
CREATE POLICY "Admins read doctrine_120 registry"
  ON public.doctrine_120_canonical_enums
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_owner());

DROP POLICY IF EXISTS "Service role manages doctrine_120 registry" ON public.doctrine_120_canonical_enums;
CREATE POLICY "Service role manages doctrine_120 registry"
  ON public.doctrine_120_canonical_enums
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed canonical lifecycle_stage values (§111 enum)
INSERT INTO public.doctrine_120_canonical_enums (domain, canonical_values, constraint_table, constraint_name, mcp_tool_name, notes)
VALUES (
  'lifecycle_stage',
  ARRAY[
    'new_lead','qualified','nurturing','hot_lead','negotiating','won',
    'client_active','client_paused','client_churned','client_funded','client_alumni'
  ],
  'clients',
  'clients_lifecycle_stage_chk',
  'create_contact',
  'Canonical §111 lifecycle enum. Must be mirrored by CHECK constraint, MCP tool input schema, and any UI dropdown.'
)
ON CONFLICT (domain) DO UPDATE
SET canonical_values = EXCLUDED.canonical_values,
    constraint_table = EXCLUDED.constraint_table,
    constraint_name = EXCLUDED.constraint_name,
    mcp_tool_name = EXCLUDED.mcp_tool_name,
    notes = EXCLUDED.notes,
    updated_at = now();

-- 2) Sweep function: compare each registered constraint to canonical values
CREATE OR REPLACE FUNCTION public.enforce_doctrine_120()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  constraint_def text;
  found_values text[];
  missing text[];
  extra text[];
  drift_count int := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  FOR rec IN
    SELECT * FROM public.doctrine_120_canonical_enums
  LOOP
    SELECT pg_get_constraintdef(c.oid)
      INTO constraint_def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = rec.constraint_schema
       AND t.relname = rec.constraint_table
       AND c.conname = rec.constraint_name
     LIMIT 1;

    IF constraint_def IS NULL THEN
      drift_count := drift_count + 1;
      results := results || jsonb_build_object(
        'domain', rec.domain,
        'status', 'MISSING_CONSTRAINT',
        'constraint', rec.constraint_schema || '.' || rec.constraint_table || '.' || rec.constraint_name
      );
      CONTINUE;
    END IF;

    -- Extract single-quoted literals from the CHECK definition
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1])
      INTO found_values
      FROM regexp_matches(constraint_def, '''([a-z_]+)''', 'g') AS m;

    missing := ARRAY(SELECT unnest(rec.canonical_values) EXCEPT SELECT unnest(COALESCE(found_values, ARRAY[]::text[])));
    extra   := ARRAY(SELECT unnest(COALESCE(found_values, ARRAY[]::text[])) EXCEPT SELECT unnest(rec.canonical_values));

    IF array_length(missing, 1) IS NOT NULL OR array_length(extra, 1) IS NOT NULL THEN
      drift_count := drift_count + 1;
      results := results || jsonb_build_object(
        'domain', rec.domain,
        'status', 'DRIFT',
        'missing_from_db', COALESCE(missing, ARRAY[]::text[]),
        'extra_in_db', COALESCE(extra, ARRAY[]::text[])
      );
    ELSE
      results := results || jsonb_build_object('domain', rec.domain, 'status', 'OK');
    END IF;
  END LOOP;

  IF drift_count > 0 THEN
    INSERT INTO public.paige_admin_notifications (
      kind, severity, title, body, metadata
    ) VALUES (
      'doctrine_120_drift',
      'high',
      'Doctrine §120 drift detected',
      'One or more schema CHECK constraints have drifted from canonical enums. Review and align.',
      jsonb_build_object('results', results, 'detected_at', now())
    );
  END IF;

  RETURN jsonb_build_object('drift_count', drift_count, 'checked_at', now(), 'results', results);
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_doctrine_120() FROM public;
GRANT EXECUTE ON FUNCTION public.enforce_doctrine_120() TO service_role, authenticated;

-- 3) Proposal-time validation: reject proposals using legacy lifecycle labels
CREATE OR REPLACE FUNCTION public.enforce_proposal_doctrine_120()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  canonical text[];
  payload text;
  legacy_labels text[] := ARRAY['lead','prospect','customer','active','churned','alumni','funded','paused'];
  hit text;
BEGIN
  SELECT canonical_values INTO canonical
    FROM public.doctrine_120_canonical_enums
   WHERE domain = 'lifecycle_stage';

  -- Concatenate row to text for a single regex sweep (proposals are small JSONB blobs)
  payload := lower(coalesce(row_to_json(NEW)::text, ''));

  -- Look for "lifecycle_stage": "<legacy>" patterns
  FOREACH hit IN ARRAY legacy_labels LOOP
    IF payload ~ ('"lifecycle_stage"\s*:\s*"' || hit || '"') AND NOT (hit = ANY(canonical)) THEN
      RAISE EXCEPTION 'Doctrine §120 violation: proposal references legacy lifecycle_stage "%". Use canonical §111 values: %', hit, array_to_string(canonical, ', ')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_proposal_doctrine_120() FROM public;

-- Wire triggers
DROP TRIGGER IF EXISTS doctrine_120_subagent_proposal_check ON public.paige_subagent_proposals;
CREATE TRIGGER doctrine_120_subagent_proposal_check
  BEFORE INSERT OR UPDATE ON public.paige_subagent_proposals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_proposal_doctrine_120();

DROP TRIGGER IF EXISTS doctrine_120_skill_proposal_check ON public.paige_skill_proposals;
CREATE TRIGGER doctrine_120_skill_proposal_check
  BEFORE INSERT OR UPDATE ON public.paige_skill_proposals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_proposal_doctrine_120();

-- updated_at trigger on registry
DROP TRIGGER IF EXISTS doctrine_120_touch_updated_at ON public.doctrine_120_canonical_enums;
CREATE TRIGGER doctrine_120_touch_updated_at
  BEFORE UPDATE ON public.doctrine_120_canonical_enums
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
