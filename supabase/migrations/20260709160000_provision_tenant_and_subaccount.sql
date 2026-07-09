-- Self-serve tenant provisioning + sub-account creation (§9 platform/tenant seam).
--
-- Until now a new tenant could only be born from the platform-owner surface
-- (tenants INSERT is RLS-gated to is_platform_owner()). The front-door signup
-- had no way to create one, so every self-serve signup fell through to the
-- consumer client portal. These two SECURITY DEFINER RPCs are the missing
-- provisioning primitives: the front door calls provision_tenant (the signer
-- becomes a top-level tenant OWNER); a tenant owner calls create_subaccount to
-- spin up child tenants under their own.
--
-- The exact "functioning owner" recipe (verified against the live schema):
--   1. tenants row with owner_user_id = the user, parent_tenant_id = NULL.
--      -> trg_tenant_set_account_number_prefix auto-derives account_number_prefix
--      -> trg_tenants_ensure_features auto-creates the (all-false, coaching-
--         generic) tenant_features row.
--   2. tenant_members row (role='owner', status='active').
--      -> sync_tenant_member_to_user_roles maps owner->admin and grants the
--         'admin' app_role, which is what resolveLandingRoute routes to /admin
--         (tenant-scoped; the operator console stays behind super_admin).
--   3. profiles.active_tenant_id = the new tenant, so current_user_tenant_id()
--      resolves for RLS (belt-and-suspenders: the tenant_members row is already
--      a fallback in current_user_tenant_id()).
--
-- The owner-column guard (guard_tenant_owner_only_columns) fires BEFORE UPDATE
-- only, so setting owner_user_id / parent_tenant_id on INSERT is unguarded.
-- RLS on tenants does not apply inside these SECURITY DEFINER functions (owned
-- by a superuser role).

-- ---------------------------------------------------------------------------
-- provision_tenant: the signer becomes a brand-new top-level tenant owner.
-- Idempotent — a double-submit / re-entered signup returns the existing tenant
-- instead of minting a duplicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant(
  _name text,
  _industry text DEFAULT NULL,
  _team_size text DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'business name required' USING ERRCODE = '22000';
  END IF;

  -- Idempotent: already owns a top-level tenant -> return it, ensure the
  -- active workspace points at it, and stop (never mint a duplicate).
  SELECT t.* INTO _tenant
    FROM public.tenants t
   WHERE t.owner_user_id = _uid AND t.parent_tenant_id IS NULL
   ORDER BY t.created_at ASC
   LIMIT 1;
  IF FOUND THEN
    UPDATE public.profiles SET active_tenant_id = _tenant.id
     WHERE user_id = _uid AND active_tenant_id IS NULL;
    RETURN _tenant;
  END IF;

  -- Unique slug from the business name.
  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'tenant'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  -- Create the tenant (account_number_prefix + tenant_features via triggers).
  -- 14-day trial by default; the operator can adjust from the Fleet Console.
  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, trial_ends_at, brand)
  VALUES (
    _slug, trim(_name), _uid, NULL, 'trial', now() + interval '14 days',
    jsonb_strip_nulls(jsonb_build_object(
      'industry', _industry,
      'team_size', _team_size,
      'about', _description
    ))
  )
  RETURNING * INTO _tenant;

  -- Owner membership -> sync trigger grants the 'admin' app_role.
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', now());

  -- Point their active workspace at the new tenant (create the profile row if
  -- one doesn't exist yet — profiles only requires user_id).
  UPDATE public.profiles SET active_tenant_id = _tenant.id WHERE user_id = _uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, active_tenant_id) VALUES (_uid, _tenant.id);
  END IF;

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_subaccount: a tenant OWNER spins up a child tenant under their own.
-- The creating owner also owns the sub-account (they operate their whole tree);
-- staff can be invited into it afterward via the existing invite flow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_subaccount(
  _name text,
  _industry text DEFAULT NULL,
  _description text DEFAULT NULL,
  _parent_tenant_id uuid DEFAULT NULL
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _parent uuid := COALESCE(_parent_tenant_id, public.current_user_tenant_id());
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'no parent tenant in context' USING ERRCODE = '22000';
  END IF;
  -- Only the OWNER of the parent tenant may create a sub-account under it.
  IF NOT public.is_tenant_owner(_uid, _parent) THEN
    RAISE EXCEPTION 'only the tenant owner may create a sub-account' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'sub-account name required' USING ERRCODE = '22000';
  END IF;

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'subaccount'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  -- parent_tenant_id set on INSERT (owner-column guard is UPDATE-only;
  -- tenants_prevent_cycle validates hierarchy depth/cycles here).
  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, brand)
  VALUES (
    _slug, trim(_name), _uid, _parent, 'active',
    jsonb_strip_nulls(jsonb_build_object('industry', _industry, 'about', _description))
  )
  RETURNING * INTO _tenant;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', now());

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subaccount(text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_subaccount(text, text, text, uuid) TO authenticated;
