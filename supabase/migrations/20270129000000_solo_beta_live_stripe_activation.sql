-- Forward-only activation of the owner-approved live Paige Solo Beta offer.
-- Provider IDs are canonical server configuration and are never accepted from a browser.
BEGIN;

ALTER TABLE public.platform_subscription_offers
  DROP CONSTRAINT IF EXISTS platform_subscription_offers_provider_mode_check,
  DROP CONSTRAINT IF EXISTS platform_subscription_offers_stripe_account_check,
  DROP CONSTRAINT IF EXISTS platform_subscription_offers_status_check,
  DROP CONSTRAINT IF EXISTS platform_subscription_offers_check;


UPDATE public.platform_subscription_offers
SET provider_mode='live', stripe_account='legacy',
    stripe_product_id='prod_VFaAS9EPa2ehkj',
    stripe_price_id='price_1UF50HLUcYKxolNapbjC1zlJ',
    status='live_ready', updated_at=now()
WHERE offer_code='paige-solo-beta-monthly-v1'
  AND account_type='standalone' AND unit_amount_cents=7450 AND currency='usd'
  AND billing_interval='month' AND interval_count=1 AND trial_days=30;

ALTER TABLE public.platform_subscription_offers
  ADD CONSTRAINT platform_subscription_offers_provider_mode_check CHECK (provider_mode = 'live'),
  ADD CONSTRAINT platform_subscription_offers_stripe_account_check CHECK (stripe_account = 'legacy'),
  ADD CONSTRAINT platform_subscription_offers_status_check CHECK (status IN ('configuration_required','live_ready','retired')),
  ADD CONSTRAINT platform_subscription_offers_check CHECK ((status <> 'live_ready') OR (stripe_product_id IS NOT NULL AND stripe_price_id IS NOT NULL));

