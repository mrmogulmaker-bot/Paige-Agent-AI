-- =============================================================================
-- Signup acceptance gating — SLICE 1: deferred provisioning
-- (§9 tenant/consent isolation · §13 honest+world-class · §18 one-home reuse ·
--  §37 producer inventory · §51 per-tier)
-- =============================================================================
-- WHAT THIS SLICE DOES (additive; ZERO user-facing behavior change for COMPLETING
-- signups). The single intended behavior change: an ABANDONED (never-completing)
-- signup no longer even ATTEMPTS an un-consented CRM `clients` contact — because
-- the trigger no longer writes one at all.
--
-- Live prod ground-truth verified BEFORE writing (ref xygzykjyynhzqytbqnzu):
--   * handle_new_user() is DEFINED with 3 inserts: profiles shell (KEEP), user_roles
--     ('user'), and a self-linked `clients` row (source='signup', NO tenant_id).
--   * MIGRATIONS DECLARE the trigger `on_auth_user_created AFTER INSERT ON auth.users
--     EXECUTE handle_new_user()` (20250908112334 / 20251009234919), and NO migration
--     ever DROPs it. That is the authoritative migration-declared contract this file
--     is built to — a fresh `supabase db reset` binds the trigger and the function
--     fires per signup.
--   * PROD-DRIFT — this migration FIXES it (§13/§32, VERIFIED live): on the CURRENT
--     prod DB the trigger was ABSENT (auth.users carried only RI constraint triggers;
--     pg_trigger showed handle_new_user bound to NOTHING) — wiped out-of-band (known
--     Supabase auth-schema drift), so handle_new_user had NOT run for weeks. Live
--     evidence: 0 clients with source='signup' (3 total, all 'manual'); 0 user_roles
--     rows with role='user'; profiles(7) < auth.users(14) — 7 orphan users with no
--     shell (admin@paigeagent.ai, tashiaanderson@me.com, both Google/OAuth signups,
--     etc.). Step 5 RECREATES the trigger (bound to the new bare body) and step 6
--     BACKFILLS the 7 missing shells — turning this from a doctrine-cosmetic change
--     into a real prod-bug fix. Session-critical resolvers already null-handle a
--     missing shell (current_user_tenant_id COALESCEs to the tenant_members fallback;
--     get_paige_persona_context reads clients then that resolver, RETURNs empty on
--     NULL) so the orphans degraded (no persisted profile state) rather than crashed.
--   * is_signup_complete() predicate is UNCHANGED here (enforcement flip is Slice 4);
--     it does NOT read the 'user' role, so deferral never affects the gate.
--   * All role readers degrade gracefully on a MISSING user_roles row:
--       has_role() -> SELECT EXISTS (false, never errors)
--       useUserRoles / resolveLandingRoute -> `data || []` (completers route via
--       tenant membership, NOT the 'user' role).
--     => The interim "signed-in, not-yet-completed, no role" state is SAFE.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. handle_new_user(): a brand-new auth.users row now yields ONLY a profiles
--    shell. REMOVE the user_roles('user') insert AND the entire self-linked
--    clients insert block. KEEP the paige.link_ok GUC and the exact profiles
--    insert columns/values. SECURITY DEFINER + search_path='' preserved.
--    The deferred 'user' role is (re)created at COMPLETION (step 3) so a
--    completing signup ends up exactly as it does today.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref_code  text;
  v_full_name text;
begin
  -- #612: allowlist this postgres-owned linker so the clients linking-integrity
  -- trigger never blocks the signup auto-create (txn-local; auto-clears at commit).
  -- KEPT verbatim: harmless now, and preserved for the profiles-shell insert path
  -- and any downstream linking trigger that inspects it.
  perform set_config('paige.link_ok', '1', true);

  v_ref_code  := nullif(upper(trim(new.raw_user_meta_data->>'referral_code')), '');
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');

  -- The ONLY footprint a brand-new auth user gets: the profiles shell.
  -- (columns/values identical to the pre-Slice-1 trigger.)
  insert into public.profiles (user_id, full_name, referral_code)
  values (new.id, nullif(v_full_name, ''), v_ref_code);

  -- REMOVED (Slice 1): the user_roles('user') insert  -> deferred to completion
  --                    (record_signup_acceptance / provision_tenant[_as]).
  -- REMOVED (Slice 1): the self-linked clients CRM contact (source='signup') ->
  --                    an un-consented contact for a user who has not accepted /
  --                    completed. Owner ruling: do NOT resurrect it anywhere.

  return new;
