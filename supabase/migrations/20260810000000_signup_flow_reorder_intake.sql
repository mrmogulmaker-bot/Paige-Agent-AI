-- =============================================================================
-- Signup flow reorder — staging row + paid-path provisioning context (task #66)
-- (§9 tenant/consent isolation · §13 world-class+honest · §18 one-home reuse ·
--  §32 idempotent-on-replay · §37 producer inventory · §51 per-tier)
-- =============================================================================
-- WHY. The finalized owner-ruled signup flow is:
--   pricing (pick tier) → signup (email/OAuth) → /onboarding (business-context,
--   tier FIXED from plan) → accept Terms (clickwrap, logged to OUR db) → Stripe
--   checkout (card-on-file 14-day trial) → /welcome (webhook-verified) → /admin.
--
-- The COMPLIANCE requirement: a paid customer's business context + terms
-- acceptance must be captured in OUR database BEFORE the Stripe hop and used to
-- provision the RIGHT tenant (correct account_type, real name, real industry) —
-- not lost to Stripe metadata and not hardcoded to null/standalone in the webhook.
--
-- THIS MIGRATION adds two things, both additive and behavior-preserving for every
-- existing path:
--   (1) public.signup_intake — a per-user STAGING ROW the /onboarding step upserts
--       (business context + chosen plan + derived account_type + accepted
--       agreement) and the stripe-webhook reads (service role) to provision
--       correctly on payment. RLS: a user reads/writes ONLY their own row; the
--       webhook reads via service_role (RLS-exempt). A consumed_at column marks it
--       spent after provision (audit trail, §13 — not hard-deleted).
--   (2) provision_tenant_as(...) EXTENDED to accept the staged business context +
--       agreement, so the webhook's onboarding arm stops hardcoding _name:null /
--       _account_type:'standalone' and instead provisions the tenant with the real
--       staged values + writes the subscriber-agreement legal_acceptances row
--       (idempotent, ON CONFLICT DO NOTHING — safe to double-write with the
--       accept-time frontend write). §32 idempotent on webhook replay.
--
-- §37 producer inventory for provision_tenant_as (verified this session):
--   * The ONLY runtime caller is supabase/functions/stripe-webhook (onboarding arm).
--   * platform-subscription-checkout only MENTIONS it in comments (no call).
--   * No trigger / view / cron / pg_net depends on it.
--   => Safe to DROP the old (uuid,text,text) signature and replace with the
--      extended one; the webhook is updated in the same PR to pass the new args.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. signup_intake — the pre-provision STAGING ROW (§18: no existing surface
--    stages business-context + plan + agreement before provisioning; profiles is
--    the durable auth-user record and has no "consumed" concept, so a dedicated
--    one-row-per-user table is the correct home, §12).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signup_intake (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_slug         text,
  billing_period    text,
  account_type      text,
  business_name     text,
  industry          text,
  team_size         text,
  who_you_help      text,
  agreement_slug    text,
  agreement_version integer,
  terms_accepted_at timestamptz,
  consumed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_intake IS
  'Per-user staging row for the paid signup flow (task #66): the /onboarding step '
  'upserts business context + chosen plan + derived account_type + accepted '
  'agreement here BEFORE the Stripe hop; the stripe-webhook reads it (service role) '
  'to provision the correct tenant on payment, then stamps consumed_at. RLS: a user '
  'reads/writes only their own row.';

ALTER TABLE public.signup_intake ENABLE ROW LEVEL SECURITY;

-- A user may INSERT/UPDATE/SELECT only their OWN staging row (§9). No DELETE grant
-- (the row is retained + consumed for audit, §13). The webhook uses the service
-- role, which is RLS-exempt, so it needs no policy.
DROP POLICY IF EXISTS signup_intake_select_own ON public.signup_intake;
CREATE POLICY signup_intake_select_own ON public.signup_intake
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS signup_intake_insert_own ON public.signup_intake;
CREATE POLICY signup_intake_insert_own ON public.signup_intake
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS signup_intake_update_own ON public.signup_intake;
CREATE POLICY signup_intake_update_own ON public.signup_intake
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.signup_intake FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.signup_intake TO authenticated;
GRANT ALL ON public.signup_intake TO service_role;

-- Keep updated_at fresh on every UPDATE (upserts included), independent of the
-- client payload. Reuses a tiny standard touch function (created IF absent).
CREATE OR REPLACE FUNCTION public.tg_signup_intake_touch()
 RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_signup_intake_touch ON public.signup_intake;
CREATE TRIGGER trg_signup_intake_touch
  BEFORE UPDATE ON public.signup_intake
  FOR EACH ROW EXECUTE FUNCTION public.tg_signup_intake_touch();

-- -----------------------------------------------------------------------------
-- 2. provision_tenant_as(...) — EXTENDED with the staged business context +
--    agreement. Re-emitted VERBATIM from the merged Slice 1 body
--    (20260808190000 L528-629) with ONLY these deltas:
--      (a) new params _industry / _team_size / _description / _agreement_slug /
--          _agreement_version (all default NULL — backward compatible values);
--      (b) an up-front idempotent subscriber-agreement legal_acceptances insert
--          (ON CONFLICT DO NOTHING, backed by legal_acceptances_user_doc_version_uidx)
--          when an agreement is supplied — the webhook backstop for the accept-time
--          frontend write (double-write is safe);
--      (c) the created tenant's brand JSONB now carries industry/team_size/about
--          (was '{}') and the profiles stamp mirrors provision_tenant
--          (signup_lane + terms_version/terms_accepted_at COALESCE);
--      (d) richer platform_usage_events metadata.
--    Everything else (base-role restore, ensure_provisioning_entitlements, the
--    idempotent found-branch, slug generation, tenant status 'active', membership
--    with is_owner=true) is IDENTICAL. §32 idempotent on webhook replay.
--
--    NOTE (deliberate, §31/§13): tenant status stays 'active' exactly as the
--    current onboarding provision does — the 14-day card-on-file trial lives on the
--    Stripe subscription (trialing) + platform_subscriptions.status='trialing'.
--    Changing tenant status to 'trial' here is out of scope and would risk leaving
--    onboarding tenants stuck in trial (the onboarding arm never flips it back).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.provision_tenant_as(uuid, text, text);

CREATE OR REPLACE FUNCTION public.provision_tenant_as(
  _owner uuid,
  _name text DEFAULT NULL::text,
  _account_type text DEFAULT 'standalone'::text,
  _industry text DEFAULT NULL::text,
  _team_size text DEFAULT NULL::text,
  _description text DEFAULT NULL::text,
  _agreement_slug text DEFAULT NULL::text,
  _agreement_version integer DEFAULT NULL::integer
)
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

  -- (§9) EXPLICIT provisioning entitlements for the paid/webhook completion path too
  -- (same rationale as provision_tenant: deferred shell means no cascade at provision).
  perform public.ensure_provisioning_entitlements(_owner);

  -- (task #66) Up-front idempotent subscriber-agreement acceptance — the webhook
  -- BACKSTOP for the accept-time frontend write. Placed before the found-branch
  -- early-return so a replay/idempotent path still guarantees the legal row exists.
  -- ON CONFLICT DO NOTHING (backed by legal_acceptances_user_doc_version_uidx) makes
  -- the double-write with the frontend accept-time write safe (§13/§32). Only writes
  -- when the caller supplied a validated agreement (validated frontend-side + a
  -- current-doc check here to never persist a stale/unknown agreement).
  if _agreement_slug is not null and _agreement_version is not null
     and exists (
       select 1 from public.legal_documents ld
        where ld.slug = _agreement_slug
          and ld.version = _agreement_version
          and ld.is_current
     ) then
    insert into public.legal_acceptances (user_id, document_slug, document_version, context)
    values (
      _owner, _agreement_slug, _agreement_version,
      jsonb_build_object('via', 'provision_tenant_as', 'lane', _type)
    )
    on conflict (user_id, document_slug, document_version) do nothing;
  end if;

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
    -- (task #66) brand now carries the staged business context (was '{}').
    insert into public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
    values (
      _slug, _display, _owner, null, 'active', _type,
      jsonb_strip_nulls(jsonb_build_object(
        'industry', _industry,
        'team_size', _team_size,
        'about', _description
      ))
    )
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

  -- (task #66) profiles stamp mirrors provision_tenant: complete the signup, record
  -- the lane + the accepted-agreement version (COALESCE never clobbers a stamp the
  -- frontend already set at accept-time).
  update public.profiles set
    active_tenant_id    = _tenant.id,
    signup_completed_at = coalesce(signup_completed_at, now()),
    signup_lane         = coalesce(signup_lane, _type),
    terms_accepted_at   = coalesce(terms_accepted_at, now()),
    terms_version       = coalesce(
                            terms_version,
                            case when _agreement_slug is not null and _agreement_version is not null
                                 then _agreement_slug || '@' || _agreement_version::text
                                 else terms_version end)
  where user_id = _owner;
  if not found then
    insert into public.profiles (user_id, active_tenant_id, signup_completed_at, signup_lane)
    values (_owner, _tenant.id, now(), _type)
    on conflict (user_id) do update set active_tenant_id = excluded.active_tenant_id;
  end if;

  begin
    insert into public.platform_usage_events (tenant_id, event_type, quantity, metadata)
    values (
      _tenant.id, 'tenant_provisioned', 1,
      jsonb_strip_nulls(jsonb_build_object(
        'via', 'platform_subscription_webhook',
        'account_type', _type,
        'tenant_name', _tenant.name,
        'source', 'onboarding_paid',
        'agreement', case when _agreement_slug is not null and _agreement_version is not null
                          then _agreement_slug || '@' || _agreement_version::text else null end
      ))
    );
  exception when others then null; end;

  return _tenant;
end;
$function$;

REVOKE ALL ON FUNCTION public.provision_tenant_as(uuid, text, text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant_as(uuid, text, text, text, text, text, text, integer) TO service_role;

COMMENT ON FUNCTION public.provision_tenant_as(uuid, text, text, text, text, text, text, integer) IS
  'Service-role explicit-owner provisioning twin of provision_tenant (no auth.uid() '
  'dependency), called by stripe-webhook''s onboarding arm on payment. Extended for '
  'task #66 to accept the staged signup_intake business context + subscriber '
  'agreement so a paid customer is provisioned with the REAL name/industry/'
  'account_type and their agreement acceptance is logged (idempotent). §32 '
  'idempotent on webhook replay.';

COMMIT;
