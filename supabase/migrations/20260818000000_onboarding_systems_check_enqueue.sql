-- D3 — fire the FIRST onboarding Systems Check when a tenant is created (task: freshly-created
-- sub-accounts have 0 systems-check runs; no creation path on ANY tier fired an onboarding scan,
-- and the systems-check-run-onboarding runner was orphaned — MMA's only runs are the daily cron).
--
-- Part A — enqueue_onboarding_systems_check(p_tenant_id): a SECURITY DEFINER helper that fires a
--   NON-BLOCKING net.http_post at the EXISTING systems-check-run-onboarding edge function for one
--   brand-new tenant. Auth + URL reuse the systems-check scheduled-cron pattern VERBATIM
--   (20260816150000_systems_check_scheduled_cron.sql, §18): the hardcoded project URL + the
--   x-cron-token header from public.cron_token_header() (reads the one Vault 'cron_token' secret).
--   The onboarding fn (now verify_jwt=false, this batch) fails closed in-function to an
--   internal-caller gate — verify_cron_token(x-cron-token) OR a service-role bearer — so a
--   brand-new tenant with NO user session yet can be scanned by naming it via body.tenant_id.
--   §9: only a trusted server context holding the vault cron token can reach this — never a browser.
--
-- Part B — SUB-ACCOUNT tier: create_subaccount (7-arg actor-explicit core) re-declared via CREATE OR
--   REPLACE with the CURRENT body copied verbatim from 20260803120000_p1_subaccount_owner_leak_fix.sql,
--   plus ONE added enqueue call after the tenants INSERT. §13/§32: wrapped so a failure NEVER aborts
--   tenant creation — the helper already swallows its own exceptions, and the call site adds a
--   defensive BEGIN..EXCEPTION WHEN OTHERS log-and-continue on top (belt-and-suspenders). A sub-account
--   inserts parent_tenant_id = _parent (NOT NULL), so the Part C top-level trigger deliberately SKIPS
--   it — the two mechanisms are mutually exclusive and never double-fire.
--
-- Part C — TOP-LEVEL tier (standalone / agency / enterprise, front-door AND paid/webhook): an AFTER
--   INSERT trigger on public.tenants that fires the same enqueue for every NEW top-level tenant
--   (parent_tenant_id IS NULL). This covers provision_tenant (front door) and provision_tenant_as
--   (stripe-webhook paid completion) WITHOUT freezing a copy of those two large, actively-evolving
--   signup RPC bodies into this hotfix (§13 maintainability, §18 one seam). It mirrors the established
--   AFTER-INSERT-on-tenants trigger pattern (trg_tenants_seed_starter_business) exactly.
--
-- NOTE (§13/§32 honesty): the handoff named supabase/functions/tenant-signup as the standalone home,
--   but that edge function ONLY mints the auth user (admin.auth.admin.createUser) — NO tenant is
--   provisioned there, so it carries no tenant_id to enqueue against. The REAL standalone/agency
--   tenant-creation happens in the provision_tenant / provision_tenant_as RPCs; the Part C trigger is
--   the correct, tier-uniform (§56) home for those paths. tenant-signup is therefore left untouched.
--
-- APPLY ORDER: applies via CI on merge (deploy-migrations.yml). The systems-check-run-onboarding edge
--   function (verify_jwt=false + internal-caller branch) deploys via CI on the same merge; if this
--   migration lands microseconds before the function redeploys, the first POST 404s harmlessly (the
--   helper swallows it) and the NEXT tenant creation re-fires. Idempotent, self-healing (§32).

-- ── Part A ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_onboarding_systems_check(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/systems-check-run-onboarding',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-token', public.cron_token_header()
               ),
    body    := jsonb_build_object('tenant_id', p_tenant_id)
  );
EXCEPTION WHEN OTHERS THEN
  -- Firing the first onboarding scan must NEVER break tenant creation / signup (§13/§32).
  RAISE WARNING 'enqueue_onboarding_systems_check: enqueue failed for tenant %: %', p_tenant_id, sqlerrm;
END;
$$;

-- Least privilege: the SECURITY DEFINER body runs as owner, so callers need EXECUTE only to invoke it.
-- create_subaccount calls it internally (definer context, no grant needed); tenant-signup's service
-- client calls it via RPC, so service_role gets EXECUTE. Never anon/public/authenticated (§9 — a
-- browser must never be able to fire arbitrary-tenant scans; the trust lives in the vault cron token).
REVOKE ALL ON FUNCTION public.enqueue_onboarding_systems_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_onboarding_systems_check(uuid) TO service_role;

