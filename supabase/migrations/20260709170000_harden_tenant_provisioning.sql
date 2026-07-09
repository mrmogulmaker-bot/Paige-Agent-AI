-- Hardening for the self-serve tenant provisioning RPCs (verifier findings on
-- commit 7afb6ad): race-safe "one top-level tenant per owner", and a per-parent
-- cap on sub-account creation so an authenticated owner can't loop it to spam
-- child tenants (each call amplifies to tenant + tenant_features + membership).

-- (1) Back the idempotency guarantee with a real constraint. Without this, two
-- concurrent DIFFERENT-name provision_tenant calls both pass the SELECT check
-- and both insert -> one user owns two top-level tenants. NULL owners (rare)
-- and sub-accounts (parent_tenant_id NOT NULL) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_toplevel_per_owner
  ON public.tenants (owner_user_id)
  WHERE parent_tenant_id IS NULL AND owner_user_id IS NOT NULL;

-- (2) Race-safe provision_tenant: on the top-level INSERT, catch a unique
-- violation (from the index above OR a same-name slug collision under a
-- concurrent double-submit) and return the tenant this owner now has.
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

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'tenant'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent call won the race (owner partial-unique index, or a
    -- same-name slug collision on double-submit). Return what this owner has.
    SELECT t.* INTO _tenant
      FROM public.tenants t
     WHERE t.owner_user_id = _uid AND t.parent_tenant_id IS NULL
     ORDER BY t.created_at ASC
     LIMIT 1;
    IF NOT FOUND THEN RAISE; END IF;  -- unrelated collision -> surface it
    UPDATE public.profiles SET active_tenant_id = _tenant.id
     WHERE user_id = _uid AND active_tenant_id IS NULL;
    RETURN _tenant;
  END;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', now());

  UPDATE public.profiles SET active_tenant_id = _tenant.id WHERE user_id = _uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, active_tenant_id) VALUES (_uid, _tenant.id);
  END IF;

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text) TO authenticated;

-- (3) Per-parent sub-account cap. 100 is generous for a real agency while
-- bounding a scripted-loop abuse to a fixed number of child tenants.
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
  _child_count int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'no parent tenant in context' USING ERRCODE = '22000';
  END IF;
  IF NOT public.is_tenant_owner(_uid, _parent) THEN
    RAISE EXCEPTION 'only the tenant owner may create a sub-account' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'sub-account name required' USING ERRCODE = '22000';
  END IF;

  SELECT count(*) INTO _child_count FROM public.tenants WHERE parent_tenant_id = _parent;
  IF _child_count >= 100 THEN
    RAISE EXCEPTION 'sub-account limit (100) reached for this workspace' USING ERRCODE = '54000';
  END IF;

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'subaccount'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

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
