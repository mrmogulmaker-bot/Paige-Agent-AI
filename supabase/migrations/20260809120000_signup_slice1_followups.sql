-- =============================================================================
-- Signup Slice 1 — §39 fast-follows (#64): concurrency + insert-symmetry hardening
-- (§9 · §13 · §32 · §37)
-- =============================================================================
-- Two non-blocking follow-ups on the merged Slice 1 (20260808190000). Additive,
-- behavior-preserving; no new user-facing behavior.
--
-- FIX 1 (MEDIUM — ensure_provisioning_entitlements race). The finalizer guarded its
--   user_subscriptions insert with INSERT..WHERE NOT EXISTS, but user_subscriptions
--   has its PK on `id` and NO unique on user_id, so two concurrent consent calls could
--   BOTH pass the NOT EXISTS check and double-insert a 'free'/'trial' row.
--   PROD EVIDENCE (verified read-only, ref xygzykjyynhzqytbqnzu):
--     * 0 users have >1 user_subscriptions row (8 rows / 8 distinct users — exactly
--       1 per user today).
--     * §37 inventory of EVERY user_subscriptions inserter:
--         - create_free_trial()  -> 1 row per NEW profile (cascade), guarded by Slice 1.
--         - ensure_provisioning_entitlements() -> the racy insert being fixed here.
--         - stripe-webhook -> `.upsert({user_id...}, { onConflict: "user_id" })` — this
--           ALREADY targets user_id and is currently INVALID without a unique on user_id
--           (42P10). The index below also REPAIRS that latent webhook bug.
--         - check-subscription -> `.update().eq('user_id',...)` (single row).
--       No path legitimately creates multiple subscription rows per user.
--   => A UNIQUE INDEX on user_subscriptions(user_id) is safe AND already required by
--      an existing consumer. With it, the finalizer switches to ON CONFLICT (user_id)
--      DO NOTHING — atomic, race-safe. create_free_trial()'s plain insert is also made
--      ON CONFLICT (user_id) DO NOTHING so the new constraint can NEVER turn a cascade
--      into a throw that breaks a profiles insert (§37: no half-hardened constraint).
--
-- FIX 2 (LOW — provision_tenant legal insert symmetry). The finalizer's
--   legal_acceptances insert is ON CONFLICT (backed by the Slice 1 unique index
--   legal_acceptances_user_doc_version_uidx); provision_tenant's subscriber-agreement
--   insert was a plain insert. Make it ON CONFLICT (user_id, document_slug,
--   document_version) DO NOTHING for defense/symmetry. Nothing else in provision_tenant
--   changes (re-emitted verbatim from current prod + this single delta).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- FIX 1a. UNIQUE index on user_subscriptions(user_id). Plain (not CONCURRENTLY —
--   we are in a migration txn; the table is tiny). IF NOT EXISTS = idempotent.
--   Verified 0 duplicate user_id rows on prod, so creation cannot fail on dups.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_id_uidx
  ON public.user_subscriptions (user_id);

-- -----------------------------------------------------------------------------
-- FIX 1b. ensure_provisioning_entitlements(): race-safe subscription insert via
--   ON CONFLICT (user_id) DO NOTHING (was INSERT..WHERE NOT EXISTS). Everything
--   else identical to the merged Slice 1 body.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_provisioning_entitlements(_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan text;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  -- Race-safe now that user_subscriptions carries UNIQUE(user_id): two concurrent
  -- consent calls can no longer both pass a NOT EXISTS check and double-insert.
  INSERT INTO public.user_subscriptions (user_id, plan_slug, status, trial_ends_at)
  VALUES (_uid, 'free', 'trial', now() + interval '14 days')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_usage (user_id, disputes_used, ai_chats_used)
  VALUES (_uid, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT plan_slug INTO _plan
  FROM public.user_subscriptions
  WHERE user_id = _uid
  LIMIT 1;

  INSERT INTO public.user_business_limits (user_id, max_businesses)
  VALUES (_uid, public.default_max_businesses_for_plan(_plan))
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

-- -----------------------------------------------------------------------------
-- FIX 1c. create_free_trial(): re-emitted VERBATIM from current prod (with the
--   Slice 1 defer guard) + ONLY making its user_subscriptions insert ON CONFLICT
--   (user_id) DO NOTHING, so the new UNIQUE(user_id) can never turn a legitimate
--   cascade into a unique_violation that would abort the triggering profiles insert
--   (§37 — every inserter must be compatible with the constraint).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_free_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- (§9) Defer un-consented provisioning: a bare-shell signup / backfill sets this
  -- GUC so no trial/usage is spawned before consent. Entitlements are created
  -- explicitly at consent by public.ensure_provisioning_entitlements().
  IF coalesce(current_setting('paige.defer_provisioning', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  -- Create free trial subscription (14 days). ON CONFLICT: constraint-safe under
  -- the new UNIQUE(user_id) (#64) — a repeat cascade is a no-op, never a throw.
  INSERT INTO public.user_subscriptions (user_id, plan_slug, status, trial_ends_at)
  VALUES (NEW.user_id, 'free', 'trial', now() + interval '14 days')
  ON CONFLICT (user_id) DO NOTHING;

  -- Create usage tracking. ON CONFLICT: constraint-safe under the pre-existing
  -- user_usage_user_id_key (#64 §37) — a repeat cascade is a no-op, never a throw
  -- that would abort the triggering profiles insert. Matches ensure_provisioning_entitlements.
  INSERT INTO public.user_usage (user_id, disputes_used, ai_chats_used)
  VALUES (NEW.user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- FIX 2. provision_tenant(): re-emitted VERBATIM from current prod (it already
--   carries the Slice 1 deltas — up-front role restore, ensure call, terms COALESCE)
--   + ONLY making the subscriber-agreement legal_acceptances insert ON CONFLICT
--   (user_id, document_slug, document_version) DO NOTHING, matching the finalizer
--   and backed by the Slice 1 unique index legal_acceptances_user_doc_version_uidx.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant(_name text, _industry text DEFAULT NULL::text, _team_size text DEFAULT NULL::text, _description text DEFAULT NULL::text, _account_type text DEFAULT 'standalone'::text, _agreement_slug text DEFAULT NULL::text, _agreement_version integer DEFAULT NULL::integer)
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

  -- Slice 1 (signup deferral, L1 symmetry): (re)grant the base 'user' role UP FRONT
  -- — the grant the handle_new_user trigger owns under the migration-declared
  -- contract (moved out of the trigger). Placed before the idempotent found-branch
  -- early-return so BOTH an already-provisioned owner AND a first-time completer end
  -- up with the base role (mirrors provision_tenant_as). Idempotent; on prod (trigger
  -- currently absent) this also forward-corrects the missing base role.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- (§9) EXPLICIT provisioning entitlements. In the deferred-signup world the shell
  -- was created bare (cascade guarded), and provision_tenant UPDATEs that existing
  -- shell rather than INSERTing — so the trial/usage/limit cascade does NOT fire at
  -- provision time. Create them explicitly & idempotently, up front like the role.
  PERFORM public.ensure_provisioning_entitlements(_uid);

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

  -- Slice A: mint the owner membership WITH the authoritative is_owner=true.
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', true, now());
  -- (Base 'user' role already restored up front — L1 symmetry.)

  UPDATE public.profiles SET
    active_tenant_id    = _tenant.id,
    signup_completed_at = COALESCE(signup_completed_at, now()),
    terms_accepted_at   = COALESCE(terms_accepted_at, now()),  -- Slice 1: COALESCE
    terms_version       = _agreement_slug || '@' || _agreement_version::text,
    signup_lane         = _type
  WHERE user_id = _uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, active_tenant_id, signup_completed_at, terms_accepted_at, terms_version, signup_lane)
    VALUES (_uid, _tenant.id, now(), now(), _agreement_slug || '@' || _agreement_version::text, _type);
  END IF;

  -- FIX 2 (#64): ON CONFLICT DO NOTHING for defense/symmetry with the finalizer,
  -- backed by legal_acceptances_user_doc_version_uidx (Slice 1). Only delta here.
  INSERT INTO public.legal_acceptances (user_id, document_slug, document_version, context)
  VALUES (
    _uid, _agreement_slug, _agreement_version,
    jsonb_build_object('via', 'provision_tenant', 'lane', _type, 'tenant_id', _tenant.id)
  )
  ON CONFLICT (user_id, document_slug, document_version) DO NOTHING;

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
