-- CANONICAL SOLO PROVISIONING CONTRACT (PR 3) — behavioural proof on the
-- replayed schema. House pgTAP style: synthetic fixtures, always rolled back.
--
-- Proves the invariant end-to-end for every producer plus the fail-closed
-- conditions: a standalone provision that is not canonically routable (wrong
-- type, parented, no account_number, no is_owner membership, no features row)
-- FAILS the provision rather than returning success.
BEGIN;

SELECT plan(10);

-- Fixture: a user to own provisions + a current legal doc for the public path.
DO $$
DECLARE
  _u uuid := '9c900000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_u, 'pr3-probe@example.test');
  INSERT INTO public.legal_documents (slug, version, title, body_md, is_current)
  VALUES ('saas-standalone', 1, 'PR3 probe agreement', '# Probe agreement body', true)
  ON CONFLICT DO NOTHING;
END $$;

-- 1. HAPPY PATH — the shared primitive (paid path's seam): provision_tenant_as
--    creates a standalone tenant that passes the canonical contract.
DO $$
DECLARE
  _u uuid := '9c900000-0000-0000-0000-000000000001';
  _t public.tenants;
BEGIN
  SELECT * INTO _t FROM public.provision_tenant_as(_u, 'PR3 Probe Co', 'standalone');
  IF _t.account_type <> 'standalone' OR _t.parent_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'pr3: wrong structural shape from provision_tenant_as';
  END IF;
  -- The contract itself passes (this is what the producer now calls).
  PERFORM public.assert_canonical_solo_tenant(_t);
END $$;
SELECT ok(true, 'provision_tenant_as (paid-path primitive) produces a canonically valid standalone tenant');

-- 2. The PUBLIC path (provision_tenant) with a real JWT + accepted agreement.
--    FRESH user: the user from test 1 already owns a top-level tenant, so
--    reusing them would only exercise the found-branch — the create path
--    (agreement gate, slug/membership/profile writes, the assert) must run.
DO $$
DECLARE
  _u uuid := '9c900000-0000-0000-0000-000000000006';
  _t public.tenants;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_u, 'pr3-public@example.test');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true);
  -- Accept the agreement first (the RPC validates a current doc).
  INSERT INTO public.legal_acceptances (user_id, document_slug, document_version, context)
  VALUES (_u, 'saas-standalone', 1, jsonb_build_object('via', 'pr3-probe'))
  ON CONFLICT DO NOTHING;
  SELECT * INTO _t FROM public.provision_tenant('PR3 Public Co', NULL, NULL, NULL, 'standalone', 'saas-standalone', 1);
  IF _t.name <> 'PR3 Public Co' THEN
    RAISE EXCEPTION 'pr3: provision_tenant hit the found-branch (test 2 must create)';
  END IF;
  PERFORM public.assert_canonical_solo_tenant(_t);
END $$;
SELECT ok(true, 'provision_tenant (public signup, fresh user) exercises the CREATE path and produces a canonical tenant');

-- 3. The OPERATOR path (with an owner named) — including the is_owner fix.
DO $$
DECLARE
  _actor uuid := '9c900000-0000-0000-0000-000000000002';
  _owner uuid := '9c900000-0000-0000-0000-000000000003';
  _t public.tenants;
  _is_owner boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_actor, 'pr3-op@example.test'), (_owner, 'pr3-owner@example.test');
  -- Clear any transaction-local JWT first (test 2's claim would make this a
  -- plain authenticated context and trip the §53 guard).
  PERFORM set_config('request.jwt.claims', '', true);
  -- Grant the protected role from a no-JWT context: the §53 guard permits
  -- super_admin grants from a trusted server context (auth.role() NULL), and
  -- refuses them from a plain authenticated JWT — the same seeding every
  -- platform bootstrap uses. The claim is set only AFTER the grant.
  INSERT INTO public.user_roles (user_id, role) VALUES (_actor, 'super_admin');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor, 'role', 'authenticated')::text, true);
  SELECT * INTO _t FROM public.operator_provision_tenant('PR3 Op Co', NULL, _owner);
  SELECT tm.is_owner INTO _is_owner FROM public.tenant_members tm WHERE tm.tenant_id = _t.id AND tm.user_id = _owner;
  IF coalesce(_is_owner, false) <> true THEN
    RAISE EXCEPTION 'pr3: operator membership missing is_owner=true (the historical defect)';
  END IF;
  PERFORM public.assert_canonical_solo_tenant(_t);
END $$;
SELECT ok(true, 'operator_provision_tenant (owner named) produces a canonically valid tenant with is_owner=true');

-- 4. FAIL-CLOSED: parented "standalone" is rejected. A REAL parent row:
--    parent_tenant_id carries an FK (ON DELETE RESTRICT), so a synthetic id
--    would abort the transaction before the rejection is ever exercised.
DO $$
DECLARE
  _t public.tenants;
  _parent public.tenants;
