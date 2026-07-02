
-- Ship #2.7: Customer Subscription UI foundations
-- §189 billing_enabled tenant feature flag; §190 encrypt Stripe identifiers on customer subs;
-- §180 Cat B audit-logged admin RPCs to create/pause/resume/change/cancel customer subscriptions.

-- 1. §190: encrypt Stripe identifiers on tenant_service_subscriptions
ALTER TABLE public.tenant_service_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id_ct BYTEA,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id_ct BYTEA;

-- Backfill any existing plaintext (Ship #2.5 seeded none, but be safe)
UPDATE public.tenant_service_subscriptions
SET stripe_customer_id_ct = public.platform_encrypt(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL AND stripe_customer_id_ct IS NULL;

UPDATE public.tenant_service_subscriptions
SET stripe_subscription_id_ct = public.platform_encrypt(stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL AND stripe_subscription_id_ct IS NULL;

ALTER TABLE public.tenant_service_subscriptions
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id;

REVOKE SELECT (stripe_customer_id_ct, stripe_subscription_id_ct)
  ON public.tenant_service_subscriptions FROM anon, authenticated;

-- 2. Enable billing_enabled feature flag for the test tenant (§200)
UPDATE public.tenants
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('billing_enabled', true)
WHERE slug = 'test-tenant-189-verification';

-- 3. §180 Cat B audit helper (writes to paige_audit_log)
CREATE OR REPLACE FUNCTION public._log_billing_admin_action(
  _action text,
  _subscription_id uuid,
  _contact_id uuid,
  _details jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.paige_audit_log (actor_id, action, entity_type, entity_id, tenant_id, details)
  VALUES (
    auth.uid(),
    _action,
    'tenant_service_subscription',
    _subscription_id,
    public.current_user_tenant_id(),
    COALESCE(_details, '{}'::jsonb) || jsonb_build_object('contact_id', _contact_id)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._log_billing_admin_action(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 4. Guard: admin/owner and billing_enabled
CREATE OR REPLACE FUNCTION public._assert_billing_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'owner'::app_role)
       OR public.is_platform_owner(auth.uid())) THEN
    RAISE EXCEPTION 'billing admin role required';
  END IF;
  IF NOT public.tenant_has_feature('billing_enabled') THEN
    RAISE EXCEPTION 'billing_enabled feature is not active for this tenant';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._assert_billing_admin() FROM PUBLIC, anon, authenticated;

-- 5. RPC: create customer subscription
CREATE OR REPLACE FUNCTION public.admin_create_customer_subscription(
  _contact_id uuid,
  _price_id uuid,
  _billing_period text DEFAULT 'monthly',
  _start_date timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.current_user_tenant_id();
  v_price public.tenant_prices%ROWTYPE;
  v_sub_id uuid;
  v_existing uuid;
BEGIN
  PERFORM public._assert_billing_admin();

  SELECT * INTO v_price FROM public.tenant_prices WHERE id = _price_id AND tenant_id = v_tenant AND active = true;
  IF v_price.id IS NULL THEN RAISE EXCEPTION 'price not found or not active for this tenant'; END IF;

  -- Duplicate prevention: no active sub per (tenant, contact, product)
  SELECT id INTO v_existing FROM public.tenant_service_subscriptions
   WHERE tenant_id = v_tenant AND end_customer_contact_id = _contact_id
     AND product_id = v_price.product_id AND status IN ('active','trialing','past_due','paused');
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'customer already has an active subscription for this product'; END IF;

  INSERT INTO public.tenant_service_subscriptions (
    tenant_id, end_customer_contact_id, product_id, price_id,
    status, billing_period, current_period_start
  ) VALUES (
    v_tenant, _contact_id, v_price.product_id, _price_id,
    'active', _billing_period, _start_date
  ) RETURNING id INTO v_sub_id;

  PERFORM public._log_billing_admin_action(
    'billing.subscription.create', v_sub_id, _contact_id,
    jsonb_build_object('price_id', _price_id, 'billing_period', _billing_period)
  );
  RETURN v_sub_id;
END;
$$;

-- 6. RPC: pause
CREATE OR REPLACE FUNCTION public.admin_pause_customer_subscription(_subscription_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant uuid := public.current_user_tenant_id(); v_contact uuid;
BEGIN
  PERFORM public._assert_billing_admin();
  UPDATE public.tenant_service_subscriptions
    SET status = 'paused', updated_at = now()
    WHERE id = _subscription_id AND tenant_id = v_tenant
    RETURNING end_customer_contact_id INTO v_contact;
  IF v_contact IS NULL THEN RAISE EXCEPTION 'subscription not found'; END IF;
  PERFORM public._log_billing_admin_action('billing.subscription.pause', _subscription_id, v_contact, '{}'::jsonb);
END;
$$;

-- 7. RPC: resume
CREATE OR REPLACE FUNCTION public.admin_resume_customer_subscription(_subscription_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant uuid := public.current_user_tenant_id(); v_contact uuid;
BEGIN
  PERFORM public._assert_billing_admin();
  UPDATE public.tenant_service_subscriptions
    SET status = 'active', updated_at = now()
    WHERE id = _subscription_id AND tenant_id = v_tenant AND status = 'paused'
    RETURNING end_customer_contact_id INTO v_contact;
  IF v_contact IS NULL THEN RAISE EXCEPTION 'subscription not found or not paused'; END IF;
  PERFORM public._log_billing_admin_action('billing.subscription.resume', _subscription_id, v_contact, '{}'::jsonb);
END;
$$;

-- 8. RPC: change price (upgrade / downgrade)
CREATE OR REPLACE FUNCTION public.admin_change_customer_subscription_price(
  _subscription_id uuid, _new_price_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant uuid := public.current_user_tenant_id(); v_contact uuid; v_price public.tenant_prices%ROWTYPE; v_old uuid;
BEGIN
  PERFORM public._assert_billing_admin();
  SELECT * INTO v_price FROM public.tenant_prices WHERE id = _new_price_id AND tenant_id = v_tenant AND active = true;
  IF v_price.id IS NULL THEN RAISE EXCEPTION 'new price not found or inactive'; END IF;

  SELECT price_id, end_customer_contact_id INTO v_old, v_contact
    FROM public.tenant_service_subscriptions
    WHERE id = _subscription_id AND tenant_id = v_tenant;
  IF v_contact IS NULL THEN RAISE EXCEPTION 'subscription not found'; END IF;

  UPDATE public.tenant_service_subscriptions
    SET price_id = _new_price_id, product_id = v_price.product_id, updated_at = now()
    WHERE id = _subscription_id AND tenant_id = v_tenant;

  PERFORM public._log_billing_admin_action(
    'billing.subscription.change_price', _subscription_id, v_contact,
    jsonb_build_object('old_price_id', v_old, 'new_price_id', _new_price_id)
  );
END;
$$;

-- 9. RPC: cancel (with grace period)
CREATE OR REPLACE FUNCTION public.admin_cancel_customer_subscription(
  _subscription_id uuid, _grace_period_days integer DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant uuid := public.current_user_tenant_id(); v_contact uuid;
BEGIN
  PERFORM public._assert_billing_admin();
  IF _grace_period_days > 0 THEN
    UPDATE public.tenant_service_subscriptions
      SET cancel_at_period_end = true,
          current_period_end = COALESCE(current_period_end, now()) + make_interval(days => _grace_period_days),
          updated_at = now()
      WHERE id = _subscription_id AND tenant_id = v_tenant
      RETURNING end_customer_contact_id INTO v_contact;
  ELSE
    UPDATE public.tenant_service_subscriptions
      SET status = 'canceled', cancel_at_period_end = true, updated_at = now()
      WHERE id = _subscription_id AND tenant_id = v_tenant
      RETURNING end_customer_contact_id INTO v_contact;
  END IF;
  IF v_contact IS NULL THEN RAISE EXCEPTION 'subscription not found'; END IF;
  PERFORM public._log_billing_admin_action(
    'billing.subscription.cancel', _subscription_id, v_contact,
    jsonb_build_object('grace_period_days', _grace_period_days)
  );
END;
$$;

-- 10. Grants (RPCs are self-gated)
GRANT EXECUTE ON FUNCTION public.admin_create_customer_subscription(uuid,uuid,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pause_customer_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resume_customer_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_customer_subscription_price(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_customer_subscription(uuid,integer) TO authenticated;
