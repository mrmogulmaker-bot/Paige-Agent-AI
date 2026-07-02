-- ============================================================
-- Migration: platform_metered_events layer discriminator
-- Doctrines implemented:
--   §206 (Layer Discriminator on Every Cross-Layer Fact Table)
--   §197 (Four-Layer Billing Taxonomy — L3/L4 attribution)
-- Related:
--   §205 (Metering Safety Net — dead-letter mirror columns)
--   §180 (SECURITY DEFINER hardening — search_path pinned)
-- Doctrine files:
--   docs/security/DOCTRINE_206_LAYER_DISCRIMINATOR.md
--   docs/security/DOCTRINE_197_BILLING_LAYER_TAXONOMY.md
-- Gate: Sprint P.0.1 Gate 1 (Migration A)
-- ============================================================

-- 1. Relax tenant_id nullability on primary fact table
ALTER TABLE public.platform_metered_events
  ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. Add discriminator + polymorphic subject + L4 attribution columns
ALTER TABLE public.platform_metered_events
  ADD COLUMN IF NOT EXISTS layer TEXT,
  ADD COLUMN IF NOT EXISTS subject_type TEXT,
  ADD COLUMN IF NOT EXISTS subject_id UUID,
  ADD COLUMN IF NOT EXISTS consumer_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS consumer_subscription_id UUID REFERENCES public.consumer_subscriptions(id) ON DELETE RESTRICT;

-- 3. Backfill existing rows as L3 (all pre-existing events are tenant passthrough)
UPDATE public.platform_metered_events
SET layer = COALESCE(layer, 'L3_tenant_passthrough'),
    subject_type = COALESCE(subject_type, 'tenant'),
    subject_id = COALESCE(subject_id, tenant_id)
WHERE layer IS NULL OR subject_type IS NULL OR subject_id IS NULL;

-- 4. Enforce NOT NULL on discriminator columns
ALTER TABLE public.platform_metered_events
  ALTER COLUMN layer SET NOT NULL,
  ALTER COLUMN subject_type SET NOT NULL,
  ALTER COLUMN subject_id SET NOT NULL;

-- 5. Constraints: allowed values + cross-consistency
ALTER TABLE public.platform_metered_events
  ADD CONSTRAINT pme_layer_allowed
    CHECK (layer IN ('L3_tenant_passthrough','L4_consumer_direct')),
  ADD CONSTRAINT pme_subject_type_allowed
    CHECK (subject_type IN ('tenant','consumer_user')),
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
        AND tenant_id IS NULL)
  );

-- 6. Trigger function: auto-populate subject_id from correct source column.
-- SECURITY INVOKER (default) — writes only to NEW; no privilege escalation.
-- search_path pinned per §180 hygiene (Catalog Category D — Trigger Function Hygiene).
CREATE OR REPLACE FUNCTION public.pme_set_subject_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.subject_id IS NULL THEN
    IF NEW.layer = 'L3_tenant_passthrough' THEN
      NEW.subject_id := NEW.tenant_id;
    ELSIF NEW.layer = 'L4_consumer_direct' THEN
      NEW.subject_id := NEW.consumer_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pme_set_subject_id_trg ON public.platform_metered_events;
CREATE TRIGGER pme_set_subject_id_trg
  BEFORE INSERT OR UPDATE ON public.platform_metered_events
  FOR EACH ROW EXECUTE FUNCTION public.pme_set_subject_id();

-- 7. Indexes for L4 attribution lookups
CREATE INDEX IF NOT EXISTS idx_pme_consumer_user
  ON public.platform_metered_events (consumer_user_id)
  WHERE consumer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pme_consumer_subscription
  ON public.platform_metered_events (consumer_subscription_id)
  WHERE consumer_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pme_layer_subject
  ON public.platform_metered_events (layer, subject_type, subject_id);

-- 8. Dead-letter mirror columns (§205 parity). Nullable — pre-§206 rows may lack layer.
ALTER TABLE public.platform_metered_events_dead_letter
  ADD COLUMN IF NOT EXISTS layer TEXT,
  ADD COLUMN IF NOT EXISTS subject_type TEXT,
  ADD COLUMN IF NOT EXISTS subject_id UUID,
  ADD COLUMN IF NOT EXISTS consumer_user_id UUID,
  ADD COLUMN IF NOT EXISTS consumer_subscription_id UUID;

ALTER TABLE public.platform_metered_events_dead_letter
  ADD CONSTRAINT pme_dl_layer_allowed
    CHECK (layer IS NULL OR layer IN ('L3_tenant_passthrough','L4_consumer_direct')),
  ADD CONSTRAINT pme_dl_subject_type_allowed
    CHECK (subject_type IS NULL OR subject_type IN ('tenant','consumer_user'));

CREATE INDEX IF NOT EXISTS idx_pme_dl_layer
  ON public.platform_metered_events_dead_letter (layer)
  WHERE layer IS NOT NULL;

-- ============================================================
-- POST-MIGRATION INVARIANT SELF-TESTS
-- ============================================================

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
        AND tenant_id IS NULL)
  );

  IF invalid_row_count > 0 THEN
    RAISE EXCEPTION
      '§206 invariant violation: % rows fail layer_matches_subject check',
      invalid_row_count;
  END IF;
  RAISE NOTICE '§206 invariant self-test PASSED. 0 rows violate layer_matches_subject.';
END $$;

DO $$
DECLARE
  null_layer_count INT;
BEGIN
  SELECT COUNT(*) INTO null_layer_count
  FROM public.platform_metered_events_dead_letter
  WHERE layer IS NULL;

  IF null_layer_count > 0 THEN
    RAISE NOTICE
      'Dead-letter has % pre-§206 rows with NULL layer; expected for pre-migration rows. Flag for manual layer backfill if any exist.',
      null_layer_count;
  END IF;
END $$;