end;
$function$;

-- Trigger binding is UNCHANGED (we only replace the function body).

-- -----------------------------------------------------------------------------
-- 2. record_signup_acceptance(): the ONE finalizer all future acceptance paths
--    (Slices 2-4: email-link, OAuth consent) converge on. SECURITY DEFINER.
--    Idempotent; safe to call once per acceptance and safe to call twice.
--
--    Subject resolution (§9 anti-spoof): a JWT caller may finalize ONLY itself
--    (auth.uid()); a service_role caller (a webhook-driven provision) may pass
--    _uid. A JWT caller passing a foreign _uid is rejected.
--
--    Does: (a) stamp profiles.terms_accepted_at = COALESCE(existing, now()) and
--    terms_version = COALESCE(existing, '<current general terms>'); (b) insert an
--    idempotent general-terms legal_acceptances row; (c) create user_roles('user')
--    IF NOT EXISTS (the deferred role); (d) NO self-linked clients contact (owner
--    ruling); (e) fire the post-acceptance WELCOME email via the existing
--    send-transactional-email seam (§18) using the established vault + net.http_post
--    deferred-send pattern (growth_fire_submission_processor / readiness cron).
--
--    NOTE (§13 honesty): the welcome step reuses the platform's vault-secret
--    dispatch pattern; it degrades to a logged no-op when project_url/service_role_key
--    are not seeded (same as every other SQL->edge fire on this platform). In Slice 1
--    NO live path calls this finalizer yet (the completing path stays behavior-minimal
--    — step 3), so this welcome is DORMANT until Slices 2-4 wire a live caller. It is
--    built complete here so those slices only add the call.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_signup_acceptance(_uid uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid          uuid;
  v_terms_ver    integer;
  v_terms_str    text;
  v_email        text;
  v_first        text;
  v_edge_url     text;
  v_service_key  text;
begin
  -- (§9) Resolve the subject — never trust a spoofable param for a JWT caller.
  if auth.uid() is not null then
    if _uid is not null and _uid <> auth.uid() then
      raise exception 'cannot record acceptance for another user'
        using errcode = '42501';
    end if;
    v_uid := auth.uid();
  elsif coalesce(auth.role(), '') = 'service_role' and _uid is not null then
    v_uid := _uid;
  else
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Current general Terms of Service version (data-driven, not hardcoded).
  select ld.version into v_terms_ver
    from public.legal_documents ld
   where ld.slug = 'terms' and ld.is_current
   order by ld.version desc
   limit 1;
  if v_terms_ver is null then
    v_terms_ver := 1;
  end if;
  v_terms_str := 'terms@' || v_terms_ver::text;

  -- (a) Stamp acceptance — COALESCE so we never clobber a more-specific
  --     agreement version already stamped by provision_tenant.
  update public.profiles
     set terms_accepted_at = coalesce(terms_accepted_at, now()),
         terms_version     = coalesce(terms_version, v_terms_str)
   where user_id = v_uid;
  -- profiles shell is guaranteed by handle_new_user; if somehow absent, no-op.

  -- (b) Idempotent general-terms acceptance row (append-only legal trail).
  insert into public.legal_acceptances (user_id, document_slug, document_version, context)
  select v_uid, 'terms', v_terms_ver,
         jsonb_build_object('via', 'record_signup_acceptance')
  where not exists (
    select 1 from public.legal_acceptances la
     where la.user_id = v_uid
       and la.document_slug = 'terms'
       and la.document_version = v_terms_ver
  );

  -- (c) Deferred base role (moved out of the trigger). IF NOT EXISTS via ON CONFLICT.
  insert into public.user_roles (user_id, role)
  values (v_uid, 'user')
  on conflict (user_id, role) do nothing;

  -- (d) NO self-linked clients contact — owner ruling: do not resurrect the
  --     un-consented insert here or anywhere.

  -- (e) Post-acceptance WELCOME email via send-transactional-email (§18 reuse).
  --     Established vault + net.http_post deferred-send; degrades to a logged
  --     no-op when the secrets are not seeded (§13). Never blocks acceptance.
  begin
    select decrypted_secret into v_edge_url
      from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into v_service_key
      from vault.decrypted_secrets where name = 'service_role_key' limit 1;

    if v_edge_url is null or v_service_key is null then
      raise notice 'record_signup_acceptance: welcome skipped — vault project_url/service_role_key not seeded';
    else
      select u.email, coalesce(nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''), '')
        into v_email, v_first
        from auth.users u
        left join public.profiles p on p.user_id = u.id
       where u.id = v_uid;

      if v_email is not null then
        perform net.http_post(
          url := rtrim(v_edge_url, '/') || '/functions/v1/send-transactional-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object(
            'templateName', 'welcome',
            'recipientEmail', v_email,
            'idempotencyKey', 'welcome-signup-' || v_uid::text,
            'templateData', jsonb_build_object('name', v_first)
          )
        );
      end if;
    end if;
  exception when others then
    -- An email hiccup must NEVER break acceptance/provisioning.
    raise warning 'record_signup_acceptance: welcome email failed: %', sqlerrm;
  end;
