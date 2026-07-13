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
-- user_roles.user_id has a FK to auth.users, so a synthetic uuid can't be used.
-- Instead pick a REAL authenticated user who already holds the global 'admin'
-- role (every tenant owner is one) but is NOT a platform operator (no super_admin,
-- not the owner_email) — the exact attacker profile, FK-valid. Under the
-- authenticated role, attempt the exploit's final hop: INSERT (self,'super_admin').
-- Nothing commits: the closing RAISE rolls back any test insert. Expect:
-- "PROOF-B PASS ... could NOT insert".
DO $$
DECLARE
  _admin uuid;
  _inserted boolean := false;
BEGIN
  SELECT ur.user_id INTO _admin
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'admin'::public.app_role
    AND NOT EXISTS (SELECT 1 FROM public.user_roles s
                    WHERE s.user_id = ur.user_id AND s.role = 'super_admin'::public.app_role)
    AND lower(u.email) IS DISTINCT FROM
        (SELECT lower(owner_email) FROM public.app_settings_owner LIMIT 1)
  LIMIT 1;

  IF _admin IS NULL THEN
    RAISE EXCEPTION 'PROOF-B SKIP: no non-operator ''admin'' user available to simulate the attacker';
  END IF;

  -- Become that real admin user, under the authenticated role so RLS is enforced.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', _admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_admin, 'super_admin'::public.app_role);
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
-- platform-operator role. Uses a REAL active tenant owner/admin who is NOT a
-- platform operator (no super_admin, not the owner_email) and calls
-- grant_tenant_member_role(self,'platform_admin') for their own tenant. FK-safe
-- (real ids); every write rolls back via the closing RAISE. Expect: "PROOF-C
-- PASS ... refused" with the rejection reason quoting the platform-operator guard.
DO $$
DECLARE
  _admin   uuid;
  _tenant  uuid;
  _granted boolean := false;
  _msg text;
BEGIN
  SELECT tm.user_id, tm.tenant_id INTO _admin, _tenant
  FROM public.tenant_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.status = 'active'
    AND tm.role IN ('owner'::public.tenant_role, 'admin'::public.tenant_role)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles s
                    WHERE s.user_id = tm.user_id AND s.role = 'super_admin'::public.app_role)
    AND lower(u.email) IS DISTINCT FROM
        (SELECT lower(owner_email) FROM public.app_settings_owner LIMIT 1)
  LIMIT 1;

  IF _admin IS NULL THEN
    RAISE EXCEPTION 'PROOF-C SKIP: no non-operator tenant admin/owner available to simulate the attacker';
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', _admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.grant_tenant_member_role(_admin, 'platform_admin'::public.app_role, _tenant, 'proof-c');
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


-- PROOF D — MCP surface (post-DEPLOY, NOT SQL) -------------------------------
-- The paige-mcp surface runs on the service-role key (RLS bypassed), so PROOF
-- A/B/C above do NOT exercise it. This half is verified AFTER `paige-mcp` and
-- `paige-mcp-consent` are DEPLOYED (a green migration alone leaves it open).
--
-- Two checks, both against a real TENANT-OWNER OAuth session (not the platform
-- owner). Substitute a live tenant-owner bearer token for <TENANT_OWNER_JWT> and
-- your project's function origin for <ORIGIN>.
--
-- D1 — consent must NOT grant platform.write to a tenant owner:
--   POST <ORIGIN>/functions/v1/paige-mcp-consent
--     Authorization: Bearer <TENANT_OWNER_JWT>
--     body: { "action":"authorize", "scope":"crm.read platform.write", ... }
--   EXPECT: the response `scopes` array does NOT contain "platform.write"
--           (tier resolves to tenant_owner; platform.* is not auto-granted).
--   Before the fix this returned platform.write; after, it must not.
--
-- D2 — tier gate must DENY the forge tools to a tenant caller:
--   Call tools/call `approve_subagent_proposal` (or propose_subagent) over the
--   MCP endpoint with a tenant-tier OAuth token.
--   EXPECT: denied at the audience-tier gate (god-only) — NOT executed.
--
-- If a live tenant-owner token is not handy, the minimum structural confirm is:
-- fetch the DEPLOYED paige-mcp source and verify propose_subagent /
-- list_subagent_proposals / approve_subagent_proposal now appear in
-- MASTER_ONLY_TOOLS, and paige-mcp-consent step 6 returns `granted: []`.
-- (Structural confirms the right bytes shipped; D1/D2 confirm live behaviour.)
