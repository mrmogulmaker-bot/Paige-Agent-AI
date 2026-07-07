-- =============================================================================
-- TASK #37 — Schema-authoritative extraction for BYO provisioning (Phase 3, path A)
-- DRAFT v1 — FOR ANTONIO / COWORK REVIEW. Do NOT run against prod until approved.
-- =============================================================================
-- Context: Lovable Cloud exposes NO direct Postgres connection string, so
-- `pg_dump --schema-only` is unavailable. Extraction runs through the Cloud SQL
-- editor instead. Each numbered section is a READ-ONLY query against pg_catalog /
-- information_schema that emits DDL text rows. Run each in order; the stitcher
-- (Task #37 step 2) concatenates the outputs into bootstrap-byo-schema.sql in this
-- exact section order.
--
-- Scope: the `public` schema only. Supabase provides auth/storage/realtime/graphql
-- etc. natively on BYO, so we do NOT extract those. FKs pointing at auth.users are
-- fine (BYO has the auth schema).
--
-- Determinism: every query has an ORDER BY so re-runs produce identical output.
-- Idempotence: DDL uses IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS where the
-- object type allows, so bootstrap-byo-schema.sql is safe to re-run.
--
-- SECTION ORDER (dependency-safe):
--   1 extensions  2 enums/domains/composite types  3 sequences  4 tables (columns)
--   5 primary/unique keys  6 foreign keys  7 check constraints  8 indexes
--   9 functions  10 triggers  11 views  12 materialized views
--   13 RLS enable + policies  14 GRANTs/REVOKEs  15 comments
-- Data (INSERTs) and sequence setval() are NOT here — they come from the Phase-2
-- CSV export/import (see PHASE-2 HARD RULE re: _internal_secrets ON CONFLICT DO UPDATE).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ---------------------------------------------------------------------------
SELECT format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', e.extname, n.nspname) AS ddl
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname <> 'plpgsql'
ORDER BY e.extname;


-- ---------------------------------------------------------------------------
-- 2a. ENUM TYPES
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

-- 2b. DOMAINS + COMPOSITE TYPES (review manually if any rows return; rarer)
SELECT format('-- REVIEW non-enum type: %I (typtype=%s)', t.typname, t.typtype) AS ddl
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typtype IN ('d','c')                       -- domain, composite
  AND t.typname NOT LIKE '\_%'                      -- skip implicit array/rowtypes
ORDER BY t.typname;


-- ---------------------------------------------------------------------------
-- 3. SEQUENCES (definition only; current values are reset from data in Phase 3)
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
-- 4. TABLES — columns only (PK/FK/CHECK/indexes come in later sections).
--    Postgres has no built-in CREATE TABLE generator, so we assemble per table.
--    Emits: CREATE TABLE IF NOT EXISTS public.<t> ( <col defs> );
--    Identity/serial defaults are captured from column_default verbatim.
-- ---------------------------------------------------------------------------
SELECT format(
         'CREATE TABLE IF NOT EXISTS public.%I (%s%s);',
         c.relname,
         E'\n  ',
         string_agg(
           format('%I %s%s%s',
             a.attname,
             pg_catalog.format_type(a.atttypid, a.atttypmod),
             CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
             CASE WHEN ad.adbin IS NOT NULL
                  THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid)
                  ELSE '' END
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
-- 5. PRIMARY KEY + UNIQUE constraints  (pg_get_constraintdef is authoritative)
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
              rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype IN ('p','u')
ORDER BY rel.relname, con.conname;


-- ---------------------------------------------------------------------------
-- 6. FOREIGN KEYS  (applied AFTER all tables exist)
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
              rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f'
ORDER BY rel.relname, con.conname;


-- ---------------------------------------------------------------------------
-- 7. CHECK constraints
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
              rel.relname, con.conname, pg_get_constraintdef(con.oid)) AS ddl
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'c'
ORDER BY rel.relname, con.conname;


-- ---------------------------------------------------------------------------
-- 8. INDEXES (excludes those backing PK/UNIQUE constraints from section 5)
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
-- 9. FUNCTIONS (bodies included; pg_get_functiondef emits full CREATE OR REPLACE)
--    NOTE: this is where the out-of-band drift objects (email_queue_wake,
--    email_queue_dispatch, etc.) get captured for BYO — the whole point of path A.
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef(p.oid) || ';' AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f','p')                        -- function, procedure (skip aggregates/windows)
ORDER BY p.proname, p.oid;


-- ---------------------------------------------------------------------------
-- 10. TRIGGERS
-- ---------------------------------------------------------------------------
SELECT pg_get_triggerdef(t.oid) || ';' AS ddl
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;


-- ---------------------------------------------------------------------------
-- 11. VIEWS (create in dependency order; if the SQL editor errors on ordering,
--     the stitcher wraps each in a retry loop — see Task #37 step 2)
-- ---------------------------------------------------------------------------
SELECT format('CREATE OR REPLACE VIEW public.%I AS %s', c.relname, pg_get_viewdef(c.oid, true)) AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY c.relname;


-- ---------------------------------------------------------------------------
-- 12. MATERIALIZED VIEWS
-- ---------------------------------------------------------------------------
SELECT format('CREATE MATERIALIZED VIEW IF NOT EXISTS public.%I AS %s', c.relname, pg_get_viewdef(c.oid, true)) AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'm'
ORDER BY c.relname;


-- ---------------------------------------------------------------------------
-- 13a. ENABLE ROW LEVEL SECURITY per table
-- ---------------------------------------------------------------------------
SELECT format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname) AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
ORDER BY c.relname;

-- 13b. RLS POLICIES
SELECT format(
         'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
         pol.polname, c.relname,
         CASE pol.polpermissive WHEN true THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
         CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
         COALESCE((SELECT string_agg(quote_ident(rolname), ', ' ORDER BY rolname)
                   FROM pg_roles WHERE oid = ANY (pol.polroles)), 'public'),
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
-- 14. GRANTS / REVOKES on tables and functions (role-based ACLs)
--     Uses aclexplode to enumerate explicit grants. Default PUBLIC grants on
--     functions are captured too; the stitcher can filter noise if needed.
-- ---------------------------------------------------------------------------
-- 14a. table/view/sequence privileges
SELECT format('GRANT %s ON public.%I TO %I;',
              acl.privilege_type, c.relname, r.rolname) AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) acl
JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','S') AND c.relacl IS NOT NULL
ORDER BY c.relname, r.rolname, acl.privilege_type;

-- 14b. function/procedure EXECUTE privileges (captures the REVOKE-tightened set)
SELECT format('GRANT %s ON FUNCTION public.%I(%s) TO %I;',
              acl.privilege_type, p.proname, pg_get_function_identity_arguments(p.oid), r.rolname) AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) acl
JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public' AND p.proacl IS NOT NULL
ORDER BY p.proname, r.rolname, acl.privilege_type;


-- ---------------------------------------------------------------------------
-- 15. COMMENTS (tables, columns, functions) — optional but preserves docs
-- ---------------------------------------------------------------------------
SELECT format('COMMENT ON TABLE public.%I IS %L;', c.relname, d.description) AS ddl
FROM pg_description d
JOIN pg_class c ON c.oid = d.objoid AND d.objsubid = 0
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- =============================================================================
-- KNOWN GAPS / REVIEW ITEMS (v1):
--   * Section 4 assembles CREATE TABLE from pg_attribute; verify generated/identity
--     columns render acceptably (GENERATED ... AS IDENTITY may appear via default).
--   * Section 11 views: emitted in name order, not dependency order — the stitcher
--     must apply them with retry, or we topologically sort via pg_depend in v2.
--   * Section 2b flags domains/composite types for manual handling if any exist.
--   * Partitioned tables (relkind 'p') are NOT yet handled — add if the audit finds any.
--   * This extracts DDL only; DATA + sequence setval come from the Phase-2 CSV import.
-- =============================================================================
