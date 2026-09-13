-- Solo Beta paid-enrollment boundary. Forward-only; no provider objects or live data.
-- The legacy multi-tier checkout/webhook remain for existing authorized accounts.
-- New public enrollment uses only the service-only contracts below.

BEGIN;

CREATE TABLE public.platform_subscription_offers (
  offer_code text PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.platform_subscription_plans(id),
  account_type text NOT NULL CHECK (account_type = 'standalone'),
  provider_mode text NOT NULL CHECK (provider_mode = 'test'),
  stripe_account text NOT NULL CHECK (stripe_account = 'v2'),
  stripe_product_id text,
  stripe_price_id text,
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents = 7450),
  currency text NOT NULL CHECK (currency = 'usd'),
  billing_interval text NOT NULL CHECK (billing_interval = 'month'),
  interval_count integer NOT NULL CHECK (interval_count = 1),
  trial_days integer NOT NULL CHECK (trial_days = 30),
  status text NOT NULL CHECK (status IN ('configuration_required','test_ready','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status <> 'test_ready') OR (stripe_product_id IS NOT NULL AND stripe_price_id IS NOT NULL))
);
ALTER TABLE public.platform_subscription_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_subscription_offers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_subscription_offers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_subscription_offers TO service_role;

INSERT INTO public.platform_subscription_offers (
  offer_code, plan_id, account_type, provider_mode, stripe_account,
  unit_amount_cents, currency, billing_interval, interval_count, trial_days, status
)
SELECT 'paige-solo-beta-monthly-v1', id, 'standalone', 'test', 'v2',
       7450, 'usd', 'month', 1, 30, 'configuration_required'
FROM public.platform_subscription_plans
WHERE slug = 'solo'
ON CONFLICT (offer_code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_subscription_offers
    WHERE offer_code = 'paige-solo-beta-monthly-v1'
  ) THEN
    RAISE EXCEPTION 'solo_beta_plan_missing';
  END IF;
END $$;

ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS offer_code text REFERENCES public.platform_subscription_offers(offer_code),
  ADD COLUMN IF NOT EXISTS provider_mode text,
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_stripe_subscription_uidx
  ON public.platform_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.stripe_event_log
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS offer_code text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE TABLE public.solo_beta_enrollments (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_code text NOT NULL REFERENCES public.platform_subscription_offers(offer_code),
  state text NOT NULL CHECK (state IN (
    'intake_ready','checkout_creating','checkout_open','verification_pending',
    'retryable_failure','fulfilled','canceled','expired'
  )),
  checkout_attempt integer NOT NULL DEFAULT 0,
  stripe_customer_id text,
  checkout_session_id text,
  stripe_subscription_id text,
  tenant_id uuid REFERENCES public.tenants(id),
  last_error_code text,
  reference_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX solo_beta_enrollments_customer_uidx
  ON public.solo_beta_enrollments(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX solo_beta_enrollments_session_uidx
  ON public.solo_beta_enrollments(checkout_session_id) WHERE checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX solo_beta_enrollments_subscription_uidx
  ON public.solo_beta_enrollments(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
ALTER TABLE public.solo_beta_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_enrollments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.solo_beta_enrollments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.solo_beta_enrollments TO service_role;

CREATE TABLE public.solo_beta_fulfillment_receipts (
  event_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  subscription_id uuid NOT NULL REFERENCES public.platform_subscriptions(id),
  offer_code text NOT NULL REFERENCES public.platform_subscription_offers(offer_code),
  outcome text NOT NULL CHECK (outcome = 'completed'),
  reference_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.solo_beta_fulfillment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_fulfillment_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.solo_beta_fulfillment_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.solo_beta_fulfillment_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_claim_checkout(_user_id uuid)
RETURNS TABLE(claimed boolean, attempt integer, reference_id uuid, existing_session_id text, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.solo_beta_enrollments;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'solo_beta_owner_required'; END IF;
  INSERT INTO public.solo_beta_enrollments(user_id, offer_code, state)
  VALUES (_user_id, 'paige-solo-beta-monthly-v1', 'intake_ready')
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO _row FROM public.solo_beta_enrollments WHERE user_id = _user_id FOR UPDATE;
  IF _row.state IN ('checkout_creating','checkout_open','verification_pending','fulfilled') THEN
    RETURN QUERY SELECT false, _row.checkout_attempt, _row.reference_id, _row.checkout_session_id, _row.state;
    RETURN;
  END IF;
  UPDATE public.solo_beta_enrollments
  SET state='checkout_creating', checkout_attempt=checkout_attempt+1,
      checkout_session_id=NULL, last_error_code=NULL, updated_at=now()
  WHERE user_id=_user_id RETURNING * INTO _row;
  RETURN QUERY SELECT true, _row.checkout_attempt, _row.reference_id, NULL::text, _row.state;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_claim_checkout(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_claim_checkout(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_checkout_opened(
  _user_id uuid, _attempt integer, _customer_id text, _session_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.solo_beta_enrollments
  SET state='checkout_open', stripe_customer_id=_customer_id,
      checkout_session_id=_session_id, updated_at=now()
  WHERE user_id=_user_id AND checkout_attempt=_attempt AND state='checkout_creating';
  IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_checkout_claim_lost'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_checkout_opened(uuid,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_checkout_opened(uuid,integer,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_checkout_failed(
  _user_id uuid, _attempt integer, _error_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.solo_beta_enrollments
  SET state='retryable_failure', last_error_code=left(coalesce(_error_code,'checkout_failed'),120), updated_at=now()
  WHERE user_id=_user_id AND checkout_attempt=_attempt AND state='checkout_creating';
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_checkout_failed(uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_checkout_failed(uuid,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_claim_stripe_event(
  _event_id text, _event_type text, _livemode boolean, _payload_digest text,
  _user_id uuid, _session_id text, _subscription_id text
) RETURNS TABLE(claimed boolean, lifecycle_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _state text;
BEGIN
  IF _event_id IS NULL OR _event_type <> 'checkout.session.completed' OR _livemode IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'solo_beta_event_not_eligible';
  END IF;
  INSERT INTO public.stripe_event_log(
    event_id,type,livemode,payload_digest,lifecycle_state,offer_code,owner_user_id,
    checkout_session_id,stripe_subscription_id,received_at
  ) VALUES (
    _event_id,_event_type,false,_payload_digest,'received','paige-solo-beta-monthly-v1',_user_id,
    _session_id,_subscription_id,now()
  ) ON CONFLICT (event_id) DO NOTHING;
  SELECT s.lifecycle_state INTO _state FROM public.stripe_event_log s WHERE s.event_id=_event_id FOR UPDATE;
  IF _state='completed' THEN RETURN QUERY SELECT false,_state; RETURN; END IF;
  IF _state='processing' AND EXISTS (
    SELECT 1 FROM public.stripe_event_log s WHERE s.event_id=_event_id AND s.last_attempt_at > now()-interval '5 minutes'
  ) THEN RETURN QUERY SELECT false,_state; RETURN; END IF;
  UPDATE public.stripe_event_log SET lifecycle_state='validated',validated_at=now(),last_error_code=NULL
  WHERE event_id=_event_id;
  UPDATE public.stripe_event_log
  SET lifecycle_state='processing',processing_at=now(),last_attempt_at=now(),attempt_count=attempt_count+1
  WHERE event_id=_event_id RETURNING stripe_event_log.lifecycle_state INTO _state;
  RETURN QUERY SELECT true,_state;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_claim_stripe_event(text,text,boolean,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_claim_stripe_event(text,text,boolean,text,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_fail_stripe_event(_event_id text, _error_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.stripe_event_log
  SET lifecycle_state='retryable_failure',last_error_code=left(coalesce(_error_code,'fulfillment_failed'),120),processed_at=NULL
  WHERE event_id=_event_id AND lifecycle_state<>'completed';
  UPDATE public.solo_beta_enrollments e
  SET state=CASE WHEN s.type='checkout.session.completed' AND s.stripe_subscription_id IS NOT NULL
      THEN 'verification_pending' ELSE 'retryable_failure' END,
      checkout_session_id=coalesce(e.checkout_session_id,s.checkout_session_id),
      stripe_subscription_id=coalesce(e.stripe_subscription_id,s.stripe_subscription_id),
      last_error_code=left(coalesce(_error_code,'fulfillment_failed'),120),updated_at=now()
  FROM public.stripe_event_log s WHERE s.event_id=_event_id AND e.user_id=s.owner_user_id AND e.state<>'fulfilled';
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_fail_stripe_event(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_fail_stripe_event(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.solo_beta_fulfill_checkout(
  _event_id text, _user_id uuid, _customer_id text, _subscription_id text,
  _session_id text, _product_id text, _price_id text, _livemode boolean,
  _unit_amount integer, _currency text, _interval text, _interval_count integer,
  _subscription_status text, _period_start timestamptz, _period_end timestamptz,
  _trial_start timestamptz, _trial_end timestamptz,
  _cancel_at_period_end boolean
) RETURNS TABLE(tenant_id uuid, account_number bigint, subscription_id uuid, reference_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _offer public.platform_subscription_offers;
  _intake public.signup_intake;
  _tenant public.tenants;
  _sub public.platform_subscriptions;
  _ref uuid;
BEGIN
  SELECT * INTO _offer FROM public.platform_subscription_offers
  WHERE offer_code='paige-solo-beta-monthly-v1' FOR UPDATE;
  IF NOT FOUND OR _offer.status<>'test_ready' OR _offer.provider_mode<>'test'
     OR _livemode IS DISTINCT FROM false OR _offer.stripe_product_id IS NULL
     OR _offer.stripe_price_id IS NULL OR _product_id<>_offer.stripe_product_id
     OR _price_id<>_offer.stripe_price_id OR _unit_amount<>7450
     OR lower(_currency)<>'usd' OR _interval<>'month' OR _interval_count<>1
     OR _offer.trial_days<>30 OR _trial_start IS NULL OR _trial_end IS NULL
     OR (_trial_end-_trial_start)<>interval '30 days'
     OR _subscription_status NOT IN ('trialing','active') THEN
    RAISE EXCEPTION 'solo_beta_provider_contract_mismatch';
  END IF;
  IF _event_id IS NULL OR _user_id IS NULL OR _customer_id IS NULL OR _subscription_id IS NULL OR _session_id IS NULL THEN
    RAISE EXCEPTION 'solo_beta_fulfillment_identity_missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=_user_id) THEN RAISE EXCEPTION 'solo_beta_user_missing'; END IF;

  SELECT * INTO _intake FROM public.signup_intake WHERE user_id=_user_id FOR UPDATE;
  IF NOT FOUND OR _intake.plan_slug<>'solo' OR _intake.billing_period<>'monthly'
     OR _intake.account_type<>'standalone' OR _intake.terms_accepted_at IS NULL
     OR _intake.agreement_slug IS NULL OR _intake.agreement_version IS NULL THEN
    RAISE EXCEPTION 'solo_beta_intake_incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.legal_documents d JOIN public.legal_acceptances a
      ON a.document_slug=d.slug AND a.document_version=d.version
    WHERE d.slug=_intake.agreement_slug AND d.version=_intake.agreement_version
      AND d.is_current AND a.user_id=_user_id
  ) THEN RAISE EXCEPTION 'solo_beta_agreement_unpersisted'; END IF;

  SELECT ps.* INTO _sub FROM public.platform_subscriptions ps
  WHERE ps.stripe_subscription_id=_subscription_id FOR UPDATE;
  IF FOUND THEN
    SELECT r.reference_id INTO _ref FROM public.solo_beta_fulfillment_receipts r
    WHERE r.subscription_id=_sub.id LIMIT 1;
    IF _sub.offer_code<>'paige-solo-beta-monthly-v1' OR _sub.tenant_id IS NULL THEN
      RAISE EXCEPTION 'solo_beta_subscription_collision';
    END IF;
    UPDATE public.stripe_event_log SET lifecycle_state='completed',processed_at=now(),completed_at=now()
    WHERE event_id=_event_id;
    RETURN QUERY SELECT t.id,t.account_number,_sub.id,_ref FROM public.tenants t WHERE t.id=_sub.tenant_id;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants t WHERE t.owner_user_id=_user_id AND t.parent_tenant_id IS NULL) THEN
    RAISE EXCEPTION 'solo_beta_existing_account_requires_owner_review';
  END IF;

  SELECT * INTO _tenant FROM public.provision_tenant_as(
    _user_id,_intake.business_name,'standalone',_intake.industry,_intake.team_size,
    _intake.who_you_help,_intake.agreement_slug,_intake.agreement_version
  );
  IF _tenant.owner_user_id<>_user_id OR _tenant.parent_tenant_id IS NOT NULL OR _tenant.account_type<>'standalone' THEN
    RAISE EXCEPTION 'solo_beta_tenant_invariant_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant.id AND m.user_id=_user_id AND m.status='active' AND m.is_owner) THEN
    RAISE EXCEPTION 'solo_beta_membership_invariant_failed';
  END IF;

  INSERT INTO public.platform_billing_accounts(tenant_id,stripe_customer_id,stripe_account,source,created_by)
  VALUES (_tenant.id,_customer_id,'v2','checkout',_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.platform_billing_accounts b WHERE b.tenant_id=_tenant.id AND b.stripe_customer_id=_customer_id AND b.stripe_account='v2') THEN
    RAISE EXCEPTION 'solo_beta_billing_mapping_conflict';
  END IF;

  INSERT INTO public.platform_subscriptions(
    tenant_id,plan_id,status,billing_period,current_period_start,current_period_end,
    trial_started_at,trial_ends_at,
    stripe_subscription_id,stripe_customer_id,cancel_at_period_end,metadata,
    offer_code,provider_mode,stripe_product_id,stripe_price_id,provider_verified_at
  ) VALUES (
    _tenant.id,_offer.plan_id,_subscription_status,'monthly',_period_start,_period_end,
    _trial_start,_trial_end,
    _subscription_id,_customer_id,coalesce(_cancel_at_period_end,false),
    jsonb_build_object('offer_code',_offer.offer_code,'provider_mode','test'),
    _offer.offer_code,'test',_product_id,_price_id,now()
  ) RETURNING * INTO _sub;

  UPDATE public.user_subscriptions SET plan_slug='solo',status=_subscription_status,trial_ends_at=_trial_end,
    current_period_start=_period_start,current_period_end=_period_end,
    stripe_subscription_id=_subscription_id,updated_at=now() WHERE user_id=_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_subscriptions(user_id,plan_slug,status,trial_ends_at,current_period_start,current_period_end,stripe_subscription_id)
    VALUES (_user_id,'solo',_subscription_status,_trial_end,_period_start,_period_end,_subscription_id);
  END IF;

  UPDATE public.signup_intake SET consumed_at=coalesce(consumed_at,now()) WHERE user_id=_user_id;
  UPDATE public.solo_beta_enrollments SET state='fulfilled',stripe_customer_id=_customer_id,
    checkout_session_id=_session_id,stripe_subscription_id=_subscription_id,tenant_id=_tenant.id,
    last_error_code=NULL,updated_at=now() WHERE user_id=_user_id RETURNING solo_beta_enrollments.reference_id INTO _ref;
  IF _ref IS NULL THEN RAISE EXCEPTION 'solo_beta_enrollment_missing'; END IF;

  INSERT INTO public.solo_beta_fulfillment_receipts(event_id,user_id,tenant_id,subscription_id,offer_code,outcome,reference_id)
  VALUES (_event_id,_user_id,_tenant.id,_sub.id,_offer.offer_code,'completed',_ref)
  ON CONFLICT (event_id) DO NOTHING;
  INSERT INTO public.platform_usage_events(tenant_id,event_type,quantity,metadata)
  VALUES (_tenant.id,'solo_beta_fulfilled',1,jsonb_build_object('reference_id',_ref,'offer_code',_offer.offer_code,'provider_mode','test'));
  UPDATE public.stripe_event_log SET lifecycle_state='completed',processed_at=now(),completed_at=now(),last_error_code=NULL
  WHERE event_id=_event_id AND lifecycle_state='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_event_not_processing'; END IF;
  RETURN QUERY SELECT _tenant.id,_tenant.account_number,_sub.id,_ref;
END $$;
REVOKE ALL ON FUNCTION public.solo_beta_fulfill_checkout(text,uuid,text,text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_fulfill_checkout(text,uuid,text,text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean) TO service_role;

COMMIT;
