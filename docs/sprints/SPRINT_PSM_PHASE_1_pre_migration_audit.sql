-- SPRINT P.S.M — Phase 1 pre-migration audit (READ-ONLY).
-- Run in the SOURCE project's Supabase SQL editor. Produces one JSON blob:
--   tables + row estimates + bytes, FK edges (for FK-safe import order),
--   sequences (for setval reset), extensions (flags pgsodium/vault),
--   cron jobs, storage buckets + object counts, and _internal_secrets KEY NAMES.
-- No secret values are ever selected.
SELECT jsonb_build_object(
  'generated_at', now(),

  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', schemaname, 'table', relname,
      'est_rows', n_live_tup, 'total_bytes', pg_total_relation_size(relid)
    ) ORDER BY n_live_tup DESC)
    FROM pg_stat_user_tables
  ),

  'fk_edges', (
    SELECT jsonb_agg(jsonb_build_object(
      'child', tc.table_name, 'parent', ccu.table_name, 'constraint', tc.constraint_name
    ))
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  ),

  'sequences', (
    SELECT jsonb_agg(jsonb_build_object('sequence', sequencename, 'last_value', last_value))
    FROM pg_sequences WHERE schemaname = 'public'
  ),

  'extensions', (
    SELECT jsonb_agg(jsonb_build_object('name', extname, 'version', extversion))
    FROM pg_extension
  ),

  'cron_jobs', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'jobid', jobid, 'schedule', schedule, 'jobname', jobname, 'active', active
    )), '[]'::jsonb)
    FROM cron.job
  ),

  'storage_buckets', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'public', b.public,
      'object_count', (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id)
    ))
    FROM storage.buckets b
  ),

  -- Crown-jewel dependency: the app-internal encryption keys live HERE as table
  -- rows (consumed by SECURITY DEFINER pgp_sym functions), NOT as env secrets.
  -- This table MUST be included in the Phase 2 data export or QuickBooks /
  -- automation-webhook decryption breaks on BYO. Names + presence only, no values.
  'internal_secrets_keys', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'key', key, 'has_value', (value IS NOT NULL AND length(value) > 0)
    )), '[]'::jsonb)
    FROM public._internal_secrets
  )
) AS migration_inventory;
