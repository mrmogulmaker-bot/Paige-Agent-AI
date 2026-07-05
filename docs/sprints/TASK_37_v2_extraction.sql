-- =============================================================================
-- TASK #37 v2 — Schema-authoritative extraction for BYO provisioning (Phase 3, path A)
-- DRAFT v2 — FOR COWORK REVIEW. Do NOT run against prod until approved.
-- =============================================================================
-- Supersedes v1 (TASK_37_schema_extraction.sql). Same design: each numbered
-- section is a READ-ONLY query against pg_catalog that emits DDL text rows; run
-- in section order and concatenate the outputs into bootstrap-byo-schema.sql.
-- Scope: the `public` schema only (Supabase provides auth/storage/etc. natively).
--
-- v2 CHANGES — folded in from the v1 §208 review, calibrated to the empirical
-- metrics run against prod (bfmyebsjyuoecmjskqhs):
--   [#1  MUST]  §14 now emits `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon,
--               authenticated;` for every function BEFORE the positive grants.
--               Metrics: all 214 functions carry an explicit ACL; a freshly
--               created function otherwise defaults to EXECUTE-to-PUBLIC, so
--               without the REVOKE every tightened function would silently regain
--               public execute on BYO. (pg_dump-equivalent behaviour.)
--   [#2  N/A ]  DROPPED. Metric row 23 = 0 column DEFAULTs call a public function,
--               so the §4-before-§9 ordering hazard does not exist. No handling
--               built. (Also confirms none of the 4 generated exprs call a public fn.)
--   [#3  PART]  §4 now renders GENERATED … STORED columns as
--               `GENERATED ALWAYS AS (<expr>) STORED` (4 such columns). IDENTITY
--               columns = 0, so no identity handling is built.
--   [#4  MUST]  §15 now emits table (12) + column (14) + function (1) comments.
--   [gap] Views (11) are emitted in DEPENDENCY order via a recursive pg_depend
--         topo-sort, and merged with materialized views (2) into one ordered pass
--         (§11) so a view↔matview dependency can't break a fixed section boundary.
--   [gap] DROPPED as empirically absent (all 0): domain types, composite types,
--         partitioned tables, RLS-FORCE tables. No sections built for them.
--
-- ASSUMPTIONS (verify at apply time): BYO has the standard Supabase roles
--   (postgres, anon, authenticated, service_role) and the `extensions` schema.
--   Data (INSERTs) + sequence setval() come from the Phase-2 CSV import, NOT here.
-- SECTION ORDER (dependency-safe):
--   1 extensions · 2 enums · 3 sequences · 4 tables(cols) · 5 PK/UNIQUE · 6 FKs
--   7 checks · 8 indexes · 9 functions · 10 triggers · 11 views+matviews(topo)
--   12 RLS enable+policies · 13 GRANTs (REVOKE-then-GRANT) · 14 comments
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. EXTENSIONS  (8)
-- ---------------------------------------------------------------------------
SELECT format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', e.extname, n.nspname) AS ddl
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname <> 'plpgsql'
ORDER BY e.extname;


-- ---------------------------------------------------------------------------
-- 2. ENUM TYPES  (30)   [domains 0 / composites 0 — no sub-section needed]
-- ---------------------------------------------------------------------------
SELECT format(
         'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname=%L AND n.nspname=''public'') THEN CREATE TYPE public.%I AS ENUM (%s); END IF; END $$;',
         t.typname, t.typname,
         string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
       ) AS ddl
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;


-- ---------------------------------------------------------------------------
-- 3. SEQUENCES  (2)   (definition only; current values reset from Phase-2 data)
-- ---------------------------------------------------------------------------
SELECT format(
         'CREATE SEQUENCE IF NOT EXISTS public.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s%s;',
         sequencename, data_type, increment_by, min_value, max_value, start_value, cache_size,
         CASE WHEN cycle THEN ' CYCLE' ELSE '' END
       ) AS ddl
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;


-- ---------------------------------------------------------------------------
-- 4. TABLES — columns only.  (251 tables)
--    v2: column-constraint order matches pg_dump (type → GENERATED/DEFAULT →
--    NOT NULL); GENERATED STORED columns (4) render as GENERATED ALWAYS AS (…)
--    STORED, not DEFAULT. IDENTITY columns = 0 (none to handle).
-- ---------------------------------------------------------------------------
SELECT format(
         'CREATE TABLE IF NOT EXISTS public.%I (%s%s);',
         c.relname,
         E'\n  ',
         string_agg(
           format('%I %s%s%s',
             a.attname,
             pg_catalog.format_type(a.atttypid, a.atttypmod),
             CASE
               WHEN a.attgenerated = 's'
                 THEN ' GENERATED ALWAYS AS (' || pg_get_expr(ad.adbin, ad.adrelid) || ') STORED'
               WHEN ad.adbin IS NOT NULL
                 THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid)
               ELSE ''
             END,
             CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
           ),
           E',\n  ' ORDER BY a.attnum
         )
       ) AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname
ORDER BY c.relname;


-- ---------------------------------------------------------------------------
-- 5. PRIMARY KEY + UNIQUE constraints  (347)
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
              rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype IN ('p','u')
ORDER BY rel.relname, con.conname;


-- ---------------------------------------------------------------------------
-- 6. FOREIGN KEYS  (333)   (applied AFTER all tables exist)
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
              rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f'
ORDER BY rel.relname, con.conname;


-- ---------------------------------------------------------------------------
-- 7. CHECK constraints  (216)
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
              rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'c'
ORDER BY rel.relname, con.conname;


-- ---------------------------------------------------------------------------
-- 8. INDEXES  (399)   (excludes PK/UNIQUE-constraint-backing indexes)
-- ---------------------------------------------------------------------------
SELECT pg_get_indexdef(i.indexrelid) || ';' AS ddl
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_class tc ON tc.oid = i.indrelid
JOIN pg_namespace n ON n.oid = tc.relnamespace
WHERE n.nspname = 'public'
  AND NOT i.indisprimary
  AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid AND con.contype IN ('p','u'))
ORDER BY tc.relname, ic.relname;


-- ---------------------------------------------------------------------------
-- 9. FUNCTIONS + PROCEDURES  (214)   (bodies via pg_get_functiondef)
--    Captures the out-of-band drift objects too (email_queue_wake/dispatch, …).
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef(p.oid) || ';' AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f','p')
ORDER BY p.proname, p.oid;


-- ---------------------------------------------------------------------------
-- 10. TRIGGERS  (202)
-- ---------------------------------------------------------------------------
SELECT pg_get_triggerdef(t.oid) || ';' AS ddl
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;


-- ---------------------------------------------------------------------------
-- 11. VIEWS (11) + MATERIALIZED VIEWS (2) — DEPENDENCY-ORDERED (topo-sort).
--    v2: replaces v1's name-order + retry loop. `lvl` = longest dependency path
--    from a leaf; ORDER BY lvl ASC guarantees a referenced view/matview is
--    emitted before the object that selects from it. Views and matviews are
--    ordered together so a cross-dependency can't straddle a section boundary.
-- ---------------------------------------------------------------------------
WITH RECURSIVE rel_edges AS (
  -- edge: dependent relation (rw.ev_class) depends on referenced relation (refobjid)
  SELECT DISTINCT rw.ev_class AS rel_oid, d.refobjid AS depends_on
  FROM pg_depend d
  JOIN pg_rewrite rw ON rw.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dv  ON dv.oid = rw.ev_class AND dv.relkind IN ('v','m')
  JOIN pg_namespace dn ON dn.oid = dv.relnamespace AND dn.nspname = 'public'
  JOIN pg_class rc  ON rc.oid = d.refobjid AND rc.relkind IN ('v','m')
  JOIN pg_namespace rn ON rn.oid = rc.relnamespace AND rn.nspname = 'public'
  WHERE d.refobjid <> rw.ev_class          -- ignore a view's self-reference
    AND d.deptype = 'n'
),
lvl AS (
  -- leaves: view/matview that depends on no other public view/matview
  SELECT c.oid AS rel_oid, 0 AS depth
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
    AND NOT EXISTS (SELECT 1 FROM rel_edges e WHERE e.rel_oid = c.oid)
  UNION ALL
  SELECT e.rel_oid, l.depth + 1
  FROM rel_edges e
  JOIN lvl l ON l.rel_oid = e.depends_on
),
ranked AS (
  SELECT rel_oid, max(depth) AS depth FROM lvl GROUP BY rel_oid
)
SELECT
  CASE c.relkind
    WHEN 'v' THEN format('CREATE OR REPLACE VIEW public.%I AS %s', c.relname, pg_get_viewdef(c.oid, true))
    WHEN 'm' THEN format('CREATE MATERIALIZED VIEW IF NOT EXISTS public.%I AS %s', c.relname, pg_get_viewdef(c.oid, true))
  END AS ddl
FROM ranked r
JOIN pg_class c ON c.oid = r.rel_oid
ORDER BY r.depth, c.relkind, c.relname;


-- ---------------------------------------------------------------------------
-- 12a. ENABLE ROW LEVEL SECURITY  (251 tables)   [RLS-FORCE = 0, none to force]
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname) AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
ORDER BY c.relname;

-- 12b. RLS POLICIES  (750)
SELECT format(
         'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
         pol.polname, c.relname,
         CASE pol.polpermissive WHEN true THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
         CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
         COALESCE((SELECT string_agg(
                            CASE WHEN roleid = 0 THEN 'PUBLIC' ELSE quote_ident(rolname) END,
                            ', ' ORDER BY rolname)
                   FROM unnest(pol.polroles) AS roleid
                   LEFT JOIN pg_roles ON pg_roles.oid = roleid), 'PUBLIC'),
         CASE WHEN pol.polqual IS NOT NULL
              THEN ' USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')' ELSE '' END,
         CASE WHEN pol.polwithcheck IS NOT NULL
              THEN ' WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')' ELSE '' END
       ) AS ddl
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, pol.polname;


-- ---------------------------------------------------------------------------
-- 13. GRANTS — REVOKE-then-GRANT so tightened ACLs survive.  [finding #1]
--    Emit order: 13a table/view/seq grants, 13b function REVOKEs (ALL funcs),
--    13c function grants. 13b MUST precede 13c.
-- ---------------------------------------------------------------------------
-- 13a. table / view / matview / sequence privileges (266 rels w/ explicit ACL)
SELECT format('GRANT %s ON public.%I TO %s;',
              acl.privilege_type, c.relname,
              CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END) AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) acl
LEFT JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','S') AND c.relacl IS NOT NULL
ORDER BY c.relname, acl.grantee, acl.privilege_type;

-- 13b. function REVOKEs — strip the default PUBLIC execute for ALL 214 functions
--      BEFORE re-granting. Without this, a freshly created function on BYO keeps
--      EXECUTE-to-PUBLIC and every REVOKE-tightened function is silently loosened.
SELECT format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;',
              p.proname, pg_get_function_identity_arguments(p.oid)) AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
ORDER BY p.proname, p.oid;

-- 13c. function grants — restore exactly what prod's proacl lists (incl. any
--      legitimate PUBLIC grant, via the grantee=0 → PUBLIC mapping).
SELECT format('GRANT %s ON FUNCTION public.%I(%s) TO %s;',
              acl.privilege_type, p.proname, pg_get_function_identity_arguments(p.oid),
              CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END) AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) acl
LEFT JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND p.proacl IS NOT NULL
ORDER BY p.proname, acl.grantee, acl.privilege_type;


-- ---------------------------------------------------------------------------
-- 14. COMMENTS — table (12) + column (14) + function (1).  [finding #4]
-- ---------------------------------------------------------------------------
-- 14a. table comments
SELECT format('COMMENT ON TABLE public.%I IS %L;', c.relname, d.description) AS ddl
FROM pg_description d
JOIN pg_class c ON c.oid = d.objoid AND d.objsubid = 0
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 14b. column comments (on any relation in public — tables or views)
SELECT format('COMMENT ON COLUMN public.%I.%I IS %L;', c.relname, a.attname, d.description) AS ddl
FROM pg_description d
JOIN pg_class c ON c.oid = d.objoid
JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND d.objsubid > 0
ORDER BY c.relname, a.attnum;

-- 14c. function comments
SELECT format('COMMENT ON FUNCTION public.%I(%s) IS %L;',
              p.proname, pg_get_function_identity_arguments(p.oid), d.description) AS ddl
FROM pg_description d
JOIN pg_proc p ON p.oid = d.objoid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, p.oid;

-- =============================================================================
-- RESIDUAL KNOWN ITEMS (v2):
--   * §3 sequences: OWNED BY linkage not emitted (2 seqs; cosmetic for DROP
--     cascade — bootstrap doesn't rely on it). Flag if the 2 turn out to be
--     identity-owned (metrics say IDENTITY=0, so they are standalone/serial).
--   * §13a/§13c assume BYO has roles postgres/anon/authenticated/service_role
--     (Supabase default). A grantee role absent on BYO would error at apply.
--   * §9 dumps SECURITY DEFINER/search_path verbatim via pg_get_functiondef —
--     owners are whoever runs the bootstrap; verify no function hard-depends on
--     a prod-specific owner.
-- =============================================================================
