-- ============================================================================
-- §32.a rollback-proof — Task #126 platform operator workspace tenant
-- ============================================================================
-- Runs the migration's two statements, ASSERTS the intended end-state, prints a
-- proof line, then RAISEs to force a rollback so NOTHING persists.
--
-- HOW TO RUN (§32.a): execute this whole file via the Supabase MCP
-- (mcp__Supabase__execute_sql) against prod (xygzykjyynhzqytbqnzu). MCP runs it
-- inside an implicit transaction; the terminal `RAISE EXCEPTION 'ROLLBACK_PROOF_OK'`
-- aborts that transaction, so this proof is READ-ONLY in effect — it proves the
-- SQL EXECUTES and the assertions hold, and persists no rows. (This is the
-- pre-merge smoke test only; §32 persisted-apply confirmation happens post-merge
-- via the deploy-migrations pipeline / an explicit MCP apply + query.)
-- ============================================================================
DO $$
DECLARE
  v_pinned      constant uuid := 'd1f0a7e2-6c3b-4b9a-9e2d-0a1b2c3d4e5f';
  v_exists      int;
  v_std         int;
  v_parent_null int;
  v_invariant   int;
  v_sysws       int;
  v_setting_ok  int;
  v_setting_val text;
BEGIN
  -- ── Run the migration's two statements ────────────────────────────────────
  INSERT INTO public.tenants (id, slug, name, features)
  VALUES (v_pinned, 'paige-operator-workspace', 'Paige Operator Workspace', '{"system_workspace": true}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_app_settings (key, value, updated_at)
  VALUES ('platform_operator_tenant_id', to_jsonb(v_pinned::text), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

  -- (a) tenant row exists, is standalone, top-level (parent NULL)
  SELECT
    count(*) FILTER (WHERE id = v_pinned),
    count(*) FILTER (WHERE id = v_pinned AND account_type = 'standalone'),
    count(*) FILTER (WHERE id = v_pinned AND parent_tenant_id IS NULL)
  INTO v_exists, v_std, v_parent_null
  FROM public.tenants;

  IF v_exists <> 1 THEN
    RAISE EXCEPTION 'PROOF_FAIL: operator tenant row missing (exists=%)', v_exists;
  END IF;
  IF v_std <> 1 THEN
    RAISE EXCEPTION 'PROOF_FAIL: account_type is not standalone (std=%)', v_std;
  END IF;
  IF v_parent_null <> 1 THEN
    RAISE EXCEPTION 'PROOF_FAIL: parent_tenant_id is not NULL (parent_null=%)', v_parent_null;
  END IF;

  -- (b) §51 invariant: parent NULL OR account_type NOT IN ('agency','enterprise')
  SELECT count(*) INTO v_invariant
  FROM public.tenants
  WHERE id = v_pinned
    AND (parent_tenant_id IS NULL OR account_type NOT IN ('agency', 'enterprise'));
  IF v_invariant <> 1 THEN
    RAISE EXCEPTION 'PROOF_FAIL: §51 invariant violated (invariant=%)', v_invariant;
  END IF;

  -- (b2) system-workspace marker set (§57 exclusion + customer-trigger skip)
  SELECT count(*) INTO v_sysws
  FROM public.tenants
  WHERE id = v_pinned AND coalesce((features->>'system_workspace')::boolean, false) = true;
  IF v_sysws <> 1 THEN
    RAISE EXCEPTION 'PROOF_FAIL: system_workspace marker not set (sysws=%)', v_sysws;
  END IF;

  -- (c) setting now points at the pinned uuid AND that uuid exists in tenants
  SELECT value #>> '{}' INTO v_setting_val
  FROM public.admin_app_settings
  WHERE key = 'platform_operator_tenant_id';

  SELECT CASE
           WHEN v_setting_val = v_pinned::text
                AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_setting_val::uuid)
           THEN 1 ELSE 0
         END
  INTO v_setting_ok;
  IF v_setting_ok <> 1 THEN
    RAISE EXCEPTION 'PROOF_FAIL: setting not re-pointed to a live tenant (setting_val=%, ok=%)',
      v_setting_val, v_setting_ok;
  END IF;

  -- (d) proof line
  RAISE NOTICE 'OPTENANT_PROOF exists=% std=% parent_null=% sysws=% setting_ok=%',
    v_exists, v_std, v_parent_null, v_sysws, v_setting_ok;

  -- Force rollback — persist nothing (§32.a).
  RAISE EXCEPTION 'ROLLBACK_PROOF_OK';
END $$;
