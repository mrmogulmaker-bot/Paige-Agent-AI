-- Deep-Research dossier enrichment (#166 v3) — universal Business/Entity
-- Intelligence Dossier. Adds ONE nullable column so a dossier run can persist its
-- gate-survived, per-field-cited entity profile alongside the existing findings.
--
-- ADDITIVE + back-compat: the column is nullable with no default row rewrite.
-- General-question runs (entityTarget === null) write NULL here and are byte-for-
-- byte unchanged. No new table, no RLS change — research_runs' existing policies
-- (mirrored from lender_research_results) already govern every column on the row.
--
-- Shape (see supabase/functions/paige-deep-research/index.ts → EntityProfile):
--   { name, kind, summary, people{status,items[],note}, divisions{…},
--     offerings{…}, locations{…}, unverified_notes[], headline, coverage{…} }
-- Every field inside carries its own *_citations proven against a cited source;
-- nothing here is stored unless it survived the deterministic validateProfile gate.

ALTER TABLE public.research_runs
  ADD COLUMN IF NOT EXISTS entity_profile jsonb;