BEGIN
  INSERT INTO public.tenants (slug, name, account_type)
  VALUES ('pr3-parent-agency', 'Parent Agency Probe', 'agency') RETURNING * INTO _parent;
  INSERT INTO public.tenants (slug, name, account_type, parent_tenant_id)
  VALUES ('pr3-parented', 'Parented Probe', 'standalone', _parent.id)
  RETURNING * INTO _t;
  BEGIN
    PERFORM public.assert_canonical_solo_tenant(_t);
    RAISE EXCEPTION 'pr3: parented standalone was NOT rejected';
  EXCEPTION WHEN others THEN
    IF sqlerrm NOT LIKE 'CANONICAL_SOLO_PROVISION_INVALID%' THEN RAISE; END IF;
  END;
END $$;
SELECT ok(true, 'fail-closed: a parented standalone is rejected');

-- 5. FAIL-CLOSED: wrong account_type through the solo lane is rejected.
DO $$
DECLARE
  _t public.tenants;
BEGIN
  INSERT INTO public.tenants (slug, name, account_type) VALUES ('pr3-agency', 'Agency Probe', 'agency') RETURNING * INTO _t;
  BEGIN
    PERFORM public.assert_canonical_solo_tenant(_t);
    RAISE EXCEPTION 'pr3: agency-type tenant was NOT rejected by the solo contract';
  EXCEPTION WHEN others THEN
    IF sqlerrm NOT LIKE 'CANONICAL_SOLO_PROVISION_INVALID%' THEN RAISE; END IF;
  END;
END $$;
SELECT ok(true, 'fail-closed: a non-standalone type is rejected by the solo contract');

-- 6. FAIL-CLOSED: missing is_owner membership (the operator defect shape).
DO $$
DECLARE
  _t public.tenants;
  _u uuid := '9c900000-0000-0000-0000-000000000004';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_u, 'pr3-noown@example.test');
  INSERT INTO public.tenants (slug, name, account_type) VALUES ('pr3-noown', 'No-Owner Probe', 'standalone') RETURNING * INTO _t;
  -- The historical operator shape: role='owner' but is_owner omitted (defaults false).
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at) VALUES (_t.id, _u, 'owner', 'active', now());
  BEGIN
    PERFORM public.assert_canonical_solo_tenant(_t);
    RAISE EXCEPTION 'pr3: a false-is_owner membership was NOT rejected';
  EXCEPTION WHEN others THEN
    IF sqlerrm NOT LIKE 'CANONICAL_SOLO_PROVISION_INVALID%' THEN RAISE; END IF;
  END;
END $$;
SELECT ok(true, 'fail-closed: role=owner without is_owner=true is rejected (the operator defect)');

-- 7. FAIL-CLOSED: missing tenant_features support row.
DO $$
DECLARE
  _t public.tenants;
  _u uuid := '9c900000-0000-0000-0000-000000000005';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_u, 'pr3-nofeat@example.test');
  INSERT INTO public.tenants (slug, name, account_type) VALUES ('pr3-nofeat', 'No-Feature Probe', 'standalone') RETURNING * INTO _t;
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES (_t.id, _u, 'owner', 'active', true, now());
  DELETE FROM public.tenant_features WHERE tenant_id = _t.id;  -- simulate the failed durable write
  BEGIN
    PERFORM public.assert_canonical_solo_tenant(_t);
    RAISE EXCEPTION 'pr3: a missing tenant_features row was NOT rejected';
  EXCEPTION WHEN others THEN
    IF sqlerrm NOT LIKE 'CANONICAL_SOLO_PROVISION_INVALID%' THEN RAISE; END IF;
  END;
END $$;
SELECT ok(true, 'fail-closed: a missing tenant_features support row is rejected');

-- 8. IDEMPOTENCY: the paid primitive returns the SAME tenant on retry (no duplicate).
DO $$
DECLARE
  _u uuid := '9c900000-0000-0000-0000-000000000001';
  _a public.tenants; _b public.tenants; _n int;
BEGIN
  SELECT * INTO _a FROM public.provision_tenant_as(_u, 'PR3 Probe Co', 'standalone');
  SELECT * INTO _b FROM public.provision_tenant_as(_u, 'PR3 Retry Co', 'standalone');
  SELECT count(*) INTO _n FROM public.tenants WHERE owner_user_id = _u AND parent_tenant_id IS NULL;
  IF _a.id <> _b.id OR _n <> 1 THEN
    RAISE EXCEPTION 'pr3: retry created a second tenant';
  END IF;
END $$;
SELECT ok(true, 'idempotency: provision_tenant_as retry returns the same tenant (no duplicate)');

-- 9. §59 surface: the assert is producer-invoked only.
SELECT ok(NOT has_function_privilege('anon', 'public.assert_canonical_solo_tenant(public.tenants)', 'EXECUTE'),
          'anon cannot reach the provisioning assert');
SELECT ok(NOT has_function_privilege('authenticated', 'public.assert_canonical_solo_tenant(public.tenants)', 'EXECUTE'),
          'browser callers cannot reach the provisioning assert');

SELECT * FROM finish();
ROLLBACK;
