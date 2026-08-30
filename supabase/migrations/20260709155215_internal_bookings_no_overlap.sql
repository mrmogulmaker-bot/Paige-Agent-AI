-- =============================================================================
-- Migration 20260709155215 — REPLAY STUB (deliberate no-op, content twin)
-- =============================================================================
-- This version and 20260709100000 are the SAME migration applied twice under two
-- stamps: one is the repo's authored file, the other the reconstruction of the
-- same SQL from prod's schema_migrations.statements (task #421). Their bodies
-- are IDENTICAL once comments and whitespace are normalised away — verified by
-- comparing `sed 's/--.*$//' | tr -s '[:space:]' ' '` on both files.
--
-- BOTH stamps are recorded on prod, so BOTH files must keep existing for
-- `supabase db push`'s "remote migration versions not found in local" history
-- guard. Neither is ever re-run there.
--
-- On a FRESH replay (`db reset`, every Supabase Preview branch) they both ran,
-- and this one — the later of the two — aborted on a non-idempotent statement
-- against the object its twin had just created. Because the two bodies are
-- equivalent, everything this file did is already done by
--   20260709100000_internal_bookings_no_overlap.sql
-- so making it a no-op leaves the replayed schema byte-identical while letting
-- the replay finish.
--
-- The original body remains in git history and in prod's own
-- schema_migrations.statements.
--
-- Precedent: 20250908112911_remote_bootstrap_funding_seed_quarantined.sql.
-- =============================================================================

DO $$
BEGIN
  -- Intentional no-op: this migration's effect is applied by its content twin
  -- 20260709100000_internal_bookings_no_overlap.sql.
  NULL;
END $$;
