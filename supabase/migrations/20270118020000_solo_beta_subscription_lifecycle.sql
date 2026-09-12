BEGIN;

CREATE OR REPLACE FUNCTION public.solo_beta_sync_subscription(
  _event_id text, _subscription_id text, _product_id text, _price_id text,
  _livemode boolean, _unit_amount integer, _currency text, _interval text,
  _interval_count integer, _subscription_status text,
  _period_start timestamptz, _period_end timestamptz, _cancel_at_period_end boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _offer public.platform_subscription_offers; _sub public.platform_subscriptions;
BEGIN
  SELECT * INTO _offer FROM public.platform_subscription_offers
  WHERE offer_code='paige-solo-beta-monthly-v1';
  IF NOT FOUND OR _offer.status<>'test_ready' OR _livemode IS DISTINCT FROM false
    OR _product_id<>_offer.stripe_product_id OR _price_id<>_offer.stripe_price_id
    OR _unit_amount<>7450 OR lower(_currency)<>'usd' OR _interval<>'month'
    OR _interval_count<>1 OR _subscription_status NOT IN ('active','past_due','canceled') THEN
    RAISE EXCEPTION 'solo_beta_provider_contract_mismatch';
  END IF;
  SELECT * INTO _sub FROM public.platform_subscriptions
  WHERE stripe_subscription_id=_subscription_id AND offer_code=_offer.offer_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'solo_beta_subscription_not_fulfilled'; END IF;
  UPDATE public.platform_subscriptions SET status=_subscription_status,
    current_period_start=_period_start,current_period_end=_period_end,
    cancel_at_period_end=coalesce(_cancel_at_period_end,false),provider_verified_at=now(),updated_at=now()
  WHERE id=_sub.id;
  UPDATE public.user_subscriptions SET status=_subscription_status,
    current_period_start=_period_start,current_period_end=_period_end,trial_ends_at=NULL,updated_at=now()
  WHERE stripe_subscription_id=_subscription_id;
  INSERT INTO public.stripe_event_log(event_id,type,livemode,lifecycle_state,offer_code,stripe_subscription_id,received_at,validated_at,processing_at,processed_at,completed_at,attempt_count)
  VALUES (_event_id,'solo_beta.subscription.lifecycle',false,'completed',_offer.offer_code,_subscription_id,now(),now(),now(),now(),now(),1)
  ON CONFLICT (event_id) DO UPDATE SET lifecycle_state='completed',processed_at=now(),completed_at=now(),last_error_code=NULL;
  INSERT INTO public.platform_usage_events(tenant_id,event_type,quantity,metadata)
  VALUES (_sub.tenant_id,'solo_beta_subscription_synced',1,jsonb_build_object(
    'event_id',_event_id,'status',_subscription_status,'cancel_at_period_end',coalesce(_cancel_at_period_end,false),'provider_mode','test'
  ));
END $$;

REVOKE ALL ON FUNCTION public.solo_beta_sync_subscription(text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_beta_sync_subscription(text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,boolean)
  TO service_role;

COMMIT;
