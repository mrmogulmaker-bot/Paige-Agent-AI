-- Recovered from the live migration ledger (supabase_migrations.schema_migrations.statements)
-- and committed for durability: this migration is APPLIED on prod but existed in no git file,
-- so a rebuild-from-git would silently drop it (drift audit 2026-07-14, prod-ahead-of-git).
-- SQL is verbatim from the ledger unless a marked adjustment note says otherwise.

-- Signup completion gate (Task #187) — additive; enforces agreement at account creation.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS signup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version       text,
  ADD COLUMN IF NOT EXISTS signup_lane         text;

COMMENT ON COLUMN public.profiles.signup_completed_at IS
  'Set when provision_tenant officially creates the account (lane picked + agreement signed). NULL = incomplete pre-signup shell.';
COMMENT ON COLUMN public.profiles.terms_version IS
  'The lane agreement accepted at account creation, as "<slug>@<version>" (e.g. saas-agency@1).';
COMMENT ON COLUMN public.profiles.signup_lane IS
  'The account_type the subscriber chose at signup: standalone | agency | enterprise.';

CREATE OR REPLACE FUNCTION public.is_signup_complete(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _uid IS NOT NULL
    AND (
         EXISTS (SELECT 1 FROM public.user_roles    ur WHERE ur.user_id = _uid)
      OR EXISTS (SELECT 1 FROM public.tenants        t WHERE t.owner_user_id = _uid)
      OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = _uid AND tm.status = 'active')
      OR EXISTS (SELECT 1 FROM public.clients        c WHERE c.linked_user_id = _uid)
      OR EXISTS (SELECT 1 FROM public.profiles       p WHERE p.user_id = _uid AND p.signup_completed_at IS NOT NULL)
    );
$$;

COMMENT ON FUNCTION public.is_signup_complete(uuid) IS
  'TRUE iff the user has completed signup (any role, owned/member tenant, linked client, or explicit marker). FALSE = abandoned pre-signup shell.';

REVOKE ALL ON FUNCTION public.is_signup_complete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_signup_complete(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_signup_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.is_signup_complete(auth.uid()); $$;

REVOKE ALL ON FUNCTION public.is_signup_complete() FROM public;
GRANT EXECUTE ON FUNCTION public.is_signup_complete() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provision_tenant(
  _name text,
  _industry text DEFAULT NULL::text,
  _team_size text DEFAULT NULL::text,
  _description text DEFAULT NULL::text,
  _account_type text DEFAULT 'standalone'::text,
  _agreement_slug text DEFAULT NULL::text,
  _agreement_version integer DEFAULT NULL::integer
)
RETURNS tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF _agreement_slug IS NULL OR _agreement_version IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.legal_documents ld
        WHERE ld.slug = _agreement_slug
          AND ld.version = _agreement_version
          AND ld.is_current
     ) THEN
    RAISE EXCEPTION 'You must review and accept the subscriber agreement to create your account'
      USING ERRCODE = 'P0001';
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

  UPDATE public.profiles SET
    active_tenant_id    = _tenant.id,
    signup_completed_at = COALESCE(signup_completed_at, now()),
    terms_accepted_at   = now(),
    terms_version       = _agreement_slug || '@' || _agreement_version::text,
    signup_lane         = _type
  WHERE user_id = _uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, active_tenant_id, signup_completed_at, terms_accepted_at, terms_version, signup_lane)
    VALUES (_uid, _tenant.id, now(), now(), _agreement_slug || '@' || _agreement_version::text, _type);
  END IF;

  INSERT INTO public.legal_acceptances (user_id, document_slug, document_version, context)
  VALUES (
    _uid, _agreement_slug, _agreement_version,
    jsonb_build_object('via', 'provision_tenant', 'lane', _type, 'tenant_id', _tenant.id)
  );

  BEGIN
    INSERT INTO public.platform_usage_events (tenant_id, event_type, quantity, unit, metadata)
    VALUES (
      _tenant.id, 'tenant_provisioned', 1, 'signup',
      jsonb_strip_nulls(jsonb_build_object(
        'account_type', _type,
        'owner_user_id', _uid,
        'tenant_name', _tenant.name,
        'source', 'front_door',
        'agreement', _agreement_slug || '@' || _agreement_version::text
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'signup platform feed (tenant_provisioned) failed: %', SQLERRM;
  END;

  RETURN _tenant;
END;
$function$;

COMMIT;
