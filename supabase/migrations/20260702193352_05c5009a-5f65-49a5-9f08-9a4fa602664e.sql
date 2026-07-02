-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT 211.b — LEGACY BTF/MMA PURGE + CONTENT MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
-- Depends on 211.a. §208 catches #9–#13.b logged; §211 sub-clauses on
-- snake_case regex boundaries + Class A/B token distinction; §212 sub-clause
-- on is_super_admin(uuid) semantic. Drop order arbitrary (0 FKs verified);
-- NO CASCADE anywhere — unexpected dependency fails-loud.
-- ═══════════════════════════════════════════════════════════════════════════

DO $chunk2$
DECLARE
  v_count_btf_document_requests    int;
  v_count_btf_messages             int;
  v_count_btf_phase_items          int;
  v_count_btf_phase_item_templates int;
  v_count_btf_workspace_invites    int;
  v_count_btf_workspace_settings   int;
  v_count_mma_os_bridge_outbox     int;
  v_count_paige_btf_documents      int;

  v_program_id       uuid;
  v_phase_build_id   uuid;
  v_phase_stack_id   uuid;
  v_phase_fund_id    uuid;
  v_items_inserted   int;
  v_doc_migrated_id  uuid;
BEGIN
  SELECT count(*) INTO v_count_btf_document_requests     FROM public.btf_document_requests;
  SELECT count(*) INTO v_count_btf_messages              FROM public.btf_messages;
  SELECT count(*) INTO v_count_btf_phase_items           FROM public.btf_phase_items;
  SELECT count(*) INTO v_count_btf_phase_item_templates  FROM public.btf_phase_item_templates;
  SELECT count(*) INTO v_count_btf_workspace_invites     FROM public.btf_workspace_invites;
  SELECT count(*) INTO v_count_btf_workspace_settings    FROM public.btf_workspace_settings;
  SELECT count(*) INTO v_count_mma_os_bridge_outbox      FROM public.mma_os_bridge_outbox;
  SELECT count(*) INTO v_count_paige_btf_documents       FROM public.paige_btf_documents;

  IF v_count_btf_document_requests    <> 0  THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] btf_document_requests expected 0, got %',    v_count_btf_document_requests;    END IF;
  IF v_count_btf_messages             <> 0  THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] btf_messages expected 0, got %',             v_count_btf_messages;             END IF;
  IF v_count_btf_phase_items          <> 0  THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] btf_phase_items expected 0, got %',          v_count_btf_phase_items;          END IF;
  IF v_count_btf_phase_item_templates <> 14 THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] btf_phase_item_templates expected 14, got %',v_count_btf_phase_item_templates; END IF;
  IF v_count_btf_workspace_invites    <> 2  THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] btf_workspace_invites expected 2, got %',    v_count_btf_workspace_invites;    END IF;
  IF v_count_btf_workspace_settings   <> 0  THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] btf_workspace_settings expected 0, got %',   v_count_btf_workspace_settings;   END IF;
  IF v_count_mma_os_bridge_outbox     <> 1  THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] mma_os_bridge_outbox expected 1, got %',     v_count_mma_os_bridge_outbox;     END IF;
  IF v_count_paige_btf_documents      <> 1  THEN RAISE EXCEPTION '[211.b Chunk 2 snapshot] paige_btf_documents expected 1, got %',      v_count_paige_btf_documents;      END IF;

  RAISE NOTICE '[211.b Chunk 2] §208 snapshot verified: 18 total rows across 8 legacy tables.';
  RAISE NOTICE '[211.b Chunk 2] Archive acknowledged: btf_workspace_invites rows + mma_os_bridge_outbox row previously written to /mnt/documents/archive_sprint_211_212/ before this migration.';

  INSERT INTO public.programs (tenant_id, slug, name, description, status, metadata)
  VALUES (
    NULL,
    'business-funding-journey',
    'Business Funding Journey',
    'Canonical progression from foundation-building through funding readiness to secured capital.',
    'active',
    jsonb_build_object(
      'migration_ship',           'SPRINT_211_212',
      'source',                   'btf_phase_item_templates',
      'migrated_from_legacy',     true,
      'legacy_source',            'btf_phases',
      'pending_reattribution_to', 'PME',
      'notes',                    'Phase names Build/Stack/Fund preserved as descriptive terms per §211 doctrine (Class B audit-lineage tokens are permitted in data). PME may rename phases post-Client-Re-Attribution sprint.'
    )
  )
  RETURNING id INTO v_program_id;

  INSERT INTO public.program_phases (program_id, slug, name, sort_order, metadata)
  VALUES (v_program_id, 'build', 'Build', 1, jsonb_build_object('migration_ship', 'SPRINT_211_212'))
  RETURNING id INTO v_phase_build_id;

  INSERT INTO public.program_phases (program_id, slug, name, sort_order, metadata)
  VALUES (v_program_id, 'stack', 'Stack', 2, jsonb_build_object('migration_ship', 'SPRINT_211_212'))
  RETURNING id INTO v_phase_stack_id;

  INSERT INTO public.program_phases (program_id, slug, name, sort_order, metadata)
  VALUES (v_program_id, 'fund',  'Fund',  3, jsonb_build_object('migration_ship', 'SPRINT_211_212'))
  RETURNING id INTO v_phase_fund_id;

  -- Fail-loud guard: program_phase_items.slug NOT NULL requires item_key non-null.
  IF (SELECT count(*) FROM public.btf_phase_item_templates WHERE item_key IS NULL) > 0 THEN
    RAISE EXCEPTION '[211.b Chunk 2 Step 2.4] btf_phase_item_templates has rows with NULL item_key — cannot satisfy program_phase_items.slug NOT NULL';
  END IF;

  WITH migrated AS (
    INSERT INTO public.program_phase_items
      (phase_id, slug, title, description, item_type, sort_order, required, metadata)
    SELECT
      CASE t.phase::text
        WHEN 'build' THEN v_phase_build_id
        WHEN 'stack' THEN v_phase_stack_id
        WHEN 'fund'  THEN v_phase_fund_id
      END,
      t.item_key,
      t.title,
      t.description,
      'task',
      t.sort_order,
      true,
      jsonb_build_object(
        'migration_ship',   'SPRINT_211_212',
        'source_table',     'btf_phase_item_templates',
        'source_id',        t.id,
        'original_phase',   t.phase::text,
        'assigned_to',      CASE t.assigned_to WHEN 'mma_team' THEN 'assigned_team' ELSE t.assigned_to END
      )
    FROM public.btf_phase_item_templates t
    WHERE t.is_active = true
    RETURNING 1
  )
  SELECT count(*) INTO v_items_inserted FROM migrated;

  IF v_items_inserted <> 14 THEN
    RAISE EXCEPTION '[211.b Chunk 2 Step 2.4] expected 14 items migrated, got %', v_items_inserted;
  END IF;

  -- Fail-loud guard: documents.user_id NOT NULL requires uploaded_by non-null.
  IF (SELECT count(*) FROM public.paige_btf_documents WHERE uploaded_by IS NULL) > 0 THEN
    RAISE EXCEPTION '[211.b Chunk 2 Step 2.5] paige_btf_documents has rows with NULL uploaded_by — cannot satisfy documents.user_id NOT NULL';
  END IF;

  INSERT INTO public.documents
    (user_id, client_id, document_type, file_name, file_path, file_size,
     mime_type, bucket_name, uploaded_at, metadata)
  SELECT
    p.uploaded_by,
    p.client_id,
    p.category,
    p.original_filename,
    p.storage_path,
    p.size_bytes::int4,
    p.mime,
    'btf-onboarding',
    p.uploaded_at,
    jsonb_build_object(
      'migration_ship',   'SPRINT_211_212',
      'source_table',     'paige_btf_documents',
      'source_id',        p.id,
      'legacy_bucket',    'btf-onboarding',
      'legacy_category',  p.category
    )
  FROM public.paige_btf_documents p
  RETURNING id INTO v_doc_migrated_id;

  RAISE NOTICE '[211.b Chunk 2] Migrated 1 document, new id = %', v_doc_migrated_id;
  RAISE NOTICE '[211.b Chunk 2] Case-3 storage orphan preserved in btf-onboarding bucket (agreement PDF, no DB tracking row). Sprint P.6 owns final disposition. This migration does NOT touch storage.objects.';
