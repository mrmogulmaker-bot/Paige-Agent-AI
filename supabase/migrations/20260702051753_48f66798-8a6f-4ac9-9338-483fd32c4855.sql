-- ============================================================
-- Migration A.2: idempotency_key on primary metered-events table
-- Doctrines implemented:
--   §205 (Metering Safety Net — completeness gap closure)
--   §208 (Shape Delta Discipline — codified in same PR)
-- Related:
--   §197 (Four-Layer Billing Taxonomy)
--   §206 (Layer Discriminator)
-- Doctrine files:
--   docs/security/DOCTRINE_205_METERING_SAFETY_NET.md
--   docs/security/DOCTRINE_208_SHAPE_DELTA_DISCIPLINE.md
-- Gate: Sprint P.0.1 Gate 1.2
-- ============================================================

-- 1. Add nullable first so backfill can populate.
ALTER TABLE public.platform_metered_events
  ADD COLUMN idempotency_key TEXT;

-- 2. Backfill legacy rows (audit shows 0 today; defensive anyway).
UPDATE public.platform_metered_events
   SET idempotency_key = 'legacy_pre_a2_' || id::text
 WHERE idempotency_key IS NULL;

-- 3. Enforce NOT NULL post-backfill.
ALTER TABLE public.platform_metered_events
  ALTER COLUMN idempotency_key SET NOT NULL;

-- 4. UNIQUE constraint on primary table.
ALTER TABLE public.platform_metered_events
  ADD CONSTRAINT platform_metered_events_idempotency_key_unique
  UNIQUE (idempotency_key);

-- 5. Assert dead-letter has same guarantee; create if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.platform_metered_events_dead_letter'::regclass
       AND c.contype = 'u'
       AND a.attname = 'idempotency_key'
  ) THEN
    ALTER TABLE public.platform_metered_events_dead_letter
      ADD CONSTRAINT platform_metered_events_dead_letter_idempotency_key_unique
      UNIQUE (idempotency_key);
    RAISE NOTICE 'Dead-letter UNIQUE constraint created (was missing).';
  ELSE
    RAISE NOTICE 'Dead-letter UNIQUE constraint already present (expected).';
  END IF;
END $$;

-- 6. Post-migration self-tests (§208-style belt-and-suspenders).
DO $$
DECLARE
  missing_key_count INT;
  dup_key_count INT;
BEGIN
  SELECT COUNT(*) INTO missing_key_count
    FROM public.platform_metered_events
   WHERE idempotency_key IS NULL;

  IF missing_key_count > 0 THEN
    RAISE EXCEPTION
      '§205 completeness violation: % rows have NULL idempotency_key',
      missing_key_count;
  END IF;

  SELECT COUNT(*) INTO dup_key_count FROM (
    SELECT idempotency_key
      FROM public.platform_metered_events
     GROUP BY idempotency_key
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_key_count > 0 THEN
    RAISE EXCEPTION
      '§205 uniqueness violation: % duplicate idempotency_key groups',
      dup_key_count;
  END IF;

  RAISE NOTICE
    '§205 A.2 self-test PASSED. All rows have unique idempotency_key on primary table.';
END $$;