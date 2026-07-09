-- Run every sign-up back to the God account (platform owner).
--
-- platform_usage_events is the operator's own stream: RLS lets ONLY the platform
-- owner read across all tenants (a tenant sees only its own rows), so it's the
-- correct, leak-proof channel for "the operator sees every new account." We do
-- NOT use paige_admin_notifications for this — its scope='admin' rows are visible
-- to any user holding the 'admin' app_role, and every tenant owner has that role,
-- so it would spill one tenant's signup to all the others (a §9 seam break).
--
-- provision_tenant / create_subaccount are SECURITY DEFINER, so they can write
-- the event even though the signing user can't (RLS restricts writes to the
-- platform owner). The insert is wrapped so a feed hiccup can never block a
-- signup — it warns to the log instead of aborting the provision.

CREATE OR REPLACE FUNCTION public.provision_tenant(
  _name text,
  _industry text DEFAULT NULL,
  _team_size text DEFAULT NULL,
  _description text DEFAULT NULL,
  _account_type text DEFAULT 'standalone'
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _type text := lower(coalesce(_account_type, 'standalone'));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'business name required' USING ERRCODE = '22000';
  END IF;
  IF _type NOT IN ('standalone', 'agency', 'enterprise') THEN
    _type := 'standalone';
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
    INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, trial_ends_at, account_type, brand)
    VALUES (
      _slug, trim(_name), _uid, NULL, 'trial', now() + interval '14 days', _type,
      jsonb_strip_nulls(jsonb_build_object(
        'industry', _industry,
        'team_size', _team_size,
        'about', _description
      ))
    )
    RETURNING * INTO _tenant;
  EXCEPTION WHEN unique_violation THEN
    SELECT t.* INTO _tenant
      FROM public.tenants t
     WHERE t.owner_user_id = _uid AND t.parent_tenant_id IS NULL
     ORDER BY t.created_at ASC
     LIMIT 1;
    IF NOT FOUND THEN RAISE; END IF;
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

  -- Signup event -> the operator's platform stream (God-account visibility).
  BEGIN
    INSERT INTO public.platform_usage_events (tenant_id, event_type, quantity, unit, metadata)
    VALUES (
      _tenant.id, 'tenant_provisioned', 1, 'signup',
      jsonb_strip_nulls(jsonb_build_object(
        'account_type', _type,
        'owner_user_id', _uid,
        'tenant_name', _tenant.name,
        'source', 'front_door'
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'signup platform feed (tenant_provisioned) failed: %', SQLERRM;
  END;

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text, text) TO authenticated;

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
  _parent_type text;
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

  SELECT account_type INTO _parent_type FROM public.tenants WHERE id = _parent;
  IF _parent_type NOT IN ('agency', 'enterprise') THEN
    RAISE EXCEPTION 'sub-accounts require an Agency or Enterprise account' USING ERRCODE = '42501';
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

  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
  VALUES (
    _slug, trim(_name), _uid, _parent, 'active', 'standalone',
    jsonb_strip_nulls(jsonb_build_object('industry', _industry, 'about', _description))
  )
  RETURNING * INTO _tenant;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', now());

  -- Sub-account creation is also a signup the operator should see.
  BEGIN
    INSERT INTO public.platform_usage_events (tenant_id, event_type, quantity, unit, metadata)
    VALUES (
      _tenant.id, 'subaccount_provisioned', 1, 'signup',
      jsonb_strip_nulls(jsonb_build_object(
        'account_type', _tenant.account_type,
        'owner_user_id', _uid,
        'tenant_name', _tenant.name,
        'parent_tenant_id', _parent,
        'source', 'agency_console'
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'signup platform feed (subaccount_provisioned) failed: %', SQLERRM;
  END;

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subaccount(text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_subaccount(text, text, text, uuid) TO authenticated;
