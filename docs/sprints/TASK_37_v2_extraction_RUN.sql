-- =============================================================================
-- TASK #37 v2 — RUN FORM (paste-ready for the Lovable Cloud SQL editor)
-- =============================================================================
-- Companion to TASK_37_v2_extraction.sql. Same 14 sections, but each is wrapped
-- so it returns EXACTLY ONE ROW whose single cell (`section_ddl`) is that entire
-- section's DDL (statements joined by newlines).
--
-- WHY THIS FORM: the raw extraction emits ~4,000 rows; the Supabase SQL editor
-- truncates its results pane (~1,000 rows), which would silently drop the tail of
-- a single combined query. One row per section sidesteps the cap entirely, keeps
-- copy-back unambiguous (one cell = one section), and isolates any error to its
-- own section.
--
-- HOW TO RUN (extract from prod, then APPLY to BYO in dependency order):
--   1. Run each block to extract; copy each `section_ddl` cell.
--   2. APPLY ORDER (proven during the BYO bootstrap — NOT plain file order):
--        01→02→03→04→05→06→07→08a→09a→11→08b→09b→10→12→13→14
--      i.e. table-indexes(08a) + relation-independent fns(09a) BEFORE views(11);
--      matview-indexes(08b) + relation-dependent fns(09b) AFTER views(11).
--   3. Apply §09a and §09b each with `SET check_function_bodies = false;` prepended.
-- Ordering WITHIN a section is cosmetic EXCEPT §11 (views/matviews), which is
-- dependency-ordered via the recursive CTE — do not reorder its output.
--
-- NOTE on §9 (functions): its one cell is large (~214 bodies). If the editor is
-- unwieldy with it, run the §9 block from TASK_37_v2_extraction.sql instead (214
-- rows, under the row cap) — same output, just multi-row.
--
-- Validated: every section below executed with 0 errors against a live PG 17.6
-- (read-only). Verified syntactically clean before this prod run.
-- =============================================================================


-- ===== 01 · EXTENSIONS =======================================================
SELECT '01_extensions' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', e.extname, n.nspname) AS ddl
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname <> 'plpgsql'
) s;

-- ===== 02 · ENUM TYPES =======================================================
SELECT '02_enums' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT format(
           'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname=%L AND n.nspname=''public'') THEN CREATE TYPE public.%I AS ENUM (%s); END IF; END $$;',
           t.typname, t.typname,
           string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
         ) AS ddl
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' GROUP BY t.typname
) s;

-- ===== 03 · SEQUENCES ========================================================
SELECT '03_sequences' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT format(
           'CREATE SEQUENCE IF NOT EXISTS public.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s%s;',
           sequencename, data_type, increment_by, min_value, max_value, start_value, cache_size,
           CASE WHEN cycle THEN ' CYCLE' ELSE '' END
         ) AS ddl
  FROM pg_sequences WHERE schemaname = 'public'
) s;

-- ===== 04 · TABLES (columns; GENERATED STORED handled) =======================
SELECT '04_tables' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT format(
           'CREATE TABLE IF NOT EXISTS public.%I (%s%s);',
           c.relname, E'\n  ',
           string_agg(
             format('%I %s%s%s',
               a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
               CASE
                 WHEN a.attgenerated = 's'
                   THEN ' GENERATED ALWAYS AS (' || pg_get_expr(ad.adbin, ad.adrelid) || ') STORED'
                 WHEN ad.adbin IS NOT NULL
                   THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid)
                 ELSE '' END,
               CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
             ), E',\n  ' ORDER BY a.attnum
           )
         ) AS ddl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind = 'r' GROUP BY c.relname
) s;

-- ===== 05 · PRIMARY KEY + UNIQUE =============================================
SELECT '05_pk_unique' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
  FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND con.contype IN ('p','u')
) s;

-- ===== 06 · FOREIGN KEYS =====================================================
SELECT '06_foreign_keys' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
  FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND con.contype = 'f'
) s;

