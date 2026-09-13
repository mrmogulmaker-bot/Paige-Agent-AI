-- Post-deployment convergence assertion for the Solo Beta migration chain.
-- This does not configure Stripe or grant customer access; it verifies the
-- canonical database boundary after a catalog/history recovery.
BEGIN;

INSERT INTO public.platform_subscription_offers (
  offer_code, plan_id, account_type, provider_mode, stripe_account,
  unit_amount_cents, currency, billing_interval, interval_count, trial_days, status
)
SELECT 'paige-solo-beta-monthly-v1', id, 'standalone', 'test', 'v2',
       7450, 'usd', 'month', 1, 30, 'configuration_required'
FROM public.platform_subscription_plans
WHERE slug = 'solo'
ON CONFLICT (offer_code) DO NOTHING;

ALTER TABLE public.platform_subscription_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_subscription_offers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_fulfillment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_fulfillment_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_lifecycle_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_beta_lifecycle_receipts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_subscription_offers, public.solo_beta_enrollments,
  public.solo_beta_fulfillment_receipts, public.solo_beta_lifecycle_receipts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_subscription_offers, public.solo_beta_enrollments,
  public.solo_beta_fulfillment_receipts, public.solo_beta_lifecycle_receipts
  TO service_role;

DO $$
DECLARE
  _offer public.platform_subscription_offers;
  _missing_columns integer;
BEGIN
  SELECT * INTO _offer
  FROM public.platform_subscription_offers
  WHERE offer_code = 'paige-solo-beta-monthly-v1';

  IF NOT FOUND OR _offer.account_type <> 'standalone'
     OR _offer.provider_mode <> 'test' OR _offer.stripe_account <> 'v2'
     OR _offer.unit_amount_cents <> 7450 OR _offer.currency <> 'usd'
     OR _offer.billing_interval <> 'month' OR _offer.interval_count <> 1
     OR _offer.trial_days <> 30
     OR _offer.status NOT IN ('configuration_required', 'test_ready')
     OR (_offer.status = 'configuration_required'
         AND (_offer.stripe_product_id IS NOT NULL OR _offer.stripe_price_id IS NOT NULL))
     OR (_offer.status = 'test_ready'
         AND (_offer.stripe_product_id IS NULL OR _offer.stripe_price_id IS NULL)) THEN
    RAISE EXCEPTION 'solo_beta_deployment_offer_contract_mismatch';
  END IF;

  SELECT count(*) INTO _missing_columns
  FROM (VALUES
    ('platform_subscriptions','offer_code'), ('platform_subscriptions','provider_mode'),
    ('platform_subscriptions','stripe_product_id'), ('platform_subscriptions','stripe_price_id'),
    ('platform_subscriptions','trial_started_at'), ('platform_subscriptions','trial_ends_at'),
    ('platform_subscriptions','provider_verified_at'), ('platform_subscriptions','provider_event_created_at'),
    ('platform_subscriptions','provider_event_precedence'),
    ('stripe_event_log','lifecycle_state'), ('stripe_event_log','attempt_count'),
    ('stripe_event_log','payload_digest'), ('stripe_event_log','provider_created_at'),
    ('solo_beta_enrollments','checkout_fencing_token'), ('solo_beta_enrollments','checkout_claimed_at')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = required.table_name
      AND c.column_name = required.column_name
  );
  IF _missing_columns <> 0 THEN
    RAISE EXCEPTION 'solo_beta_deployment_schema_incomplete';
  END IF;

  IF to_regprocedure('public.solo_beta_fulfill_checkout(text,uuid,integer,uuid,text,text,text,text,text,boolean,integer,text,text,integer,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean)') IS NULL
     OR to_regprocedure('public.solo_beta_sync_subscription(text,text,timestamp with time zone,text,text,uuid,text,text,boolean,integer,text,text,integer,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean)') IS NULL
     OR to_regprocedure('public.solo_beta_expire_checkout(text,text,timestamp with time zone,uuid,text,text)') IS NULL
     OR to_regprocedure('public.persist_solo_beta_signup_consent()') IS NULL THEN
    RAISE EXCEPTION 'solo_beta_deployment_function_contract_incomplete';
  END IF;

  IF has_table_privilege('anon', 'public.platform_subscription_offers', 'SELECT')
     OR has_table_privilege('authenticated', 'public.platform_subscription_offers', 'SELECT')
     OR has_table_privilege('authenticated', 'public.solo_beta_enrollments', 'SELECT')
     OR has_function_privilege('authenticated', 'public.provision_tenant(text,text,text,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.is_signup_complete(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'solo_beta_deployment_browser_authority_open';
  END IF;
END $$;

COMMIT;