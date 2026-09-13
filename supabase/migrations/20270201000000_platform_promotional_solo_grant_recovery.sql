-- Forward-only recovery for production's pre-existing 20270131000000 migration-catalog version.
-- Replays the idempotent promotional Solo contract under the next unused canonical version.
-- Platform-issued promotional Solo access.
--
-- This is deliberately separate from public Solo Beta enrollment. It creates no
-- Stripe object, never marks a paid offer as fulfilled, and cannot be called by a
-- browser role. A promotional workspace remains metered through the existing
-- platform_usage_events / platform_metered_events contracts while subscription
-- access is represented explicitly (never inferred from missing billing data).
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_promotional_grant_tenant_uidx
  ON public.platform_subscriptions (tenant_id)
  WHERE stripe_subscription_id IS NULL
    AND metadata->>'access_source' = 'promotional_grant';

CREATE UNIQUE INDEX IF NOT EXISTS platform_usage_events_promotional_solo_grant_uidx
  ON public.platform_usage_events (tenant_id, event_type)
  WHERE event_type = 'promotional_solo_granted';

CREATE UNIQUE INDEX IF NOT EXISTS paige_audit_log_promotional_solo_grant_uidx
  ON public.paige_audit_log (target_id, action)
  WHERE action = 'platform.promotional_solo.granted';

