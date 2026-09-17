-- #826 — the setup-completion marker trigger, proven on the replayed schema.
--
-- House pgTAP style (synthetic fixtures, always rolled back). Three assertions
-- matching the adversarial review's MAJOR-1/MAJOR-2 contract:
--   1. a successful business-context SAVE fires the marker (the fix works);
--   2. register_solo_setup_managed_email ALONE does not (the second writer the
--      bare trigger would have mis-fired on — the gate must NOT open on email
--      registration);
--   3. a FAILED save leaves the marker unset (transactional rollback holds).
--
-- The save RPC requires an authenticated owner with a JWT claim; pgTAP runs
-- unauthenticated, so the RPC path is driven as the service role and the
-- trigger's own scope is what these assertions exercise through the table
-- semantics the RPC uses: INSERT-then-revision-bump for a save, column-only
-- UPDATE for registration.
BEGIN;

SELECT plan(3);

-- Fixture: a standalone solo tenant + owner.
DO $$
DECLARE
  _t uuid := gen_random_uuid();
  _u uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_u, 'marker-probe@example.test');
  INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features)
  VALUES (_t, 'marker-probe', 'Marker Probe Co', 'active', 'standalone', 'MPB', '{}');
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner)
  VALUES (_t, _u, 'owner', 'active', true);
END $$;

-- 1. THE SAVE SHAPE (insert + revision bump in one transaction) fires the marker.
DO $$
DECLARE _t uuid; _before text;
BEGIN
  SELECT id INTO _t FROM public.tenants WHERE slug = 'marker-probe';
  -- The save RPC's first-save shape: INSERT (revision 0) then the bump.
  INSERT INTO public.tenant_setup_business_context_meta (tenant_id)
  VALUES (_t);
  UPDATE public.tenant_setup_business_context_meta
  SET revision = revision + 1, updated_at = now() WHERE tenant_id = _t;
  SELECT coalesce(features->>'solo_setup_complete','false') INTO _before
  FROM public.tenants WHERE id = _t;
  IF _before <> 'true' THEN
    RAISE EXCEPTION 'marker-probe: the save shape did not set solo_setup_complete';
  END IF;
END $$;
SELECT ok(true, 'a successful save (insert + revision bump) records solo_setup_complete');

-- 2. THE REGISTRATION SHAPE (managed-email insert / column-only update) does NOT.
DO $$
DECLARE _t uuid; _other uuid; _v text;
BEGIN
  SELECT id INTO _t FROM public.tenants WHERE slug = 'marker-probe';
  -- The register RPC's insert (no revision change) must not fire (insert arm
  -- removed). Then its column-only update must not either (no revision bump).
  INSERT INTO public.tenant_setup_business_context_meta (tenant_id)
  VALUES (_t) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.tenant_setup_business_context_meta
  SET managed_email_local_part = 'probe'
  WHERE tenant_id = _t;
  -- A FRESH tenant so the marker's absence is unambiguous: registration alone.
  _other := gen_random_uuid();
  INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features)
  VALUES (_other, 'marker-probe-2', 'Marker Probe 2', 'active', 'standalone', 'MP2', '{}');
  INSERT INTO public.tenant_setup_business_context_meta (tenant_id)
  VALUES (_other);
  UPDATE public.tenant_setup_business_context_meta
  SET managed_email_local_part = 'probe2'
  WHERE tenant_id = _other;
  SELECT coalesce(features->>'solo_setup_complete','false') INTO _v
  FROM public.tenants WHERE id = _other;
  IF _v = 'true' THEN
    RAISE EXCEPTION 'marker-probe: registration alone opened the gate (the MAJOR-1 regression)';
  END IF;
END $$;
SELECT ok(true, 'registration alone (managed-email writes, no revision bump) does NOT set the marker');

-- 3. A FAILED SAVE (exception mid-transaction) leaves the marker unset.
DO $$
DECLARE _t uuid; _v text;
BEGIN
  SELECT id INTO _t FROM public.tenants WHERE slug = 'marker-probe';
  BEGIN
    UPDATE public.tenant_setup_business_context_meta
    SET revision = revision + 1 WHERE tenant_id = _t;
    RAISE EXCEPTION 'simulated post-bump failure';
  EXCEPTION WHEN OTHERS THEN
    -- The subtransaction rolled back: the marker set by THIS bump is gone.
    NULL;
  END;
  SELECT coalesce(features->>'solo_setup_complete','false') INTO _v
  FROM public.tenants WHERE id = _t;
  -- The marker from proof 1 persists (set-once); assert the FAILED bump did not
  -- need to re-set it — clear it first to make the rollback observable.
  UPDATE public.tenants SET features = features - 'solo_setup_complete' WHERE id = _t;
  BEGIN
    UPDATE public.tenant_setup_business_context_meta
    SET revision = revision + 1 WHERE tenant_id = _t;
    RAISE EXCEPTION 'simulated second failure';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  SELECT coalesce(features->>'solo_setup_complete','false') INTO _v
  FROM public.tenants WHERE id = _t;
  IF _v = 'true' THEN
    RAISE EXCEPTION 'marker-probe: a failed save persisted the marker';
  END IF;
END $$;
SELECT ok(true, 'a failed save (rolled-back bump) leaves the marker unset');

SELECT * FROM finish();
ROLLBACK;
