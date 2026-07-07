-- =============================================================================
-- TASK #37 v1 — DIAGNOSTIC METRICS  (READ-ONLY — safe by design)
-- =============================================================================
-- Purpose: empirically size the `public` schema surface BEFORE building the v2
-- stitcher, and verify the four §208 review findings against real prod data
-- rather than speculation. DIAGNOSTIC ONLY — its output is NOT bootstrap input.
--
-- HOW TO RUN: paste this whole block into the Lovable Cloud SQL editor (source
-- project bfmyebsjyuoecmjskqhs) and run once. It returns ONE result set: one row
-- per metric, ordered. Copy the full table back for the report.
--
-- Every query is a pg_catalog / pg_depend read. No writes, no DDL, no locks.
-- =============================================================================
WITH metrics AS (
  SELECT 1 AS ord, 'extensions (excl plpgsql)' AS metric, count(*)::bigint AS cnt
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname <> 'plpgsql'
  UNION ALL
  SELECT 2, 'enum types (public)', count(*)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typtype = 'e'
  UNION ALL
  SELECT 3, 'domain types (public) [known-gap 2b]', count(*)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typtype = 'd'
  UNION ALL
  SELECT 4, 'composite types (public, standalone) [known-gap 2b]', count(*)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_class c ON c.oid = t.typrelid
   WHERE n.nspname = 'public' AND t.typtype = 'c' AND c.relkind = 'c'
  UNION ALL
  SELECT 5, 'sequences', count(*) FROM pg_sequences WHERE schemaname = 'public'
  UNION ALL
  SELECT 6, 'tables (ordinary, relkind r)', count(*)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 7, 'partitioned tables (relkind p) [known-gap — v1 unhandled]', count(*)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'p'
  UNION ALL
  SELECT 8, 'PK + UNIQUE constraints', count(*)
    FROM pg_constraint con JOIN pg_class r ON r.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'public' AND con.contype IN ('p','u')
  UNION ALL
  SELECT 9, 'foreign keys', count(*)
    FROM pg_constraint con JOIN pg_class r ON r.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'public' AND con.contype = 'f'
  UNION ALL
  SELECT 10, 'check constraints', count(*)
    FROM pg_constraint con JOIN pg_class r ON r.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'public' AND con.contype = 'c'
  UNION ALL
  SELECT 11, 'indexes (non PK/UNIQUE-backing)', count(*)
    FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
   WHERE n.nspname = 'public' AND NOT i.indisprimary
     AND NOT EXISTS (SELECT 1 FROM pg_constraint con
                      WHERE con.conindid = i.indexrelid AND con.contype IN ('p','u'))
  UNION ALL
  SELECT 12, 'functions + procedures', count(*)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
  UNION ALL
  -- Finding #1 scope: functions whose ACL was materialized (proacl NOT NULL means
  -- a GRANT/REVOKE touched it — i.e. the REVOKE-tightened set the v2 stitcher must
  -- reproduce with a leading REVOKE ALL … FROM PUBLIC, anon, authenticated.
  SELECT 13, 'functions w/ explicit ACL (proacl NOT NULL) [finding #1 scope]', count(*)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND p.proacl IS NOT NULL
  UNION ALL
  SELECT 14, 'triggers (non-internal)', count(*)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 15, 'views', count(*)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
  UNION ALL
  SELECT 16, 'materialized views', count(*)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'm'
  UNION ALL
  SELECT 17, 'RLS-enabled tables', count(*)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  UNION ALL
  SELECT 18, 'RLS-FORCE tables (relforcerowsecurity) [v1 unhandled if >0]', count(*)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
  UNION ALL
  SELECT 19, 'RLS policies', count(*)
    FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
  UNION ALL
  SELECT 20, 'rels w/ explicit ACL (table/view/matview/seq GRANT source)', count(*)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','S') AND c.relacl IS NOT NULL
  UNION ALL
  -- Finding #3 verification (the CONDITIONAL fix): if either of the next two is
  -- >= 1, the v2 stitcher must handle it in §4; if both 0, defer as documented gap.
  SELECT 21, 'IDENTITY columns (attidentity a/d) [finding #3]', count(*)
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attidentity IN ('a','d')
  UNION ALL
  SELECT 22, 'GENERATED STORED columns (attgenerated s) [finding #3]', count(*)
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = 's'
  UNION ALL
  -- Finding #2 blast radius (PRECISE, via pg_depend): column defaults that call a
  -- public function. These fail in §4 because tables are created before functions.
  SELECT 23, 'column DEFAULTs calling a public function [finding #2, exact]',
         count(DISTINCT ad.oid)
    FROM pg_attrdef ad
    JOIN pg_class c ON c.oid = ad.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_depend dep ON dep.objid = ad.oid AND dep.classid = 'pg_attrdef'::regclass
    JOIN pg_proc p ON p.oid = dep.refobjid AND dep.refclassid = 'pg_proc'::regclass
    JOIN pg_namespace pn ON pn.oid = p.pronamespace AND pn.nspname = 'public'
  UNION ALL
  -- Finding #4: §15 currently emits table comments only. These two show what is
  -- dropped if we do not extend it.
  SELECT 24, 'table comments', count(*)
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid AND d.objsubid = 0
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 25, 'column comments [finding #4 — dropped by v1 §15]', count(*)
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid AND d.objsubid > 0
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
  UNION ALL
  SELECT 26, 'function comments [finding #4 — dropped by v1 §15]', count(*)
    FROM pg_description d
    JOIN pg_proc p ON p.oid = d.objoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
)
SELECT ord, metric, cnt FROM metrics ORDER BY ord;
