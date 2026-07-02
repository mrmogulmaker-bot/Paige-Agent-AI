-- Ship #2.6 — Legacy MMA Table Deprecation (Doctrine §198)
-- Four SECURITY DEFINER RPCs, each gated to super_admin. No table drops here —
-- the orchestrator edge function calls these RPCs when Antonio pulls each trigger.

-- ─────────────────────────────────────────────────────────────
-- Helper: assert caller is super_admin
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ship26_assert_super_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'ship_26: super_admin required';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._ship26_assert_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ship26_assert_super_admin() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- PHASE 2: Dependency integrity check (read-only)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ship_26_check_dependencies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fks jsonb;
  policies jsonb;
  row_counts jsonb;
BEGIN
  PERFORM public._ship26_assert_super_admin();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_table', tc.table_schema || '.' || tc.table_name,
    'from_column', kcu.column_name,
    'to_table',   ccu.table_schema || '.' || ccu.table_name,
    'constraint', tc.constraint_name
  )), '[]'::jsonb)
  INTO fks
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_schema = 'public'
    AND ccu.table_name IN ('subscription_plans', 'user_subscriptions');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', schemaname || '.' || tablename,
    'policy', policyname
  )), '[]'::jsonb)
  INTO policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('subscription_plans', 'user_subscriptions');

  SELECT jsonb_build_object(
    'subscription_plans',   (SELECT count(*) FROM public.subscription_plans),
    'user_subscriptions',   (SELECT count(*) FROM public.user_subscriptions)
  ) INTO row_counts;

  RETURN jsonb_build_object(
    'phase', 'check_dependencies',
    'checked_at', now(),
    'row_counts', row_counts,
    'foreign_keys_referencing', fks,
    'rls_policies', policies,
    'clear_to_freeze', (jsonb_array_length(fks) = 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ship_26_check_dependencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ship_26_check_dependencies() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- PHASE 3: Freeze writes (revoke INSERT/UPDATE/DELETE, keep SELECT)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ship_26_freeze_legacy_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  frozen_at timestamptz := now();
  snapshot jsonb;
BEGIN
  PERFORM public._ship26_assert_super_admin();

  -- Snapshot row counts at freeze for the drop-phase invariant check
  SELECT jsonb_build_object(
    'subscription_plans', (SELECT count(*) FROM public.subscription_plans),
    'user_subscriptions', (SELECT count(*) FROM public.user_subscriptions)
  ) INTO snapshot;

  REVOKE INSERT, UPDATE, DELETE ON public.subscription_plans FROM anon, authenticated, service_role;
  REVOKE INSERT, UPDATE, DELETE ON public.user_subscriptions FROM anon, authenticated, service_role;

  INSERT INTO public.paige_audit_log (actor_user_id, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid(),
    'ship_26.freeze_writes',
    'legacy_table',
    'subscription_plans+user_subscriptions',
    jsonb_build_object(
      'frozen_at', frozen_at,
      'row_snapshot', snapshot,
      'doctrine', '§198',
      'observation_window_days', 7
    )
  );

  RETURN jsonb_build_object(
    'phase', 'freeze_writes',
    'frozen_at', frozen_at,
    'row_snapshot', snapshot,
    'earliest_drop_at', frozen_at + interval '7 days'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ship_26_freeze_legacy_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ship_26_freeze_legacy_tables() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- PHASE 4: Drop tables (with 7-day + row-invariant guards)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ship_26_drop_legacy_tables(_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  freeze_row public.paige_audit_log%ROWTYPE;
  frozen_at timestamptz;
  freeze_snapshot jsonb;
  current_counts jsonb;
  dropped_at timestamptz := now();
BEGIN
  PERFORM public._ship26_assert_super_admin();

  SELECT * INTO freeze_row
  FROM public.paige_audit_log
  WHERE action = 'ship_26.freeze_writes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF freeze_row.id IS NULL THEN
    RAISE EXCEPTION 'ship_26: no freeze_writes audit row found — run freeze phase first';
  END IF;

  frozen_at := (freeze_row.metadata->>'frozen_at')::timestamptz;
  freeze_snapshot := freeze_row.metadata->'row_snapshot';

  IF NOT _force AND frozen_at > now() - interval '7 days' THEN
    RAISE EXCEPTION 'ship_26: freeze younger than 7 days (frozen_at=%). Pass _force=true only with written approval.', frozen_at;
  END IF;

  SELECT jsonb_build_object(
    'subscription_plans', (SELECT count(*) FROM public.subscription_plans),
    'user_subscriptions', (SELECT count(*) FROM public.user_subscriptions)
  ) INTO current_counts;

  IF NOT _force AND current_counts <> freeze_snapshot THEN
    RAISE EXCEPTION 'ship_26: row counts drifted since freeze. snapshot=% current=%. Investigate before drop.',
      freeze_snapshot::text, current_counts::text;
  END IF;

  INSERT INTO public.paige_audit_log (actor_user_id, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid(),
    'ship_26.drop_tables',
    'legacy_table',
    'subscription_plans+user_subscriptions',
    jsonb_build_object(
      'dropped_at', dropped_at,
      'freeze_snapshot', freeze_snapshot,
      'final_counts', current_counts,
      'forced', _force,
      'doctrine', '§198'
    )
  );

  DROP TABLE IF EXISTS public.user_subscriptions CASCADE;
  DROP TABLE IF EXISTS public.subscription_plans CASCADE;

  RETURN jsonb_build_object(
    'phase', 'drop_tables',
    'dropped_at', dropped_at,
    'freeze_snapshot', freeze_snapshot,
    'final_counts', current_counts,
    'forced', _force
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ship_26_drop_legacy_tables(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ship_26_drop_legacy_tables(boolean) TO authenticated, service_role;
