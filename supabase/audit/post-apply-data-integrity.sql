-- =============================================================================
-- POST-APPLY DATA-INTEGRITY AUDIT — singleton invariants
-- =============================================================================
-- Standalone, read-only, fail-loud audit. Safe to run against ANY live database
-- (prod, BYO post-cutover, staging). It performs NO writes and NO schema changes.
--
-- Origin: these checks were originally in-migration DO-block verification
-- checkpoints V14 + V15 of migration
--   supabase/migrations/20260702184358_a1b946ac-338b-4c86-8b70-0850b38b2c8c.sql
-- (SPRINT_211a). They assert on DATA state and therefore fail on a fresh
-- migration-only rebuild (empty DB). Per §213.c — "move fail-loud probes to
-- POST-APPLY audit scripts, not in-migration DO blocks" — they were removed from
-- the migration and re-homed here.
--
-- WHEN TO RUN: after data has been loaded into a target DB — specifically, on BYO
-- after the Phase-2 CSV data import and BEFORE decommissioning Lovable Cloud
-- (Sprint P.S.M Phase-4 cutover checklist).
--
-- Usage:  psql "<connection>" -f supabase/audit/post-apply-data-integrity.sql
--         or paste into the Supabase SQL editor.
-- On success: NOTICEs only, no error. On failure: RAISE EXCEPTION (non-zero exit).
-- =============================================================================
DO $$
DECLARE
  v_count int;
BEGIN
  -- V14: exactly one super_admin in user_roles (the platform owner singleton;
  -- enforced structurally by the `one_super_admin` unique index).
  SELECT count(*) INTO v_count
  FROM public.user_roles
  WHERE role = 'super_admin'::public.app_role;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'AUDIT V14 FAIL: expected exactly 1 super_admin user_roles row, found %', v_count;
  END IF;
  RAISE NOTICE 'AUDIT V14 PASS: exactly 1 super_admin user_roles row.';

  -- V15: exactly one app_settings_owner row (settings-owner singleton;
  -- enforced structurally by the `one_settings_owner_row` unique index).
  SELECT count(*) INTO v_count
  FROM public.app_settings_owner;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'AUDIT V15 FAIL: expected exactly 1 app_settings_owner row, found %', v_count;
  END IF;
  RAISE NOTICE 'AUDIT V15 PASS: exactly 1 app_settings_owner row.';

  RAISE NOTICE 'POST-APPLY DATA-INTEGRITY AUDIT: all singleton invariants hold.';
END $$;
