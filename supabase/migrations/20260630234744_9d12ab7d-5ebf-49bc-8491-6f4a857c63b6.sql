
-- 1. Canonical column registry (separate from enum registry)
CREATE TABLE IF NOT EXISTS public.doctrine_120_canonical_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  table_schema text NOT NULL DEFAULT 'public',
  table_name text NOT NULL,
  canonical_columns text[] NOT NULL,
  mcp_tool_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.doctrine_120_canonical_columns TO authenticated;
GRANT ALL ON public.doctrine_120_canonical_columns TO service_role;

ALTER TABLE public.doctrine_120_canonical_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read doctrine_120 column registry"
  ON public.doctrine_120_canonical_columns FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_platform_owner());

CREATE POLICY "Service role manages doctrine_120 column registry"
  ON public.doctrine_120_canonical_columns
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER doctrine_120_cols_touch_updated_at
  BEFORE UPDATE ON public.doctrine_120_canonical_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Seed registry with the recent drift cases (onboarding + F2)
INSERT INTO public.doctrine_120_canonical_columns (domain, table_name, canonical_columns, notes)
VALUES
  ('paige_audit_log_shape', 'paige_audit_log',
   ARRAY['target_type','target_id','payload'],
   'Caused the onboarding RPC failure. Do NOT use entity_type/entity_id/metadata.'),
  ('paige_skills_flags', 'paige_skills',
   ARRAY['mutating','external_send'],
   'F2 audit fix. external_send was previously derived from a missing column.'),
  ('paige_workflow_runs_shape', 'paige_workflow_runs',
   ARRAY['workflow_id','status','output'],
   'Canonical workflow run columns; drift here breaks skill execution audit.')
ON CONFLICT (domain) DO UPDATE
  SET canonical_columns = EXCLUDED.canonical_columns,
      notes = EXCLUDED.notes,
      updated_at = now();

-- 3. Column-existence validator
CREATE OR REPLACE FUNCTION public.enforce_doctrine_120_columns()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  existing text[];
  missing text[];
  drift_count int := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  FOR rec IN SELECT * FROM public.doctrine_120_canonical_columns LOOP
    SELECT array_agg(column_name::text)
      INTO existing
      FROM information_schema.columns
     WHERE table_schema = rec.table_schema
       AND table_name = rec.table_name;

    IF existing IS NULL THEN
      drift_count := drift_count + 1;
      results := results || jsonb_build_object(
        'domain', rec.domain,
        'status', 'MISSING_TABLE',
        'target', rec.table_schema || '.' || rec.table_name
      );
      CONTINUE;
    END IF;

    missing := ARRAY(
      SELECT unnest(rec.canonical_columns)
      EXCEPT
      SELECT unnest(existing)
    );

    IF array_length(missing, 1) IS NOT NULL THEN
      drift_count := drift_count + 1;
      results := results || jsonb_build_object(
        'domain', rec.domain,
        'status', 'DRIFT',
        'target', rec.table_schema || '.' || rec.table_name,
        'missing_columns', missing
      );
    ELSE
      results := results || jsonb_build_object('domain', rec.domain, 'status', 'OK');
    END IF;
  END LOOP;

  IF drift_count > 0 THEN
    INSERT INTO public.paige_admin_notifications (kind, severity, title, body, metadata)
    VALUES (
      'doctrine_120_column_drift',
      'high',
      'Doctrine §120 column drift detected',
      'One or more canonical column names are missing from their target tables. Code referencing them will fail at runtime.',
      jsonb_build_object('results', results, 'detected_at', now())
    );
  END IF;

  RETURN jsonb_build_object('drift_count', drift_count, 'checked_at', now(), 'results', results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_doctrine_120_columns() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_doctrine_120_columns() TO service_role;

-- 4. Combined full sweep
CREATE OR REPLACE FUNCTION public.enforce_doctrine_120_full()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enums_result jsonb;
  cols_result  jsonb;
BEGIN
  enums_result := public.enforce_doctrine_120();
  cols_result  := public.enforce_doctrine_120_columns();
  RETURN jsonb_build_object(
    'enums', enums_result,
    'columns', cols_result,
    'checked_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_doctrine_120_full() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_doctrine_120_full() TO service_role;

-- 5. Weekly cron sweep (Mondays 09:00 UTC) — mirrors §124 / §116 cadence
DO $$
BEGIN
  PERFORM cron.unschedule('doctrine_120_weekly_sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'doctrine_120_weekly_sweep',
  '0 9 * * 1',
  $cron$ SELECT public.enforce_doctrine_120_full(); $cron$
);