-- ===== 07 · CHECK CONSTRAINTS ================================================
SELECT '07_checks' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
  FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public' AND con.contype = 'c'
) s;

-- ===== 08a · TABLE INDEXES (relkind='r') =====================================
SELECT '08a_table_indexes' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT pg_get_indexdef(i.indexrelid) || ';' AS ddl
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid JOIN pg_namespace n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public' AND tc.relkind = 'r' AND NOT i.indisprimary
    AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid AND con.contype IN ('p','u'))
) s;

-- ===== 08b · MATVIEW INDEXES (relkind='m') — RUN AFTER §11 ====================
SELECT '08b_matview_indexes' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT pg_get_indexdef(i.indexrelid) || ';' AS ddl
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid JOIN pg_namespace n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public' AND tc.relkind = 'm' AND NOT i.indisprimary
    AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid AND con.contype IN ('p','u'))
) s;

-- ===== 09 · FUNCTIONS — run BOTH phases with SET check_function_bodies=false ==
-- 09a: relation-independent functions — RUN BEFORE §11
SELECT '09a_functions' AS section, string_agg(ddl, E'\n\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT pg_get_functiondef(p.oid) || ';' AS ddl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    AND NOT EXISTS (SELECT 1 FROM pg_class rc JOIN pg_namespace rn ON rn.oid=rc.relnamespace
                    WHERE rn.nspname='public' AND rc.relkind IN ('v','m')
                      AND (rc.reltype = p.prorettype OR rc.reltype = ANY (p.proargtypes)))
) s;

-- 09b: relation-dependent functions (signature references a view/matview) — RUN AFTER §11
SELECT '09b_functions' AS section, string_agg(ddl, E'\n\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT pg_get_functiondef(p.oid) || ';' AS ddl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    AND EXISTS (SELECT 1 FROM pg_class rc JOIN pg_namespace rn ON rn.oid=rc.relnamespace
                WHERE rn.nspname='public' AND rc.relkind IN ('v','m')
                  AND (rc.reltype = p.prorettype OR rc.reltype = ANY (p.proargtypes)))
) s;

-- ===== 10 · TRIGGERS =========================================================
SELECT '10_triggers' AS section, string_agg(ddl, E'\n' ORDER BY ddl) AS section_ddl FROM (
  SELECT pg_get_triggerdef(t.oid) || ';' AS ddl
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
) s;

-- ===== 11 · VIEWS + MATERIALIZED VIEWS (DEPENDENCY-ORDERED — DO NOT REORDER) ==
SELECT '11_views_matviews' AS section,
       string_agg(ddl, E'\n' ORDER BY depth, relkind, relname) AS section_ddl
FROM (
  WITH RECURSIVE rel_edges AS (
    SELECT DISTINCT rw.ev_class AS rel_oid, d.refobjid AS depends_on
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
    JOIN pg_class dv  ON dv.oid = rw.ev_class AND dv.relkind IN ('v','m')
    JOIN pg_namespace dn ON dn.oid = dv.relnamespace AND dn.nspname = 'public'
    JOIN pg_class rc  ON rc.oid = d.refobjid AND rc.relkind IN ('v','m')
    JOIN pg_namespace rn ON rn.oid = rc.relnamespace AND rn.nspname = 'public'
    WHERE d.refobjid <> rw.ev_class AND d.deptype = 'n'
  ),
  lvl AS (
    SELECT c.oid AS rel_oid, 0 AS depth
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
      AND NOT EXISTS (SELECT 1 FROM rel_edges e WHERE e.rel_oid = c.oid)
    UNION ALL
    SELECT e.rel_oid, l.depth + 1 FROM rel_edges e JOIN lvl l ON l.rel_oid = e.depends_on
  ),
  ranked AS (SELECT rel_oid, max(depth) AS depth FROM lvl GROUP BY rel_oid)
  SELECT r.depth, c.relkind, c.relname,
    CASE c.relkind
      WHEN 'v' THEN format('CREATE OR REPLACE VIEW public.%I AS %s', c.relname, pg_get_viewdef(c.oid, true))
      WHEN 'm' THEN format('CREATE MATERIALIZED VIEW IF NOT EXISTS public.%I AS %s', c.relname, pg_get_viewdef(c.oid, true))
    END AS ddl
  FROM ranked r JOIN pg_class c ON c.oid = r.rel_oid
) s;