DO $$
DECLARE _offer public.platform_subscription_offers; _count integer;
BEGIN
  SELECT count(*) INTO _count FROM public.platform_subscription_offers;
  SELECT * INTO _offer FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1';
  IF _count <> 1 OR NOT FOUND OR _offer.account_type <> 'standalone'
    OR _offer.provider_mode <> 'live' OR _offer.stripe_account <> 'legacy'
    OR _offer.status <> 'live_ready' OR _offer.unit_amount_cents <> 7450
    OR _offer.currency <> 'usd' OR _offer.billing_interval <> 'month'
    OR _offer.interval_count <> 1 OR _offer.trial_days <> 30
    OR _offer.stripe_product_id IS DISTINCT FROM 'prod_VFaAS9EPa2ehkj'
    OR _offer.stripe_price_id IS DISTINCT FROM 'price_1UF50HLUcYKxolNapbjC1zlJ' THEN
    RAISE EXCEPTION 'solo_beta_live_offer_binding_mismatch';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.solo_beta_claim_stripe_event(
  _event_id text,_event_type text,_livemode boolean,_payload_digest text,
  _user_id uuid,_session_id text,_subscription_id text,_customer_id text,
  _provider_created_at timestamptz
) RETURNS TABLE(claimed boolean,lifecycle_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _row public.stripe_event_log;
BEGIN
  IF _event_id IS NULL OR _event_type NOT IN (
      'checkout.session.completed','customer.subscription.updated',
      'customer.subscription.deleted','invoice.payment_failed'
    ) OR _livemode IS DISTINCT FROM true OR _payload_digest IS NULL
    OR _user_id IS NULL OR _subscription_id IS NULL OR _customer_id IS NULL
    OR _provider_created_at IS NULL
    OR (_event_type='checkout.session.completed' AND _session_id IS NULL) THEN
    RAISE EXCEPTION 'solo_beta_event_not_eligible';
  END IF;

  INSERT INTO public.stripe_event_log(
    event_id,type,livemode,payload_digest,lifecycle_state,offer_code,owner_user_id,
    checkout_session_id,stripe_subscription_id,stripe_customer_id,provider_created_at,received_at
  ) VALUES (
    _event_id,_event_type,true,_payload_digest,'received','paige-solo-beta-monthly-v1',_user_id,
    _session_id,_subscription_id,_customer_id,_provider_created_at,now()
  ) ON CONFLICT (event_id) DO NOTHING;

  SELECT * INTO _row FROM public.stripe_event_log WHERE event_id=_event_id FOR UPDATE;
  IF _row.type IS DISTINCT FROM _event_type
     OR _row.livemode IS DISTINCT FROM _livemode
     OR _row.payload_digest IS DISTINCT FROM _payload_digest
     OR _row.owner_user_id IS DISTINCT FROM _user_id
     OR _row.checkout_session_id IS DISTINCT FROM _session_id
     OR _row.stripe_subscription_id IS DISTINCT FROM _subscription_id
     OR _row.stripe_customer_id IS DISTINCT FROM _customer_id
     OR _row.provider_created_at IS DISTINCT FROM _provider_created_at THEN
    RAISE EXCEPTION 'solo_beta_event_identity_mismatch';
  END IF;
  IF _event_type='checkout.session.completed' THEN
    UPDATE public.solo_beta_enrollments
    SET state='verification_pending',stripe_subscription_id=_subscription_id,updated_at=now()
    WHERE user_id=_user_id AND checkout_session_id=_session_id
      AND stripe_customer_id=_customer_id AND state IN ('checkout_open','verification_pending');
    IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_event_identity_mismatch'; END IF;
  END IF;
  IF _row.lifecycle_state='completed' THEN
    RETURN QUERY SELECT false,_row.lifecycle_state; RETURN;
  END IF;
  IF _row.lifecycle_state='processing' AND _row.last_attempt_at>now()-interval '5 minutes' THEN
    RETURN QUERY SELECT false,_row.lifecycle_state; RETURN;
  END IF;
  UPDATE public.stripe_event_log
  SET lifecycle_state='processing',validated_at=coalesce(validated_at,now()),
      processing_at=now(),last_attempt_at=now(),attempt_count=attempt_count+1,last_error_code=NULL
  WHERE event_id=_event_id RETURNING * INTO _row;
  RETURN QUERY SELECT true,_row.lifecycle_state;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_claim_stripe_event(text,text,boolean,text,uuid,text,text,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_claim_stripe_event(text,text,boolean,text,uuid,text,text,text,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_fulfill_checkout(
  _event_id text,_user_id uuid,_attempt integer,_fencing_token uuid,
  _customer_id text,_subscription_id text,_session_id text,_product_id text,_price_id text,
  _livemode boolean,_unit_amount integer,_currency text,_interval text,_interval_count integer,
  _subscription_status text,_period_start timestamptz,_period_end timestamptz,
  _trial_start timestamptz,_trial_end timestamptz,_cancel_at_period_end boolean
) RETURNS TABLE(tenant_id uuid,account_number bigint,subscription_id uuid,reference_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _offer public.platform_subscription_offers; _intake public.signup_intake;
  _tenant public.tenants; _sub public.platform_subscriptions;
  _enrollment public.solo_beta_enrollments; _event public.stripe_event_log;
  _ref uuid; _agreement_version integer; _agreement_count integer;
BEGIN
  SELECT * INTO _offer FROM public.platform_subscription_offers
  WHERE offer_code='paige-solo-beta-monthly-v1' FOR UPDATE;
  IF NOT FOUND OR _offer.status<>'live_ready' OR _offer.provider_mode<>'live'
    OR _livemode IS DISTINCT FROM true OR _product_id IS DISTINCT FROM _offer.stripe_product_id
    OR _price_id IS DISTINCT FROM _offer.stripe_price_id OR _unit_amount IS DISTINCT FROM 7450 OR lower(_currency) IS DISTINCT FROM 'usd'
    OR _interval IS DISTINCT FROM 'month' OR _interval_count IS DISTINCT FROM 1
    OR _offer.trial_days IS DISTINCT FROM 30 OR _trial_start IS NULL OR _trial_end IS NULL
    OR (_trial_end-_trial_start) IS DISTINCT FROM interval '30 days'
    OR _subscription_status NOT IN ('trialing','active') THEN
    RAISE EXCEPTION 'solo_beta_provider_contract_mismatch';
  END IF;

  SELECT * INTO _event FROM public.stripe_event_log WHERE event_id=_event_id FOR UPDATE;
  IF NOT FOUND OR _event.lifecycle_state<>'processing'
    OR _event.type<>'checkout.session.completed' OR _event.livemode IS DISTINCT FROM true
    OR _event.owner_user_id IS DISTINCT FROM _user_id
    OR _event.checkout_session_id IS DISTINCT FROM _session_id
    OR _event.stripe_subscription_id IS DISTINCT FROM _subscription_id
    OR _event.stripe_customer_id IS DISTINCT FROM _customer_id THEN
    RAISE EXCEPTION 'solo_beta_event_identity_mismatch';
  END IF;

  SELECT * INTO _enrollment FROM public.solo_beta_enrollments WHERE user_id=_user_id FOR UPDATE;
  IF NOT FOUND OR _enrollment.offer_code<>'paige-solo-beta-monthly-v1'
    OR _enrollment.checkout_attempt<>_attempt
    OR _enrollment.checkout_fencing_token IS DISTINCT FROM _fencing_token
    OR _enrollment.checkout_session_id IS DISTINCT FROM _session_id
    OR _enrollment.stripe_customer_id IS DISTINCT FROM _customer_id
    OR _enrollment.state NOT IN ('checkout_open','verification_pending','fulfilled') THEN
    RAISE EXCEPTION 'solo_beta_checkout_fence_lost';
  END IF;

  SELECT * INTO _intake FROM public.signup_intake WHERE user_id=_user_id FOR UPDATE;
  SELECT count(*)::integer,min(d.version) INTO _agreement_count,_agreement_version
  FROM public.legal_documents d WHERE d.slug='saas-standalone' AND d.is_current=true;
  IF _intake.user_id IS NULL OR _agreement_count IS DISTINCT FROM 1 OR _agreement_version IS NULL
    OR _intake.plan_slug IS DISTINCT FROM 'solo'
    OR _intake.billing_period IS DISTINCT FROM 'monthly'
    OR _intake.account_type IS DISTINCT FROM 'standalone' OR _intake.terms_accepted_at IS NULL
    OR _intake.agreement_slug IS DISTINCT FROM 'saas-standalone'
    OR _intake.agreement_version IS DISTINCT FROM _agreement_version
    OR NOT EXISTS (
      SELECT 1 FROM public.legal_acceptances a
      WHERE a.user_id=_user_id AND a.document_slug='saas-standalone'
        AND a.document_version=_agreement_version
    ) THEN RAISE EXCEPTION 'solo_beta_agreement_unpersisted';
  END IF;

  SELECT * INTO _sub FROM public.platform_subscriptions
  WHERE stripe_subscription_id=_subscription_id FOR UPDATE;
  IF FOUND THEN
    IF _sub.offer_code<>'paige-solo-beta-monthly-v1'
      OR _sub.stripe_customer_id IS DISTINCT FROM _customer_id
      OR _enrollment.stripe_subscription_id IS DISTINCT FROM _subscription_id
      OR _enrollment.tenant_id IS DISTINCT FROM _sub.tenant_id
      OR NOT EXISTS (
        SELECT 1 FROM public.tenants t JOIN public.tenant_members m ON m.tenant_id=t.id
        WHERE t.id=_sub.tenant_id AND t.owner_user_id=_user_id AND t.account_type='standalone'
          AND t.parent_tenant_id IS NULL AND m.user_id=_user_id AND m.status='active' AND m.is_owner
      ) OR NOT EXISTS (
        SELECT 1 FROM public.platform_billing_accounts b
        WHERE b.tenant_id=_sub.tenant_id AND b.stripe_customer_id=_customer_id AND b.stripe_account='legacy'
      ) THEN RAISE EXCEPTION 'solo_beta_subscription_collision'; END IF;
    SELECT r.reference_id INTO _ref FROM public.solo_beta_fulfillment_receipts r
    WHERE r.subscription_id=_sub.id;
    IF _ref IS NULL THEN RAISE EXCEPTION 'solo_beta_receipt_missing'; END IF;
    UPDATE public.stripe_event_log SET lifecycle_state='completed',processed_at=now(),completed_at=now()
    WHERE event_id=_event_id AND lifecycle_state='processing';
    RETURN QUERY SELECT t.id,t.account_number,_sub.id,_ref FROM public.tenants t WHERE t.id=_sub.tenant_id;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE owner_user_id=_user_id AND parent_tenant_id IS NULL) THEN
    RAISE EXCEPTION 'solo_beta_existing_account_requires_owner_review';
  END IF;
  SELECT * INTO _tenant FROM public.provision_tenant_as(
    _user_id,_intake.business_name,'standalone',_intake.industry,_intake.team_size,
    _intake.who_you_help,'saas-standalone',_agreement_version
  );
  IF _tenant.owner_user_id<>_user_id OR _tenant.parent_tenant_id IS NOT NULL OR _tenant.account_type<>'standalone'
    OR NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant.id
      AND m.user_id=_user_id AND m.status='active' AND m.is_owner) THEN
    RAISE EXCEPTION 'solo_beta_tenant_invariant_failed';
  END IF;

  -- Server-authored marker activates the Beta-specific shell gate. Existing
  -- tenants have no marker and preserve their established access path.
  UPDATE public.tenants
  SET features = coalesce(features, '{}'::jsonb)
    || jsonb_build_object('solo_beta_offer_code', 'paige-solo-beta-monthly-v1')
  WHERE id = _tenant.id;

  INSERT INTO public.platform_billing_accounts(tenant_id,stripe_customer_id,stripe_account,source,created_by)
  VALUES (_tenant.id,_customer_id,'legacy','checkout',_user_id);
  INSERT INTO public.platform_subscriptions(
    tenant_id,plan_id,status,billing_period,current_period_start,current_period_end,
    trial_started_at,trial_ends_at,
    stripe_subscription_id,stripe_customer_id,cancel_at_period_end,metadata,offer_code,
    provider_mode,stripe_product_id,stripe_price_id,provider_verified_at,
    provider_event_created_at,provider_event_precedence
  ) VALUES (
    _tenant.id,_offer.plan_id,_subscription_status,'monthly',_period_start,_period_end,
    _trial_start,_trial_end,
    _subscription_id,_customer_id,coalesce(_cancel_at_period_end,false),
    jsonb_build_object('offer_code',_offer.offer_code,'provider_mode','live'),
    _offer.offer_code,'live',_product_id,_price_id,now(),_event.provider_created_at,10
  ) RETURNING * INTO _sub;

  UPDATE public.user_subscriptions SET plan_slug='solo',status=_subscription_status,trial_ends_at=_trial_end,
    current_period_start=_period_start,current_period_end=_period_end,
    stripe_subscription_id=_subscription_id,updated_at=now() WHERE user_id=_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_subscriptions(user_id,plan_slug,status,trial_ends_at,current_period_start,current_period_end,stripe_subscription_id)
    VALUES (_user_id,'solo',_subscription_status,_trial_end,_period_start,_period_end,_subscription_id);
  END IF;
  UPDATE public.signup_intake SET consumed_at=coalesce(consumed_at,now()) WHERE user_id=_user_id;
  UPDATE public.solo_beta_enrollments
  SET state='fulfilled',stripe_subscription_id=_subscription_id,tenant_id=_tenant.id,
      last_error_code=NULL,updated_at=now()
  WHERE user_id=_user_id AND checkout_attempt=_attempt AND checkout_fencing_token=_fencing_token
  RETURNING reference_id INTO _ref;
  IF _ref IS NULL THEN RAISE EXCEPTION 'solo_beta_checkout_fence_lost'; END IF;

  INSERT INTO public.solo_beta_fulfillment_receipts(event_id,user_id,tenant_id,subscription_id,offer_code,outcome,reference_id)
  VALUES (_event_id,_user_id,_tenant.id,_sub.id,_offer.offer_code,'completed',_ref);
  INSERT INTO public.platform_usage_events(tenant_id,event_type,quantity,metadata)
  VALUES (_tenant.id,'solo_beta_fulfilled',1,jsonb_build_object(
    'event_id',_event_id,'reference_id',_ref,'offer_code',_offer.offer_code,'provider_mode','live'));
  UPDATE public.stripe_event_log
  SET lifecycle_state='completed',processed_at=now(),completed_at=now(),last_error_code=NULL
  WHERE event_id=_event_id AND lifecycle_state='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_event_not_processing'; END IF;
  RETURN QUERY SELECT _tenant.id,_tenant.account_number,_sub.id,_ref;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_fulfill_checkout(text,uuid,integer,uuid,text,text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_fulfill_checkout(text,uuid,integer,uuid,text,text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_sync_subscription(
  _event_id text,_event_type text,_provider_created_at timestamptz,
  _subscription_id text,_customer_id text,_user_id uuid,
  _product_id text,_price_id text,_livemode boolean,_unit_amount integer,_currency text,
  _interval text,_interval_count integer,_subscription_status text,
  _period_start timestamptz,_period_end timestamptz,
  _trial_start timestamptz,_trial_end timestamptz,_cancel_at_period_end boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _sub public.platform_subscriptions; _event public.stripe_event_log;
  _precedence integer; _outcome text;
BEGIN
  _precedence := CASE _event_type WHEN 'customer.subscription.deleted' THEN 30
    WHEN 'invoice.payment_failed' THEN 20 WHEN 'customer.subscription.updated' THEN 10 ELSE 0 END;

  SELECT * INTO _event FROM public.stripe_event_log WHERE event_id=_event_id FOR UPDATE;
  IF NOT FOUND OR _event.lifecycle_state<>'processing' OR _event.type<>_event_type
    OR _event.provider_created_at IS DISTINCT FROM _provider_created_at
    OR _event.owner_user_id IS DISTINCT FROM _user_id
    OR _event.stripe_subscription_id IS DISTINCT FROM _subscription_id
    OR _event.stripe_customer_id IS DISTINCT FROM _customer_id THEN
    RAISE EXCEPTION 'solo_beta_event_identity_mismatch';
  END IF;

  SELECT * INTO _sub FROM public.platform_subscriptions
  WHERE stripe_subscription_id=_subscription_id
    AND offer_code='paige-solo-beta-monthly-v1' FOR UPDATE;
  IF NOT FOUND OR _sub.provider_mode IS DISTINCT FROM 'live'
    OR _livemode IS DISTINCT FROM true
    OR _sub.stripe_customer_id IS DISTINCT FROM _customer_id
    OR _sub.stripe_product_id IS DISTINCT FROM _product_id
    OR _sub.stripe_price_id IS DISTINCT FROM _price_id
    OR _unit_amount IS DISTINCT FROM 7450 OR lower(_currency) IS DISTINCT FROM 'usd' OR _interval IS DISTINCT FROM 'month'
    OR _interval_count IS DISTINCT FROM 1 OR _trial_start IS NULL OR _trial_end IS NULL
    OR (_trial_end-_trial_start) IS DISTINCT FROM interval '30 days'
    OR _subscription_status IS NULL OR _subscription_status NOT IN ('trialing','active','past_due','canceled','unpaid','paused')
    OR _precedence=0 OR NOT EXISTS (
      SELECT 1 FROM public.solo_beta_enrollments e
      WHERE e.user_id=_user_id AND e.tenant_id=_sub.tenant_id
        AND e.stripe_subscription_id=_subscription_id AND e.stripe_customer_id=_customer_id
        AND e.state='fulfilled'
    ) THEN RAISE EXCEPTION 'solo_beta_subscription_not_fulfilled'; END IF;

  IF _sub.provider_event_created_at IS NOT NULL AND (
      _provider_created_at < _sub.provider_event_created_at OR
      (_provider_created_at = _sub.provider_event_created_at AND _precedence < _sub.provider_event_precedence)
    ) THEN
    _outcome := 'ignored_stale';
  ELSE
    UPDATE public.platform_subscriptions SET status=_subscription_status,
      current_period_start=_period_start,current_period_end=_period_end,
      trial_started_at=_trial_start,trial_ends_at=_trial_end,
      cancel_at_period_end=coalesce(_cancel_at_period_end,false),provider_verified_at=now(),
      provider_event_created_at=_provider_created_at,provider_event_precedence=_precedence,updated_at=now()
    WHERE id=_sub.id;
    UPDATE public.user_subscriptions SET status=_subscription_status,
      current_period_start=_period_start,current_period_end=_period_end,trial_ends_at=_trial_end,updated_at=now()
    WHERE stripe_subscription_id=_subscription_id AND user_id=_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_user_subscription_missing'; END IF;
    UPDATE public.tenant_members
    SET status = CASE WHEN _subscription_status IN ('trialing','active') THEN 'active' ELSE 'suspended' END,
        updated_at = now()
    WHERE tenant_id=_sub.tenant_id AND user_id=_user_id AND is_owner=true;
    IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_owner_membership_missing'; END IF;
    _outcome := 'applied';
  END IF;

  INSERT INTO public.solo_beta_lifecycle_receipts(event_id,subscription_id,provider_created_at,outcome)
  VALUES (_event_id,_sub.id,_provider_created_at,_outcome);
  INSERT INTO public.platform_usage_events(tenant_id,event_type,quantity,metadata)
  VALUES (_sub.tenant_id,'solo_beta_subscription_synced',1,jsonb_build_object(
    'event_id',_event_id,'status',_subscription_status,'outcome',_outcome,'provider_mode','live'));
  UPDATE public.stripe_event_log
  SET lifecycle_state='completed',processed_at=now(),completed_at=now(),last_error_code=NULL
  WHERE event_id=_event_id AND lifecycle_state='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_event_not_processing'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_sync_subscription(text,text,timestamptz,text,text,uuid,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_sync_subscription(text,text,timestamptz,text,text,uuid,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_expire_checkout(
  _event_id text,_payload_digest text,_provider_created_at timestamptz,
  _user_id uuid,_session_id text,_customer_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _enrollment public.solo_beta_enrollments; _event public.stripe_event_log;
BEGIN
  IF _event_id IS NULL OR _payload_digest IS NULL OR _provider_created_at IS NULL
    OR _user_id IS NULL OR _session_id IS NULL OR _customer_id IS NULL THEN
    RAISE EXCEPTION 'solo_beta_event_not_eligible';
  END IF;
  SELECT * INTO _enrollment FROM public.solo_beta_enrollments WHERE user_id=_user_id FOR UPDATE;
  IF NOT FOUND OR _enrollment.offer_code<>'paige-solo-beta-monthly-v1'
    OR _enrollment.checkout_session_id IS DISTINCT FROM _session_id
    OR _enrollment.stripe_customer_id IS DISTINCT FROM _customer_id THEN
    RAISE EXCEPTION 'solo_beta_event_identity_mismatch';
  END IF;
  INSERT INTO public.stripe_event_log(
    event_id,type,livemode,payload_digest,lifecycle_state,offer_code,owner_user_id,
    checkout_session_id,stripe_customer_id,provider_created_at,received_at,
    validated_at,processing_at,processed_at,completed_at,attempt_count,last_attempt_at
  ) VALUES (
    _event_id,'checkout.session.expired',true,_payload_digest,'completed','paige-solo-beta-monthly-v1',_user_id,
    _session_id,_customer_id,_provider_created_at,now(),now(),now(),now(),now(),1,now()
  ) ON CONFLICT (event_id) DO NOTHING;
  SELECT * INTO _event FROM public.stripe_event_log WHERE event_id=_event_id FOR UPDATE;
  IF _event.type IS DISTINCT FROM 'checkout.session.expired' OR _event.livemode IS DISTINCT FROM true
    OR _event.payload_digest IS DISTINCT FROM _payload_digest OR _event.owner_user_id IS DISTINCT FROM _user_id
    OR _event.checkout_session_id IS DISTINCT FROM _session_id OR _event.stripe_customer_id IS DISTINCT FROM _customer_id
    OR _event.provider_created_at IS DISTINCT FROM _provider_created_at THEN
    RAISE EXCEPTION 'solo_beta_event_identity_mismatch';
  END IF;
  IF _enrollment.state='checkout_open' THEN
    UPDATE public.solo_beta_enrollments SET state='expired',last_error_code='checkout_expired',updated_at=now()
    WHERE user_id=_user_id;
  ELSIF _enrollment.state NOT IN ('expired','verification_pending','fulfilled') THEN
    RAISE EXCEPTION 'solo_beta_checkout_state_mismatch';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_expire_checkout(text,text,timestamptz,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_expire_checkout(text,text,timestamptz,uuid,text,text)
  TO service_role;

COMMIT;
