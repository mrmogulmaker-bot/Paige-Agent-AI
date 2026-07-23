-- =============================================================================
-- Migration 20250908112911 — §2 QUARANTINE STUB (deliberate no-op)
-- =============================================================================
-- This file is a DELIBERATE NO-OP replacement for the SQL recorded in prod
-- supabase_migrations.schema_migrations.statements for version 20250908112911.
-- It is NOT the original-authored migration and NOT the product of a db pull.
--
-- The recorded prod statements for this version seeded public.funding_offers
-- (Chase Ink, Bluevine, Kabbage, Equipment Finance, Ford — APR ranges,
-- affiliate_tag 'MOGUL_CHASE') and public.vendor_offers (Uline, Grainger,
-- Shell, Dell, Chase — code 'MOGUL001'). Those seed rows are funding/credit +
-- affiliate content and are DELIBERATELY OMITTED here under CLAUDE.md §2 — no
-- funding/credit content in platform defaults, no vertical seed in the platform
-- default registry — with explicit owner sign-off on 2026-07-22. Funding/credit
-- is an opt-in tenant preset, never a default seeded for every tenant.
--
-- SCHEMA IS UNAFFECTED: the funding_offers / vendor_offers table DDL is carried
-- by the §2-clean schema twin migration 20250908112841 (reconstructed
-- schema-only, no seed rows). This stub creates and seeds nothing.
--
-- LIVE STATE (verified on prod ref xygzykjyynhzqytbqnzu, 2026-07-22):
-- funding_offers = 0 rows and vendor_offers = 0 rows — the historical seed was
-- applied then deleted, so this is a migration-HISTORY concern, not a live-data
-- leak. Replacing the seed with this no-op means a fresh `supabase db reset`
-- ships both tables EMPTY / seedless, which is the intended §2-clean outcome.
--
-- Tracked debt: de-credit cluster #360 / #209.
-- =============================================================================

-- Intentional no-op: records the version in schema_migrations without applying
-- any DDL or DML. Safe and idempotent on every run.
DO $$
BEGIN
  -- §2 quarantine: funding_offers / vendor_offers seed rows intentionally
  -- omitted (see header). Table DDL is created by migration 20250908112841.
  NULL;
END $$;