END
$chunk2$;

-- ─── Step 3.1: Drop 8 legacy tables (arbitrary order, NO CASCADE) ─────────
DROP TABLE public.btf_document_requests;
DROP TABLE public.btf_messages;
DROP TABLE public.btf_phase_items;
DROP TABLE public.btf_phase_item_templates;
DROP TABLE public.btf_workspace_invites;
DROP TABLE public.btf_workspace_settings;
DROP TABLE public.mma_os_bridge_outbox;
DROP TABLE public.paige_btf_documents;

-- ─── Belt-and-suspenders: verify no surviving consumers of legacy enums ──
DO $enum_pre_drop$
DECLARE
  v_dep_count int;
BEGIN
  SELECT count(*)
    INTO v_dep_count
    FROM pg_depend d
    JOIN pg_type   t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public'
     AND t.typname IN ('btf_doc_status', 'btf_item_status', 'btf_phase')
     AND d.deptype IN ('n','a');

  IF v_dep_count <> 0 THEN
    RAISE EXCEPTION '[211.b Chunk 3 pg_depend guard] % surviving dependency(ies) on legacy enums after table drops — cannot proceed to DROP TYPE.', v_dep_count;
  END IF;

  RAISE NOTICE '[211.b Chunk 3] pg_depend guard clean: 0 surviving enum consumers.';