end;
$function$;

REVOKE ALL ON FUNCTION public.record_signup_acceptance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_signup_acceptance(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Wire the COMPLETING paths so a completing signup still ends up with the
--    base 'user' role (deferred out of the trigger). BEHAVIOR-PRESERVING:
--    the only delta to each completion path is the base-role INSERT (restoring
--    exactly what the trigger used to grant) + provision_tenant's terms stamp
--    switched to COALESCE (functionally identical — terms_accepted_at is not set
--    before this point on the self-serve path).
--
--    We INLINE the role restore (rather than call the finalizer) to keep the
--    completion paths behavior-minimal — no new legal rows, no email change on
--    the money path. record_signup_acceptance stays the standalone future seam.
--
--    Both functions are re-emitted VERBATIM from the live prod definition with
--    ONLY the two documented deltas, preserving SECURITY DEFINER + search_path.
-- -----------------------------------------------------------------------------

-- 3a. provision_tenant (self-serve owner onboarding).
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

  -- Slice 1 (signup deferral): (re)grant the base 'user' role at completion —
  -- the grant the handle_new_user trigger owns under the migration-declared
  -- contract (moved out of the trigger). Idempotent. (Prod-drift note in header:
  -- the trigger is currently absent on prod, so this also forward-corrects the
  -- missing base role for completing owners.)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

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

-- 3b. provision_tenant_as (§37 producer inventory — the paid/webhook completion
--     twin, called by stripe-webhook with the service role. It ALSO relied solely
--     on the trigger for the base 'user' role. Same idempotent restore.)
CREATE OR REPLACE FUNCTION public.provision_tenant_as(_owner uuid, _name text DEFAULT NULL::text, _account_type text DEFAULT 'standalone'::text)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _tenant public.tenants;
  _display text;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _type text := lower(coalesce(_account_type, 'standalone'));
begin
  if _owner is null then
    raise exception 'owner required' using errcode = '22004';
  end if;
  if _type not in ('standalone', 'agency', 'enterprise') then
    _type := 'standalone';
  end if;

  -- Slice 1 (signup deferral): restore the base 'user' role for the paid path too,
  -- regardless of whether the tenant is new or pre-existing (idempotent). Placed
  -- up front so BOTH the found-branch and the create-branch cover it.
  insert into public.user_roles (user_id, role)
  values (_owner, 'user')
  on conflict (user_id, role) do nothing;

  select t.* into _tenant
    from public.tenants t
   where t.owner_user_id = _owner and t.parent_tenant_id is null
   order by t.created_at asc
   limit 1;
  if found then
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
      values (_tenant.id, _owner, 'owner', 'active', true, now())
      on conflict (tenant_id, user_id) do nothing;
    return _tenant;
  end if;

  _display := coalesce(
    nullif(trim(_name), ''),
    nullif(trim((select full_name from public.profiles where user_id = _owner)), '') || '''s Workspace',
    'My Workspace'
  );

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_display)), '[^a-z0-9]+', '-', 'g'));
  if _base_slug is null or length(_base_slug) = 0 then _base_slug := 'tenant'; end if;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  while exists (select 1 from public.tenants where slug = _slug) loop
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  end loop;

  begin
    insert into public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
    values (_slug, _display, _owner, null, 'active', _type, '{}'::jsonb)
    returning * into _tenant;
  exception when unique_violation then
    select t.* into _tenant
      from public.tenants t
     where t.owner_user_id = _owner and t.parent_tenant_id is null
     order by t.created_at asc
     limit 1;
    if not found then raise; end if;
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    return _tenant;
  end;

  insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
  values (_tenant.id, _owner, 'owner', 'active', true, now())
  on conflict (tenant_id, user_id) do nothing;

  update public.profiles set
    active_tenant_id    = _tenant.id,
    signup_completed_at = coalesce(signup_completed_at, now())
  where user_id = _owner;
  if not found then
    insert into public.profiles (user_id, active_tenant_id, signup_completed_at)
    values (_owner, _tenant.id, now())
    on conflict (user_id) do update set active_tenant_id = excluded.active_tenant_id;
  end if;

  begin
    insert into public.platform_usage_events (tenant_id, event_type, quantity, metadata)
    values (
      _tenant.id, 'tenant_provisioned', 1,
      jsonb_build_object('via', 'platform_subscription_webhook', 'account_type', _type)
    );
  exception when others then null; end;

  return _tenant;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 4. DEFENSIVE phantom cleanup (DR / replay parity). Matches 0 rows on CURRENT
--    prod (VERIFIED: 3 clients total, 0 with source='signup', 0 candidates). It
--    exists so a replay/restore that ran the OLD trigger before this migration
--    cannot leave an un-consented signup contact behind. Tightly scoped so it can
--    NEVER touch a source='manual' contact (guarded by source='signup') nor a
--    provisioned/accepted account's contact (guarded by the two NOT EXISTS: an
--    active tenant membership OR a stamped terms acceptance both spare the row).
-- -----------------------------------------------------------------------------
DELETE FROM public.clients c
 WHERE c.source = 'signup'
   AND c.linked_user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = c.linked_user_id AND tm.status = 'active'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.profiles p
      WHERE p.user_id = c.linked_user_id AND p.terms_accepted_at IS NOT NULL
   );

-- -----------------------------------------------------------------------------
-- 5. RECREATE the on_auth_user_created trigger (RESOLVES the prod drift documented
--    in the header). Migrations declared this trigger (20250908112334 /
--    20251009234919) and never dropped it, yet it is ABSENT on prod — wiped
--    out-of-band, so handle_new_user has not run for weeks (0 role='user' rows;
--    7 auth users with no profiles shell — admin@paigeagent.ai, both Google/OAuth
--    signups, tashiaanderson@me.com, etc.). We bind the trigger to the NEW bare
--    body (single profiles-shell insert; NO role, NO self-link client — no side
--    effects, no swallowed exception, no missing column), so from db-push forward
--    every new signup deterministically gets exactly one profiles shell.
--    Signature matches the original verbatim (AFTER INSERT ... FOR EACH ROW).
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 6. BACKFILL the missing profiles shells (Grandfather B). Column shape matches
--    handle_new_user's insert EXACTLY (user_id, full_name, referral_code + casts).
--    Idempotent via NOT EXISTS + ON CONFLICT — creates ONLY the missing shells
--    (verified 7 on current prod). This gives the signup gate a row to stamp; it
--    deliberately does NOT set terms_accepted_at — all 14 users keep NULL and
--    force-accept on next login (§13: no fabricated consent).
-- -----------------------------------------------------------------------------
INSERT INTO public.profiles (user_id, full_name, referral_code)
SELECT u.id,
       nullif(u.raw_user_meta_data->>'full_name', ''),
       nullif(upper(trim(u.raw_user_meta_data->>'referral_code')), '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
