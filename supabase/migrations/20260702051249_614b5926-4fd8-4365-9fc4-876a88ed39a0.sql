-- ============================================================
-- Migration: platform_metered_events tighten §206 layer CHECK
-- Doctrines implemented:
--   §206 (Layer Discriminator on Every Cross-Layer Fact Table)
-- Related:
--   §197 (Four-Layer Billing Taxonomy — L3/L4 attribution)
--   §205 (Metering Safety Net — fail-loud invariants)
-- Doctrine files:
--   docs/security/DOCTRINE_206_LAYER_DISCRIMINATOR.md
--   docs/security/DOCTRINE_197_BILLING_LAYER_TAXONOMY.md
-- Gate: Sprint P.0.1 Gate 1 (Migration A.1 — hygiene tightening)
-- Rationale: original A CHECK didn't constrain end_customer_*
--   per layer, allowing L4 rows to silently accept garbage
--   tenant-passthrough attribution columns.
-- ============================================================

-- Pre-flight: verify no existing rows would fail the tightened constraint.
DO $$
DECLARE
  would_fail_count INT;
BEGIN
  SELECT COUNT(*)
  INTO would_fail_count
  FROM public.platform_metered_events
  WHERE NOT (
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
  );

  IF would_fail_count > 0 THEN
    RAISE EXCEPTION
      '§206 A.1 pre-flight FAILED: % rows would violate tightened CHECK. Aborting.',
      would_fail_count;
  END IF;
  RAISE NOTICE '§206 A.1 pre-flight PASSED. 0 rows would violate tightened CHECK.';
END $$;

-- Swap the constraint.
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT pme_layer_matches_subject,
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
  );

-- Post-flight: re-verify (constraint is now live; belt & suspenders).
DO $$
DECLARE
  invalid_row_count INT;
BEGIN
  SELECT COUNT(*)
  INTO invalid_row_count
  FROM public.platform_metered_events
  WHERE NOT (
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
  );

  IF invalid_row_count > 0 THEN
    RAISE EXCEPTION
      '§206 A.1 post-flight violation: % rows fail tightened CHECK',
      invalid_row_count;
  END IF;
  RAISE NOTICE '§206 A.1 post-flight PASSED. Tightened CHECK live and green.';
END $$;