END
$enum_pre_drop$;

DROP TYPE public.btf_doc_status;
DROP TYPE public.btf_item_status;
DROP TYPE public.btf_phase;

DROP FUNCTION public.btf_set_updated_at();

-- ─── V1–V8 in-transaction verification ────────────────────────────────────
DO $chunk3_verify$
DECLARE
  v_leftover_tables int;
  v_leftover_enums  int;
  v_leftover_fn     int;
  v_program_count   int;
  v_phase_count     int;
  v_item_count      int;
  v_doc_count       int;
  v_blocklist_hits  int;
  v_hit_detail      text;
BEGIN
  SELECT count(*) INTO v_leftover_tables
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'btf_document_requests','btf_messages','btf_phase_items',
       'btf_phase_item_templates','btf_workspace_invites',
       'btf_workspace_settings','mma_os_bridge_outbox','paige_btf_documents'
     );
  IF v_leftover_tables <> 0 THEN
    RAISE EXCEPTION '[211.b V1] % legacy table(s) still present in public schema', v_leftover_tables;
  END IF;

  SELECT count(*) INTO v_leftover_enums
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE t.typtype = 'e' AND n.nspname = 'public'
     AND t.typname IN ('btf_doc_status','btf_item_status','btf_phase');
  IF v_leftover_enums <> 0 THEN
    RAISE EXCEPTION '[211.b V2] % legacy enum(s) still present in public schema', v_leftover_enums;
  END IF;

  SELECT count(*) INTO v_leftover_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'btf_set_updated_at';
  IF v_leftover_fn <> 0 THEN
    RAISE EXCEPTION '[211.b V3] btf_set_updated_at() still present in pg_proc: % overload(s)', v_leftover_fn;
  END IF;

  SELECT count(*) INTO v_program_count
    FROM public.programs
   WHERE slug = 'business-funding-journey' AND tenant_id IS NULL;
  IF v_program_count <> 1 THEN
    RAISE EXCEPTION '[211.b V4] expected 1 business-funding-journey program row, got %', v_program_count;
  END IF;

  SELECT count(*) INTO v_phase_count
    FROM public.program_phases ph
    JOIN public.programs pr ON pr.id = ph.program_id
   WHERE pr.slug = 'business-funding-journey' AND pr.tenant_id IS NULL
     AND ph.slug IN ('build','stack','fund');
  IF v_phase_count <> 3 THEN
    RAISE EXCEPTION '[211.b V5] expected 3 phases (build/stack/fund), got %', v_phase_count;
  END IF;

  SELECT count(*) INTO v_item_count
    FROM public.program_phase_items
   WHERE metadata->>'migration_ship' = 'SPRINT_211_212'
     AND metadata->>'source_table'   = 'btf_phase_item_templates';
  IF v_item_count <> 14 THEN
    RAISE EXCEPTION '[211.b V6] expected 14 migrated program_phase_items, got %', v_item_count;
  END IF;

  SELECT count(*) INTO v_doc_count
    FROM public.documents
   WHERE metadata->>'migration_ship' = 'SPRINT_211_212'
     AND metadata->>'source_table'   = 'paige_btf_documents';
  IF v_doc_count <> 1 THEN
    RAISE EXCEPTION '[211.b V7] expected 1 migrated document, got %', v_doc_count;
  END IF;

  WITH pat AS (
    SELECT '(^|[^a-z0-9])(btf|b2f|build_to_fund|mma|mma_os|mogul_maker|mrmogulmaker|pme|project_mogul|tmg|treasury_media|mfs|mogul_funding|mcc|mogul_credit|coreconnect|disputera|aedis|givalli)($|[^a-z0-9])'::text AS re
  ),
  hits AS (
    SELECT 'table'::text AS kind, format('%I.%I', table_schema, table_name) AS obj
      FROM information_schema.tables, pat
     WHERE table_schema = 'public' AND table_name ~* pat.re
    UNION ALL
    SELECT 'function', format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_arguments(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, pat
     WHERE n.nspname = 'public' AND p.proname ~* pat.re
    UNION ALL
    SELECT 'enum', format('%I.%I', n.nspname, t.typname)
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace, pat
     WHERE t.typtype = 'e' AND n.nspname = 'public' AND t.typname ~* pat.re
  )
  SELECT count(*), coalesce(string_agg(kind || ':' || obj, ', '), '')
    INTO v_blocklist_hits, v_hit_detail
    FROM hits;

  IF v_blocklist_hits <> 0 THEN
    RAISE EXCEPTION '[211.b V8] brand-token blocklist tripped: % artifact(s) — %', v_blocklist_hits, v_hit_detail;
  END IF;

  RAISE NOTICE '[211.b V1–V8] all checkpoints green: 0 leftover tables, 0 leftover enums, 0 leftover function, 1 program, 3 phases, 14 items, 1 document, 0 blocklist hits.';
END
$chunk3_verify$;