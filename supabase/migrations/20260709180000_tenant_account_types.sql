-- Account types at the front door: standalone · agency · enterprise.
--
-- A tenant's account_type is a pure CAPABILITY flag (billing/offers are defined
-- later and layer on top):
--   standalone  -> one workspace, full admin, no sub-accounts (individual practice)
--   agency      -> may create & manage sub-accounts (runs multiple client businesses)
--   enterprise  -> agency capabilities + room for higher limits / white-label
-- Upgradeable anytime (set_tenant_account_type) with no data migration — a
-- standalone can grow into an agency by flipping this flag.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'standalone';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_account_type_chk') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_account_type_chk
      CHECK (account_type IN ('standalone', 'agency', 'enterprise'));
  END IF;
END $$;

-- provision_tenant gains _account_type. Adding a parameter changes the
-- function's (name, arg-types) identity, so CREATE OR REPLACE alone would add a
-- second overload — drop the old 4-arg signature first.
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, text, text);

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

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text, text) TO authenticated;

-- create_subaccount: only agency/enterprise parents may spawn children.
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

  -- Sub-accounts default to 'standalone' (a leaf workspace); the parent agency
  -- can upgrade one later if it needs its own children.
  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
  VALUES (
    _slug, trim(_name), _uid, _parent, 'active', 'standalone',
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

-- Owner-only upgrade/downgrade of a tenant's account type (the "flip a flag"
-- upgrade path). No billing gate yet — offers layer on later.
CREATE OR REPLACE FUNCTION public.set_tenant_account_type(
  _tenant_id uuid,
  _account_type text
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _type text := lower(coalesce(_account_type, ''));
  _tenant public.tenants;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _type NOT IN ('standalone', 'agency', 'enterprise') THEN
    RAISE EXCEPTION 'invalid account type' USING ERRCODE = '22000';
  END IF;
  IF NOT public.is_tenant_owner(_uid, _tenant_id) THEN
    RAISE EXCEPTION 'only the tenant owner may change the account type' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenants SET account_type = _type WHERE id = _tenant_id
  RETURNING * INTO _tenant;
  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_account_type(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_tenant_account_type(uuid, text) TO authenticated;
