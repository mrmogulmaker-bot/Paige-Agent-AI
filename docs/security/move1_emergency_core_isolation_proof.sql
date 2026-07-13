-- Move 1 emergency-core — isolation proof (Task #207)
-- ---------------------------------------------------------------------------
-- HOW TO RUN: paste each block into the Supabase SQL editor and run it.
-- This is NOT a migration — it lives under docs/, never auto-applies. Every
-- behavioural block ends by RAISING an exception, so it ROLLS ITSELF BACK: no
-- test row is ever committed to production, whatever the outcome. You read the
-- verdict in the error message ("... PASS ..." or "... FAIL ...").
--
-- GOLD-STANDARD (optional): run PROOF B once BEFORE applying the migration — it
-- should report FAIL (the hole is open, proving the test can detect it) — then
-- apply 20260713160000_move1_privesc_emergency_core.sql and run it again — it
-- should report PASS. A test that only ever passes proves nothing.
-- ===========================================================================


-- PROOF A — structural (read-only, safe, commits nothing) --------------------
-- Confirms the migration actually landed: the self-insert policy is gone and the
-- grant function carries the new platform-operator guard. Expect: 0 and true.
SELECT
  (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'user_roles'
       AND policyname = 'Admins can manage all roles')                       AS old_policy_rows_expect_0,
  (SELECT pg_get_functiondef(
            'public.grant_tenant_member_role(uuid,public.app_role,uuid,text)'::regprocedure)
          LIKE '%platform-operator role here%')                              AS grant_guard_present_expect_true;


-- PROOF B — behavioural keystone (rolls itself back) -------------------------
-- Simulates a global-'admin' identity (which every tenant owner automatically
-- is) and attempts the exact exploit final hop: INSERT (self,'super_admin') into
-- user_roles as the authenticated role, subject to RLS. Uses a synthetic uuid so
-- it never touches real data; the closing RAISE rolls back the synthetic admin
-- row and any test insert. Expect: "PROOF-B PASS ... could NOT insert".
DO $$
DECLARE
  _fake uuid := '00000000-0000-0000-0000-0000000000ff';
  _inserted boolean := false;
BEGIN
  -- Seed a synthetic global-admin identity (rolled back with everything else).
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_fake, 'admin'::public.app_role) ON CONFLICT DO NOTHING;

  -- Become that user, under the authenticated role so RLS is enforced.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', _fake::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_fake, 'super_admin'::public.app_role);
    _inserted := true;                    -- reached only if RLS ALLOWED it => hole OPEN
  EXCEPTION WHEN insufficient_privilege THEN
    _inserted := false;                   -- RLS denied => keystone holds
  END;

  RESET ROLE;

  RAISE EXCEPTION 'PROOF-B %: authenticated global-admin % self-insert (self, super_admin) into user_roles',
    CASE WHEN _inserted THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN _inserted THEN 'COULD'  ELSE 'could NOT' END;
END $$;


-- PROOF C — behavioural, grant escalation cut (rolls itself back) ------------
-- Proves grant_tenant_member_role now refuses a non-owner minting a
-- platform-operator role. Simulates a synthetic tenant admin (member+admin of a
-- throwaway tenant) and calls grant_tenant_member_role(self,'platform_admin').
-- Expect: "PROOF-C PASS ... refused". All synthetic rows roll back.
DO $$
DECLARE
  _fake   uuid := '00000000-0000-0000-0000-0000000000fe';
  _tenant uuid := '00000000-0000-0000-0000-00000000fe00';
  _granted boolean := false;
  _msg text;
BEGIN
  -- Synthetic tenant + this user as its active admin member (all rolled back).
  INSERT INTO public.tenants (id, name, slug, owner_user_id)
  VALUES (_tenant, 'proof-c-tenant', 'proof-c-'||substr(_tenant::text,1,8), _fake)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_fake, 'admin'::public.app_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
  VALUES (_tenant, _fake, 'admin'::public.tenant_role, 'active', now(), now())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', _fake::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.grant_tenant_member_role(_fake, 'platform_admin'::public.app_role, _tenant, 'proof-c');
    _granted := true;                     -- reached only if the guard let it through => escalation OPEN
  EXCEPTION WHEN OTHERS THEN
    _granted := false;                    -- rejected => escalation cut
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
  END;

  RESET ROLE;

  RAISE EXCEPTION 'PROOF-C %: non-owner tenant admin % self-grant platform_admin (rejection: %)',
    CASE WHEN _granted THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN _granted THEN 'COULD' ELSE 'was REFUSED —' END,
    COALESCE(_msg, 'n/a');
END $$;
