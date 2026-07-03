-- V-Preflight
DO $$
DECLARE v_evt bigint; v_dl bigint; v_sub bigint; v_inv bigint; v_plan bigint; v_wait bigint;
BEGIN
  SELECT count(*) INTO v_evt  FROM public.platform_metered_events
    WHERE layer='L4_consumer_direct' OR subject_type='consumer_user'
       OR consumer_subscription_id IS NOT NULL OR consumer_user_id IS NOT NULL;
  SELECT count(*) INTO v_dl   FROM public.platform_metered_events_dead_letter
    WHERE layer='L4_consumer_direct' OR subject_type='consumer_user';
  SELECT count(*) INTO v_sub  FROM public.consumer_subscriptions;
  SELECT count(*) INTO v_inv  FROM public.consumer_invoices;
  SELECT count(*) INTO v_plan FROM public.consumer_subscription_plans;
  SELECT count(*) INTO v_wait FROM public.consumer_waitlist;
  IF v_evt+v_dl+v_sub+v_inv+v_wait > 0 THEN
    RAISE EXCEPTION 'P.0.1.b preflight: live L4/consumer rows present (evt=% dl=% sub=% inv=% wait=%)',
      v_evt, v_dl, v_sub, v_inv, v_wait;
  END IF;
  RAISE NOTICE 'Preflight OK. % consumer_subscription_plans seed rows archived pre-migration.', v_plan;
END $$;

-- Step 2a: Drop OLD CHECK constraints FIRST
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT IF EXISTS pme_layer_matches_subject,
  DROP CONSTRAINT IF EXISTS pme_layer_allowed,
  DROP CONSTRAINT IF EXISTS pme_subject_type_allowed;
ALTER TABLE public.platform_metered_events_dead_letter
  DROP CONSTRAINT IF EXISTS pme_dl_layer_allowed,
  DROP CONSTRAINT IF EXISTS pme_dl_subject_type_allowed;

-- Step 2b: Drop L4 FKs
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT platform_metered_events_consumer_subscription_id_fkey,
  DROP CONSTRAINT platform_metered_events_consumer_user_id_fkey;

-- Step 3+4: Drop L4 columns (main only; DL never carried them)
ALTER TABLE public.platform_metered_events
  DROP COLUMN consumer_subscription_id,
  DROP COLUMN consumer_user_id;

-- Step 4.5: Rewrite trigger fn — preserve IS NULL guard, drop L4 arm
CREATE OR REPLACE FUNCTION public.platform_metered_events_set_subject_id()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF NEW.subject_id IS NULL THEN
    IF NEW.layer = 'L3_tenant_passthrough' THEN
      NEW.subject_id := NEW.tenant_id;
    END IF;
    -- L4_consumer_direct arm removed with Ship P.0.1.b (deferred to Sprint C.I.F).
  END IF;
  RETURN NEW;
END;
$function$;

-- Step 5: Add NEW CHECKs — minimal change, L1 semantics preserved from P.0.1.a
ALTER TABLE public.platform_metered_events
  ADD CONSTRAINT pme_layer_allowed
    CHECK (layer IN ('L1_platform','L3_tenant_passthrough')),
  ADD CONSTRAINT pme_subject_type_allowed
    CHECK (subject_type = 'tenant'),
  ADD CONSTRAINT pme_layer_matches_subject CHECK (
    (layer='L1_platform'
      AND subject_type='tenant'
      AND tenant_id IS NOT NULL
      AND end_customer_user_id IS NULL
      AND end_customer_contact_id IS NULL)
    OR
    (layer='L3_tenant_passthrough'
      AND subject_type='tenant'
      AND tenant_id IS NOT NULL)
  );

ALTER TABLE public.platform_metered_events_dead_letter
  ADD CONSTRAINT pme_dl_layer_allowed
    CHECK (layer IS NULL OR layer IN ('L1_platform','L3_tenant_passthrough')),
  ADD CONSTRAINT pme_dl_subject_type_allowed
    CHECK (subject_type IS NULL OR subject_type = 'tenant');

-- Step 6: Drop consumer_* tables
DROP TABLE public.consumer_invoices;
DROP TABLE public.consumer_subscriptions;
DROP TABLE public.consumer_subscription_plans;
DROP TABLE public.consumer_waitlist;

-- Reversal reference (Sprint C.I.F, DO NOT RUN)
-- Re-add consumer_subscription_id + consumer_user_id cols + FKs on platform_metered_events.
-- Re-add 'L4_consumer_direct' to pme_layer_allowed / pme_dl_layer_allowed.
-- Re-add 'consumer_user' to pme_subject_type_allowed / pme_dl_subject_type_allowed.
-- Re-add L4 branch to pme_layer_matches_subject (with consumer_user_id NOT NULL, consumer_subscription_id NOT NULL,
--   tenant_id NULL, end_customer_* NULL guards — per P.0.1.a original body).
-- Restore trigger L4 arm inside IS NULL guard.
-- Recreate consumer_invoices/subscriptions/subscription_plans/waitlist (schema tuned for invite-token flow).