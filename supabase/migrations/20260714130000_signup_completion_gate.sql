-- Signup completion gate (Task #187)
--
-- Owner directive (2026-07-14): "account creation does not happen until after the
-- customer picks which route [account type] they're going to go, then signs the
-- respective agreement. Once that's done, then we can officially create a full
-- account." Plus a hard-stop cancel so an abandoned pre-signup shell never gets
-- stuck in the database as a ghost.
--
-- The single moment a signed-in user becomes a real account is `provision_tenant`
-- (the only caller is the front-door WorkspaceProvisioner; sub-accounts use a
-- separate create_subaccount path). So the gate is enforced HERE, server-side —
-- not merely in the UI — so it cannot be bypassed by calling the RPC directly
-- (§13). provision_tenant now REQUIRES a current lane agreement and records the
-- acceptance in legal_acceptances atomically with tenant creation.
--
-- This migration is purely additive (§12 extend, never rebuild):
--   1. profiles markers (signup lifecycle timestamps + which lane/agreement).
--   2. is_signup_complete(uid) — the one predicate every gate reads.
--   3. provision_tenant(+_agreement_slug,_agreement_version) — agreement-gated,
--      stamps the markers, writes the legal_acceptances row.
-- The agreement CONTENT is seeded in the companion migration
-- 20260714140000_seed_interim_saas_agreements.sql.

BEGIN;

-- 1. Signup lifecycle markers on profiles (all nullable, additive) ------------
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

-- 2. is_signup_complete(uid) — the authoritative completion predicate ---------
-- TRUE iff the user is a REAL account on the platform. A bare OAuth/email shell
-- (a "ghost") reads FALSE.
--
-- CRITICAL: the on_auth_user_created trigger (handle_new_user) auto-grants a
-- baseline 'user' role AND autocreates a self-linked clients row (source
-- 'signup') for EVERY new auth user, and ensure_client_role_self_heal will grant
-- 'client' to anyone carrying a linked clients row. So "has any role", "has a
-- clients row", and even "has the 'client' role" are all TRUE for a ghost and
-- must NOT be used as completion signals. We key only on things a bare signup
-- does NOT produce:
--   * owns a top-level tenant                (never auto-created)
--   * an active tenant_members row           (never auto-created)
--   * a role BEYOND the baseline 'user'/'client' (real staff/operator grant)
--   * a REAL client row: linked, source <> 'signup' (a genuine invited customer,
--     not the autocreated signup contact)
--   * the explicit signup_completed_at marker set by provision_tenant
-- SECURITY DEFINER so it reads across auth-scoped tables uniformly; STABLE.
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
         EXISTS (SELECT 1 FROM public.tenants        t  WHERE t.owner_user_id = _uid)
      OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = _uid AND tm.status = 'active')
      OR EXISTS (SELECT 1 FROM public.user_roles     ur WHERE ur.user_id = _uid AND ur.role NOT IN ('user','client'))
      OR EXISTS (SELECT 1 FROM public.clients        c  WHERE c.linked_user_id = _uid AND coalesce(c.source, '') <> 'signup')
      OR EXISTS (SELECT 1 FROM public.profiles       p  WHERE p.user_id = _uid AND p.signup_completed_at IS NOT NULL)
    );
$$;

COMMENT ON FUNCTION public.is_signup_complete(uuid) IS
  'TRUE iff the user has completed signup (any role, owned/member tenant, linked client, or explicit marker). FALSE = abandoned pre-signup shell.';

REVOKE ALL ON FUNCTION public.is_signup_complete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_signup_complete(uuid) TO authenticated, service_role;

-- Convenience overload for the current caller (used by the router guard/UI).
CREATE OR REPLACE FUNCTION public.is_signup_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.is_signup_complete(auth.uid()); $$;

REVOKE ALL ON FUNCTION public.is_signup_complete() FROM public;
GRANT EXECUTE ON FUNCTION public.is_signup_complete() TO authenticated, service_role;

-- 3. provision_tenant — now agreement-gated + marker-stamping -----------------
-- Two new trailing params (agreement slug + version). Because they change the
-- arg count, CREATE OR REPLACE would leave the old 5-arg overload in place as an
-- UNGATED bypass — so drop it first. The only live caller (WorkspaceProvisioner)
-- is updated in the same PR to pass the agreement.
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, text, text, text);

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

  -- Idempotent: if this user already owns a tenant, they are already a completed
  -- account — return it without re-requiring the agreement (re-entry, not a new
  -- signup). This keeps the front door safe to call twice.
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

  -- HARD STOP (owner directive): a NEW account is created only after the
  -- subscriber has picked a lane AND accepted that lane's current agreement.
  -- Enforced server-side so it cannot be bypassed by calling the RPC directly.
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

  -- Stamp the completion markers on the same profiles row that carries the
  -- active tenant, so is_signup_complete() flips true atomically with creation.
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

  -- Durable legal record of the signed agreement (the same registry the rest of
  -- the platform uses). SECURITY DEFINER bypasses RLS for this insert.
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

-- A DROP+CREATE with a new signature is a brand-new function object, so it
-- inherits the default EXECUTE-to-PUBLIC grant. Restore the least-privilege
-- pattern every prior provision_tenant migration used (the body still raises
-- 28000 for anon, but we don't rely on that for the grant).
REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text, text, text, integer) TO authenticated, service_role;

COMMIT;
