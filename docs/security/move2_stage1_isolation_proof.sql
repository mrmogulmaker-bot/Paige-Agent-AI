-- Move 2 · Stage 1 — isolation proof. Run AFTER the migration applies.
-- Pattern mirrors Move 1: impersonate a real non-operator tenant admin via
-- set_config('request.jwt.claims',...) + SET LOCAL ROLE authenticated, attempt the
-- now-forbidden action, and expect a raise. Each proof runs inside a transaction that
-- is rolled back, so nothing is mutated. A raised P0001/42501 with the expected message
-- is the PASS signal; reaching the RAISE NOTICE 'UNEXPECTED SUCCESS' is a FAIL.

-- ============================================================================
-- PROOF A (structural) — the gate is operator-only, no longer trusts global 'admin'.
-- ============================================================================
SELECT proname,
       (pg_get_functiondef(oid) ILIKE '%is_platform_admin()%'
        AND pg_get_functiondef(oid) NOT ILIKE '%has_role(auth.uid(), ''admin''%') AS operator_only
FROM pg_proc
WHERE proname = 'revoke_platform_access';
-- EXPECT: operator_only = true for BOTH overloads.

-- Guard trigger present on user_roles:
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.user_roles'::regclass AND tgname = 'trg_guard_last_super_admin';
-- EXPECT: one row.

-- ============================================================================
-- PROOF B — a tenant admin (global 'admin' holder, NON-operator) can no longer
-- call revoke_platform_access. Pick a real non-operator admin + a victim in another tenant.
-- ============================================================================
DO $$
DECLARE
  _attacker uuid;   -- a user holding global 'admin' but NOT platform_admin/super_admin
  _victim   uuid;   -- any other user
BEGIN
  SELECT ur.user_id INTO _attacker
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
    AND NOT EXISTS (SELECT 1 FROM public.user_roles o
                    WHERE o.user_id = ur.user_id AND o.role IN ('super_admin','platform_admin'))
  LIMIT 1;
  SELECT id INTO _victim FROM auth.users WHERE id <> _attacker LIMIT 1;
  IF _attacker IS NULL OR _victim IS NULL THEN
    RAISE NOTICE 'SKIP PROOF B — no suitable non-operator admin / victim in this dataset';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _attacker::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.revoke_platform_access(_victim, 'isolation-proof');
    RESET ROLE;
    RAISE NOTICE 'FAIL PROOF B — UNEXPECTED SUCCESS: non-operator admin nuked another user';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RESET ROLE;
    RAISE EXCEPTION 'PROOF B PASS — non-operator admin denied (%). Rolling back.', SQLERRM
      USING ERRCODE = 'P0001';
  END;
END $$;
-- EXPECT: ERROR "PROOF B PASS — non-operator admin denied ...".

-- ============================================================================
-- PROOF C — the platform operator (owner) CAN still call it (positive control).
-- Rolled back so no real revoke happens.
-- ============================================================================
DO $$
DECLARE
  _owner  uuid;
  _victim uuid;
BEGIN
  SELECT u.id INTO _owner FROM auth.users u
  JOIN public.app_settings_owner o ON o.owner_email = u.email LIMIT 1;
  -- a disposable victim that is NOT the owner
  SELECT id INTO _victim FROM auth.users WHERE id <> _owner LIMIT 1;
  IF _owner IS NULL OR _victim IS NULL THEN
    RAISE NOTICE 'SKIP PROOF C — owner/victim not resolvable'; RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _owner::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.revoke_platform_access(_victim, 'isolation-proof positive control');
  RESET ROLE;
  RAISE EXCEPTION 'PROOF C PASS — operator call succeeded (rolled back).'
    USING ERRCODE = 'P0001';
END $$;
-- EXPECT: ERROR "PROOF C PASS — operator call succeeded (rolled back)."

-- ============================================================================
-- PROOF D — the last-super_admin guard blocks removing the final operator.
-- ============================================================================
DO $$
BEGIN
  -- With exactly one super_admin today, this DELETE must be refused by the guard.
  DELETE FROM public.user_roles WHERE role = 'super_admin';
  RAISE NOTICE 'FAIL PROOF D — UNEXPECTED SUCCESS: last super_admin was deletable';
EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
  RAISE EXCEPTION 'PROOF D PASS — last super_admin delete blocked (%).', SQLERRM
    USING ERRCODE = 'P0001';
END $$;
-- EXPECT: ERROR "PROOF D PASS — last super_admin delete blocked ...".
-- NOTE: once a 2nd break-glass operator is provisioned (count >= 2), PROOF D no longer
-- blocks (by design) — re-scope it to assert count stays >= 1.