-- ===== 12 · RLS ENABLE + POLICIES ============================================
SELECT '12_rls' AS section, string_agg(ddl, E'\n' ORDER BY ord, ddl) AS section_ddl FROM (
  SELECT 0 AS ord, format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname) AS ddl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  UNION ALL
  SELECT 1 AS ord, format(
           'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
           pol.polname, c.relname,
           CASE pol.polpermissive WHEN true THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
           CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
           COALESCE((SELECT string_agg(CASE WHEN roleid = 0 THEN 'PUBLIC' ELSE quote_ident(rolname) END, ', ' ORDER BY rolname)
                     FROM unnest(pol.polroles) AS roleid LEFT JOIN pg_roles ON pg_roles.oid = roleid), 'PUBLIC'),
           CASE WHEN pol.polqual IS NOT NULL THEN ' USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')' ELSE '' END,
           CASE WHEN pol.polwithcheck IS NOT NULL THEN ' WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')' ELSE '' END
         ) AS ddl
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
) s;

-- ===== 13 · GRANTS (table grants · fn REVOKEs · fn GRANTs — in that order) ===
SELECT '13_grants' AS section, string_agg(ddl, E'\n' ORDER BY ord, ddl) AS section_ddl FROM (
  -- 13a table/view/matview/sequence grants
  SELECT 0 AS ord, format('GRANT %s ON public.%I TO %s;', acl.privilege_type, c.relname,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END) AS ddl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) acl LEFT JOIN pg_roles r ON r.oid = acl.grantee
  WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','S') AND c.relacl IS NOT NULL
    AND (acl.grantee = 0 OR r.rolname IN ('postgres','anon','authenticated','service_role'))
  UNION ALL
  -- 13b function REVOKEs (strip default PUBLIC execute for all functions)
  SELECT 1 AS ord, format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;',
           p.proname, pg_get_function_identity_arguments(p.oid)) AS ddl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
  UNION ALL
  -- 13c function grants (restore prod's proacl exactly, incl. any PUBLIC)
  SELECT 2 AS ord, format('GRANT %s ON FUNCTION public.%I(%s) TO %s;',
           acl.privilege_type, p.proname, pg_get_function_identity_arguments(p.oid),
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END) AS ddl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) acl LEFT JOIN pg_roles r ON r.oid = acl.grantee
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND p.proacl IS NOT NULL
    AND (acl.grantee = 0 OR r.rolname IN ('postgres','anon','authenticated','service_role'))
) s;

-- ===== 14 · COMMENTS (table · column · function) =============================
SELECT '14_comments' AS section, string_agg(ddl, E'\n' ORDER BY ord, ddl) AS section_ddl FROM (
  SELECT 0 AS ord, format('COMMENT ON TABLE public.%I IS %L;', c.relname, d.description) AS ddl
  FROM pg_description d JOIN pg_class c ON c.oid = d.objoid AND d.objsubid = 0
  JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 1 AS ord, format('COMMENT ON COLUMN public.%I.%I IS %L;', c.relname, a.attname, d.description) AS ddl
  FROM pg_description d JOIN pg_class c ON c.oid = d.objoid
  JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid
  JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND d.objsubid > 0
  UNION ALL
  SELECT 2 AS ord, format('COMMENT ON FUNCTION public.%I(%s) IS %L;',
           p.proname, pg_get_function_identity_arguments(p.oid), d.description) AS ddl
  FROM pg_description d JOIN pg_proc p ON p.oid = d.objoid
  JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
) s;
