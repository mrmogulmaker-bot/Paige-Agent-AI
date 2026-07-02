-- Ship P.0.1.a: extend layer enum + shape check to admit L1_platform
-- for tenant agent overage metering. Pre-flight verified 0 existing
-- L1_platform rows in either table.

BEGIN;

-- 1. Extend enum allow-list on live events table
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT pme_layer_allowed;
ALTER TABLE public.platform_metered_events
  ADD CONSTRAINT pme_layer_allowed CHECK (
    layer = ANY (ARRAY['L1_platform','L3_tenant_passthrough','L4_consumer_direct'])
  );

-- 2. Extend shape check with L1_platform branch (tenant-shaped, no end-customer)
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT pme_layer_matches_subject;
ALTER TABLE public.platform_metered_events
  ADD CONSTRAINT pme_layer_matches_subject CHECK (
    (layer = 'L3_tenant_passthrough'
        AND subject_type = 'tenant'
        AND tenant_id IS NOT NULL
        AND consumer_user_id IS NULL
        AND consumer_subscription_id IS NULL)
    OR
    (layer = 'L4_consumer_direct'
        AND subject_type = 'consumer_user'
        AND consumer_user_id IS NOT NULL
        AND consumer_subscription_id IS NOT NULL
        AND tenant_id IS NULL
        AND end_customer_user_id IS NULL
        AND end_customer_contact_id IS NULL)
    OR
    (layer = 'L1_platform'
        AND subject_type = 'tenant'
        AND tenant_id IS NOT NULL
        AND consumer_user_id IS NULL
        AND consumer_subscription_id IS NULL
        AND end_customer_user_id IS NULL
        AND end_customer_contact_id IS NULL)
  );

-- 3. Extend enum allow-list on dead-letter table (nullable-safe;
--    shape-check intentionally absent so failed payloads can be captured)
ALTER TABLE public.platform_metered_events_dead_letter
  DROP CONSTRAINT pme_dl_layer_allowed;
ALTER TABLE public.platform_metered_events_dead_letter
  ADD CONSTRAINT pme_dl_layer_allowed CHECK (
    layer IS NULL
    OR layer = ANY (ARRAY['L1_platform','L3_tenant_passthrough','L4_consumer_direct'])
  );

COMMIT;

-- Rollback reference (do NOT run in same migration):
-- ALTER TABLE public.platform_metered_events DROP CONSTRAINT pme_layer_allowed;
-- ALTER TABLE public.platform_metered_events ADD CONSTRAINT pme_layer_allowed CHECK (layer = ANY (ARRAY['L3_tenant_passthrough','L4_consumer_direct']));
-- ALTER TABLE public.platform_metered_events DROP CONSTRAINT pme_layer_matches_subject;
-- ALTER TABLE public.platform_metered_events ADD CONSTRAINT pme_layer_matches_subject CHECK (<original 2-branch shape>);
-- ALTER TABLE public.platform_metered_events_dead_letter DROP CONSTRAINT pme_dl_layer_allowed;
-- ALTER TABLE public.platform_metered_events_dead_letter ADD CONSTRAINT pme_dl_layer_allowed CHECK (layer IS NULL OR layer = ANY (ARRAY['L3_tenant_passthrough','L4_consumer_direct']));