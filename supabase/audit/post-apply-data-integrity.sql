-- =============================================================================
-- POST-APPLY DATA-INTEGRITY AUDIT — singleton invariants
-- =============================================================================
-- Standalone, read-only, fail-loud audit. Safe to run against ANY live database
-- (prod, BYO post-cutover, staging). It performs NO writes and NO schema changes.
--
-- Origin: these checks were originally in-migration DO-block verification
-- checkpoints that assert on DATA state and therefore fail on a fresh
-- migration-only rebuild (empty DB). Per §213.c — "move fail-loud probes to
-- POST-APPLY audit scripts, not in-migration DO blocks" — they were removed from
-- their migrations and re-homed here:
--   V14 + V15  ← 20260702184358_a1b946ac-...  (SPRINT_211a singleton invariants)
--   V7-rehome  ← 20260702193352_05c5009a-...  (SPRINT 211.b content migration)
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

  -- V7-rehome: the SPRINT 211.b content migration (paige_btf_documents → documents)
  -- moved exactly 1 document row. The original in-migration V7 asserted this on
  -- prod-runtime data and failed the clean replay; re-homed here. On BYO the row
  -- arrives via the Phase-2 `documents` import, so this confirms the import carried
  -- the migrated content. NOTE: the source-side snapshot the migration also ran
  -- (btf_workspace_invites = 2, mma_os_bridge_outbox = 1, paige_btf_documents = 1)
  -- is NOT re-checkable here — those legacy tables were dropped by 211.b — so it
  -- was a prod-at-migration-time §208 purge-guard only; the destination invariant
  -- below is its durable successor.
  SELECT count(*) INTO v_count
  FROM public.documents
  WHERE metadata->>'migration_ship' = 'SPRINT_211_212'
    AND metadata->>'source_table'   = 'paige_btf_documents';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'AUDIT V7-rehome FAIL: expected exactly 1 migrated SPRINT_211_212 document in public.documents, found %', v_count;
  END IF;
  RAISE NOTICE 'AUDIT V7-rehome PASS: exactly 1 migrated SPRINT_211_212 document present.';

  RAISE NOTICE 'POST-APPLY DATA-INTEGRITY AUDIT: all singleton + content-migration invariants hold.';
END $$;