-- ── Part B ────────────────────────────────────────────────────────────────────
-- Body is a VERBATIM copy of the current 7-arg core (20260803120000_p1_subaccount_owner_leak_fix.sql),
-- with the single documented delta: the enqueue call after the tenants INSERT. Nothing else changes.
CREATE OR REPLACE FUNCTION public.create_subaccount(_name text, _industry text, _description text, _parent_tenant_id uuid, _actor uuid, _playbook_slug text DEFAULT NULL::text, _inherit_from_parent boolean DEFAULT true)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := _actor;
  _parent uuid := _parent_tenant_id;
  _parent_type text;
  _parent_brand jsonb;
  _parent_features jsonb;
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _child_count int;
  _child_brand jsonb := '{}'::jsonb;
  _child_features jsonb := '{}'::jsonb;
  _pb_config jsonb;
  _known_slugs text[] := ARRAY['general','coaching-default','fitness','consultant','agency','funding'];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'no parent tenant in context' USING ERRCODE = '22000';
  END IF;
  -- Auth gate: the ACTOR must own the parent. _actor/_uid is used ONLY for authorization here;
  -- it MUST NOT flow into the child's ownership or roster (#215 / #212 rule 2).
  IF NOT public.is_tenant_owner(_uid, _parent) THEN
    RAISE EXCEPTION 'only the tenant owner may create a sub-account' USING ERRCODE = '42501';
  END IF;

  SELECT account_type, brand, features
    INTO _parent_type, _parent_brand, _parent_features
    FROM public.tenants WHERE id = _parent;
  IF _parent_type NOT IN ('agency', 'enterprise') THEN
    RAISE EXCEPTION 'sub-accounts require an Agency or Enterprise account' USING ERRCODE = '42501';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'sub-account name required' USING ERRCODE = '22000';
  END IF;

  IF _playbook_slug IS NOT NULL AND NOT (_playbook_slug = ANY (_known_slugs)) THEN
    RAISE EXCEPTION 'unknown playbook preset: %', _playbook_slug USING ERRCODE = '22023';
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

  IF _inherit_from_parent AND _parent_brand IS NOT NULL THEN
    _child_brand := jsonb_strip_nulls(jsonb_build_object(
      'logo_url',      _parent_brand->'logo_url',
      'logo_dark_url', _parent_brand->'logo_dark_url',
      'favicon_url',   _parent_brand->'favicon_url',
      'primary_color', _parent_brand->'primary_color',
      'accent_color',  _parent_brand->'accent_color',
      'font',          _parent_brand->'font',
      'tagline',       _parent_brand->'tagline',
      'product_name',  _parent_brand->'product_name',
      'from_name',     _parent_brand->'from_name',
      'support_email', _parent_brand->'support_email'
    ));
  END IF;
  _child_brand := _child_brand || jsonb_strip_nulls(jsonb_build_object(
    'industry', _industry,
    'about',    _description
  ));

  IF _playbook_slug IS NOT NULL THEN
    _child_features := _child_features || jsonb_build_object('playbook', _playbook_slug);
  ELSIF _inherit_from_parent
        AND _parent_features IS NOT NULL
        AND (_parent_features ? 'playbook_config') THEN
    _pb_config := _parent_features->'playbook_config';
    IF COALESCE(_pb_config->>'slug', '') <> 'funding' THEN
      _child_features := _child_features || jsonb_build_object('playbook_config', _pb_config);
      IF _pb_config ? 'slug' THEN
        _child_features := _child_features || jsonb_build_object('playbook', _pb_config->>'slug');
      END IF;
    END IF;
  ELSIF _inherit_from_parent
        AND _parent_features IS NOT NULL
        AND (_parent_features ? 'playbook')
        AND COALESCE(_parent_features->>'playbook', '') NOT IN ('', 'funding') THEN
    _child_features := _child_features || jsonb_build_object('playbook', _parent_features->>'playbook');
  END IF;

  IF _inherit_from_parent
     AND _parent_features IS NOT NULL
     AND (_parent_features ? 'portal_config') THEN
    _child_features := _child_features || jsonb_build_object('portal_config', _parent_features->'portal_config');
  END IF;

  -- #215 / #212: the child is a true sub_account with NO owner yet (owner_user_id NULL) and NO
  -- members. The agency owner (_uid) is intentionally NOT written as owner or member — they
  -- administer the umbrella via the parent chain, they are not on the child's roster. The real
  -- principal becomes owner/admin by accepting a 'subaccount_owner' invite (P1b establishes the
  -- owner; today they land as admin). owner_user_id is nullable and excluded from
  -- tenants_one_toplevel_per_owner; INSERT triggers do not require a non-null owner.
  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand, features)
  VALUES (
    _slug, trim(_name), NULL, _parent, 'active', 'sub_account',
    _child_brand,
    _child_features
  )
  RETURNING * INTO _tenant;

  -- D3: fire the FIRST onboarding Systems Check for this brand-new sub-account (every tier gets one,
  -- §56). Wrapped so a failure NEVER aborts creation (§13/§32) — the helper also swallows internally.
  BEGIN
    PERFORM public.enqueue_onboarding_systems_check(_tenant.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_subaccount: onboarding systems-check enqueue failed for %: %', _tenant.id, sqlerrm;
  END;

  RETURN _tenant;
END;
$function$;

-- ── Part C ────────────────────────────────────────────────────────────────────
-- Top-level tenant → first onboarding scan. Fires ONLY for parent_tenant_id IS NULL rows so it never
-- double-fires with the Part B sub-account explicit call. Failure-isolated (§13/§32): a scan hiccup
-- must NEVER break signup/provisioning — mirrors trg_tenants_seed_starter_business.
CREATE OR REPLACE FUNCTION public.trg_enqueue_onboarding_systems_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Sub-accounts (parent_tenant_id NOT NULL) are handled by create_subaccount's explicit enqueue.
  IF NEW.parent_tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Skip the operator/system workspace tenant — it is not a real coaching book (§52/§9); a
  -- tenant-scoped onboarding scan is meaningless there and would be scan-noise.
  IF COALESCE(NEW.features->>'system_workspace', '') = 'true' THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.enqueue_onboarding_systems_check(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_enqueue_onboarding_systems_check: enqueue failed for tenant %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_enqueue_onboarding_systems_check ON public.tenants;
CREATE TRIGGER trg_tenants_enqueue_onboarding_systems_check
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_onboarding_systems_check();