CREATE OR REPLACE FUNCTION public.platform_grant_promotional_solo(
  _operator_user_id uuid,
  _recipient_user_id uuid,
  _workspace_name text,
  _recipient_name text,
  _comp_reason text
)
RETURNS TABLE (
  tenant_id uuid,
  subscription_id uuid,
  outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  _tenant public.tenants;
  _plan_id uuid;
  _subscription_id uuid;
  _existing_subscription_count integer;
  _display_name text := nullif(btrim(_workspace_name), '');
  _person_name text := nullif(btrim(_recipient_name), '');
  _reason text := nullif(btrim(_comp_reason), '');
  _base_slug text;
  _slug text;
  _suffix integer := 0;
  _created boolean := false;
  _class text;
BEGIN
  IF _operator_user_id IS NULL OR NOT public.is_platform_owner(_operator_user_id) THEN
    RAISE EXCEPTION 'promotional_solo_platform_owner_required' USING ERRCODE = '42501';
  END IF;
  IF _recipient_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = _recipient_user_id
  ) THEN
    RAISE EXCEPTION 'promotional_solo_recipient_not_found' USING ERRCODE = '22023';
  END IF;
  IF _display_name IS NULL OR _reason IS NULL THEN
    RAISE EXCEPTION 'promotional_solo_name_and_reason_required' USING ERRCODE = '22023';
  END IF;

  -- Serialise all grants for one identity. Together with the one-top-level-owner
  -- invariant this prevents duplicate workspaces under retries or concurrency.
  PERFORM pg_advisory_xact_lock(hashtextextended(_recipient_user_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.solo_beta_enrollments e
    WHERE e.user_id = _recipient_user_id
      AND (
        e.state NOT IN ('canceled', 'expired')
        OR e.stripe_customer_id IS NOT NULL
        OR e.stripe_subscription_id IS NOT NULL
      )
  ) OR EXISTS (
    SELECT 1 FROM public.user_subscriptions us
    WHERE us.user_id = _recipient_user_id
      AND us.stripe_subscription_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'promotional_solo_paid_enrollment_conflict' USING ERRCODE = '23514';
  END IF;

  SELECT t.* INTO _tenant
  FROM public.tenants t
  WHERE t.owner_user_id = _recipient_user_id
    AND t.parent_tenant_id IS NULL
  ORDER BY t.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF _tenant.account_type IS DISTINCT FROM 'standalone' THEN
      RAISE EXCEPTION 'promotional_solo_existing_topology_conflict' USING ERRCODE = '23514';
    END IF;

    SELECT c.revenue_class INTO _class
    FROM public.tenant_revenue_classification c
    WHERE c.tenant_id = _tenant.id
    FOR UPDATE;

    IF _class IS NOT NULL AND _class <> 'promotional' THEN
      RAISE EXCEPTION 'promotional_solo_revenue_class_conflict' USING ERRCODE = '23514';
    END IF;

    IF _tenant.stripe_customer_id IS NOT NULL OR _tenant.stripe_subscription_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.platform_subscriptions ps
      WHERE ps.tenant_id = _tenant.id
        AND (
          ps.stripe_customer_id IS NOT NULL
          OR ps.stripe_subscription_id IS NOT NULL
          OR ps.offer_code IS NOT NULL
          OR ps.provider_mode IS NOT NULL
          OR ps.stripe_product_id IS NOT NULL
          OR ps.stripe_price_id IS NOT NULL
          OR ps.provider_verified_at IS NOT NULL
        )
    ) THEN
      RAISE EXCEPTION 'promotional_solo_provider_binding_conflict' USING ERRCODE = '23514';
    END IF;
  ELSE
    _base_slug := trim(both '-' from regexp_replace(lower(_display_name), '[^a-z0-9]+', '-', 'g'));
    IF _base_slug IS NULL OR _base_slug = '' THEN
      _base_slug := 'solo-workspace';
    END IF;
    _base_slug := left(_base_slug, 36);
    _slug := _base_slug;
    WHILE EXISTS (SELECT 1 FROM public.tenants t WHERE t.slug = _slug) LOOP
      _suffix := _suffix + 1;
      _slug := left(_base_slug, 31) || '-' || _suffix::text || '-' || left(replace(_recipient_user_id::text, '-', ''), 6);
    END LOOP;

    INSERT INTO public.tenants (
      slug, name, owner_user_id, parent_tenant_id, status, account_type, brand, features
    ) VALUES (
      _slug, _display_name, _recipient_user_id, NULL, 'active', 'standalone', '{}'::jsonb, '{}'::jsonb
    )
    RETURNING * INTO _tenant;
    _created := true;
  END IF;

  -- A grant is an explicit access decision, so an existing promotional tenant is
  -- reactivated; no paid or internal tenant can reach this branch.
  UPDATE public.tenants
  SET status = 'active', updated_at = now()
  WHERE id = _tenant.id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_recipient_user_id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Do not reuse ensure_provisioning_entitlements(): that legacy helper mints a
  -- plan_slug='free' 14-day trial. Promotional Solo is explicit and non-trialing.
  UPDATE public.user_subscriptions
  SET plan_slug = 'solo', status = 'active', trial_ends_at = NULL,
      current_period_start = coalesce(current_period_start, now()),
      current_period_end = NULL, updated_at = now()
  WHERE user_id = _recipient_user_id
    AND stripe_subscription_id IS NULL;
  IF NOT FOUND THEN
    INSERT INTO public.user_subscriptions (
      user_id, plan_slug, status, trial_ends_at, current_period_start,
      current_period_end, stripe_subscription_id
    ) VALUES (_recipient_user_id, 'solo', 'active', NULL, now(), NULL, NULL);
  END IF;

  INSERT INTO public.user_usage (user_id, disputes_used, ai_chats_used)
  VALUES (_recipient_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_business_limits (user_id, max_businesses)
  VALUES (_recipient_user_id, public.default_max_businesses_for_plan('solo'))
  ON CONFLICT (user_id) DO UPDATE
  SET max_businesses = greatest(public.user_business_limits.max_businesses, excluded.max_businesses);

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
  VALUES (_tenant.id, _recipient_user_id, 'owner', 'active', true, now())
  ON CONFLICT ON CONSTRAINT tenant_members_tenant_user_unique DO UPDATE
  SET role = 'owner', status = 'active', is_owner = true,
      joined_at = coalesce(public.tenant_members.joined_at, excluded.joined_at);

  UPDATE public.profiles
  SET active_tenant_id = _tenant.id,
      full_name = coalesce(nullif(btrim(full_name), ''), _person_name),
      signup_completed_at = coalesce(signup_completed_at, now()),
      signup_lane = coalesce(signup_lane, 'standalone')
  WHERE user_id = _recipient_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, active_tenant_id, full_name, signup_completed_at, signup_lane)
    VALUES (_recipient_user_id, _tenant.id, _person_name, now(), 'standalone')
    ON CONFLICT (user_id) DO UPDATE
    SET active_tenant_id = excluded.active_tenant_id,
        full_name = coalesce(nullif(btrim(public.profiles.full_name), ''), excluded.full_name),
        signup_completed_at = coalesce(public.profiles.signup_completed_at, excluded.signup_completed_at),
        signup_lane = coalesce(public.profiles.signup_lane, excluded.signup_lane);
  END IF;

  INSERT INTO public.tenant_revenue_classification (
    tenant_id, revenue_class, comp_reason, expected_conversion_date,
    converted_from_class, converted_at, classified_by, classified_at, notes
  ) VALUES (
    _tenant.id, 'promotional', _reason, NULL, NULL, NULL,
    _operator_user_id, now(), 'Platform-issued grandfathered Solo access; no automatic expiry or charge.'
  )
  ON CONFLICT ON CONSTRAINT tenant_revenue_classification_pkey DO UPDATE
  SET revenue_class = 'promotional',
      comp_reason = excluded.comp_reason,
      expected_conversion_date = NULL,
      converted_from_class = NULL,
      converted_at = NULL,
      classified_by = excluded.classified_by,
      classified_at = excluded.classified_at,
      notes = excluded.notes;

  SELECT p.id INTO _plan_id
  FROM public.platform_subscription_plans p
  WHERE p.slug = 'solo' AND p.is_active
  LIMIT 1;
  IF _plan_id IS NULL THEN
    RAISE EXCEPTION 'promotional_solo_plan_missing' USING ERRCODE = '23514';
  END IF;

  -- Lock any existing subscription envelope before validating and converging it.
  PERFORM 1
  FROM public.platform_subscriptions ps
  WHERE ps.tenant_id = _tenant.id
  FOR UPDATE;

  SELECT count(*)::integer
    INTO _existing_subscription_count
  FROM public.platform_subscriptions ps
  WHERE ps.tenant_id = _tenant.id;

  IF _existing_subscription_count > 1 THEN
    RAISE EXCEPTION 'promotional_solo_subscription_ambiguous' USING ERRCODE = '23514';
  ELSIF _existing_subscription_count = 1 THEN
    SELECT ps.id INTO _subscription_id
    FROM public.platform_subscriptions ps
    WHERE ps.tenant_id = _tenant.id
    LIMIT 1;

    UPDATE public.platform_subscriptions
    SET plan_id = _plan_id,
        status = 'active',
        billing_period = 'monthly',
        current_period_end = NULL,
        cancel_at_period_end = false,

        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'access_source', 'promotional_grant',
          'grant_version', 1,
          'no_expiry', true,
          'metering_enabled', true
        ),
        updated_at = now()
    WHERE id = _subscription_id
      AND stripe_subscription_id IS NULL
      AND stripe_customer_id IS NULL
      AND offer_code IS NULL
      AND provider_mode IS NULL
      AND stripe_product_id IS NULL
      AND stripe_price_id IS NULL
      AND provider_verified_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'promotional_solo_provider_binding_conflict' USING ERRCODE = '23514';
    END IF;
  ELSE
    INSERT INTO public.platform_subscriptions (
      tenant_id, plan_id, status, billing_period, current_period_start,
      current_period_end, stripe_subscription_id, stripe_customer_id,
      cancel_at_period_end, metadata, offer_code, provider_mode,
      stripe_product_id, stripe_price_id, trial_started_at, trial_ends_at,
      provider_verified_at
    ) VALUES (
      _tenant.id, _plan_id, 'active', 'monthly', now(),
      NULL, NULL, NULL, false,
      jsonb_build_object(
        'access_source', 'promotional_grant',
        'grant_version', 1,
        'no_expiry', true,
        'metering_enabled', true
      ),
      NULL, NULL, NULL, NULL, NULL, NULL, NULL
    ) RETURNING id INTO _subscription_id;
  END IF;

  INSERT INTO public.platform_usage_events (tenant_id, event_type, quantity, unit, metadata)
  VALUES (
    _tenant.id, 'promotional_solo_granted', 1, 'grant',
    jsonb_build_object(
      'access_source', 'platform_operator',
      'plan_slug', 'solo',
      'no_expiry', true,
      'metering_enabled', true
    )
  ) ON CONFLICT DO NOTHING;

  INSERT INTO public.paige_audit_log (
    tenant_id, actor_user_id, actor_role, action, target_type, target_id, payload
  ) VALUES (
    _tenant.id, _operator_user_id, 'super_admin',
    'platform.promotional_solo.granted', 'tenant', _tenant.id,
    jsonb_build_object(
      'recipient_user_id', _recipient_user_id,
      'plan_slug', 'solo',
      'revenue_class', 'promotional',
      'no_expiry', true,
      'stripe_objects_created', false,
      'metering_enabled', true
    )
  ) ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT _tenant.id, _subscription_id,
    CASE WHEN _created THEN 'created' ELSE 'already_granted' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_grant_promotional_solo(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_grant_promotional_solo(uuid, uuid, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.platform_grant_promotional_solo(uuid, uuid, text, text, text) IS
  'Service-only, platform-owner-authorized grant of one explicit non-expiring promotional Solo workspace to an existing identity. Creates no Stripe objects, refuses paid/provider-bound conflicts, preserves unrelated memberships, emits one audit row and one metering-visible grant event, and is idempotent per recipient.';

COMMIT;