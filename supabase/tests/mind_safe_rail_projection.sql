-- =============================================================================
-- Mind safe Context Rail resolver -- disposable authenticated-role proof
--
-- Run only against a disposable full-history database:
--   psql "$DB_URL" -1 -f supabase/tests/mind_safe_rail_projection.sql
--
-- The transaction creates adversarial real-role fixtures and rolls them back.
-- =============================================================================
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('7a110000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'mind-rail-owner@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'mind-rail-admin@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'mind-rail-coach@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'mind-rail-member@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'mind-rail-other@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'mind-rail-no-tenant@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'mind-rail-linked-client@x.invalid');

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('7a110000-0000-0000-0000-000000001111', 'mind-rail-t1', 'Mind Rail T1', 'active', 'standalone', 'MRT1', '{}'::jsonb),
  ('7a110000-0000-0000-0000-000000002222', 'mind-rail-t2', 'Mind Rail T2', 'active', 'standalone', 'MRT2', '{}'::jsonb);

INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('7a110000-0000-0000-0000-0000000000a2', NULL),
  ('7a110000-0000-0000-0000-0000000000a1', NULL),
  ('7a110000-0000-0000-0000-0000000000c1', NULL),
  ('7a110000-0000-0000-0000-0000000000b1', NULL),
  ('7a110000-0000-0000-0000-0000000000d1', NULL),
  ('7a110000-0000-0000-0000-0000000000e1', NULL),
  ('7a110000-0000-0000-0000-0000000000f1', NULL)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000a2', 'owner', 'active', true, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000a1', 'admin', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000c1', 'coach', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000b1', 'member', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000002222', '7a110000-0000-0000-0000-0000000000d1', 'admin', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000f1', 'member', 'active', false, now());

UPDATE public.profiles
SET active_tenant_id = CASE user_id
  WHEN '7a110000-0000-0000-0000-0000000000d1'::uuid THEN '7a110000-0000-0000-0000-000000002222'::uuid
  WHEN '7a110000-0000-0000-0000-0000000000e1'::uuid THEN NULL
  ELSE '7a110000-0000-0000-0000-000000001111'::uuid
END
WHERE user_id IN (
  '7a110000-0000-0000-0000-0000000000a2',
  '7a110000-0000-0000-0000-0000000000a1',
  '7a110000-0000-0000-0000-0000000000c1',
  '7a110000-0000-0000-0000-0000000000b1',
  '7a110000-0000-0000-0000-0000000000d1',
  '7a110000-0000-0000-0000-0000000000e1',
  '7a110000-0000-0000-0000-0000000000f1'
);

INSERT INTO public.user_roles (user_id, role)
VALUES ('7a110000-0000-0000-0000-0000000000f1', 'client')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.clients (id, tenant_id, created_by, first_name, last_name, linked_user_id) VALUES
  ('7a110000-0000-0000-0000-00000000c111', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-0000000000a1', 'Rail', 'One', '7a110000-0000-0000-0000-0000000000f1'),
  ('7a110000-0000-0000-0000-00000000c222', '7a110000-0000-0000-0000-000000002222',
   '7a110000-0000-0000-0000-0000000000d1', 'Rail', 'Two', NULL);

-- Adversarial producer content occupies every forbidden raw field. The resolver
-- must return none of it, even for authorized staff.
INSERT INTO public.paige_client_events (
  id, tenant_id, contact_id, event_kind, surface, actor_type, audience,
  visibility, title, summary, payload, ref_table, ref_id, occurred_at
) VALUES
  ('7a110000-0000-0000-0000-00000000e111', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-00000000c111', 'comms.inbound', 'client_portal', 'client',
   'both', 'client_visible', 'INBOUND_TITLE_SENTINEL', 'RAW_INBOUND_MESSAGE_SENTINEL',
   '{"body":"RAW_INBOUND_PAYLOAD_SENTINEL","secret":"SECRET_LIKE_SENTINEL"}'::jsonb,
   'external_messages', '7a110000-0000-0000-0000-00000000a111', now() - interval '3 minutes'),
  ('7a110000-0000-0000-0000-00000000e112', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-00000000c111', 'comms.outbound', 'your_paige', 'paige_agent',
   'both', 'client_visible', 'OUTBOUND_TITLE_SENTINEL', 'RAW_OUTBOUND_MESSAGE_SENTINEL',
   '{"body":"RAW_OUTBOUND_PAYLOAD_SENTINEL"}'::jsonb,
   'external_messages', '7a110000-0000-0000-0000-00000000a112', now() - interval '2 minutes'),
  ('7a110000-0000-0000-0000-00000000e113', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-00000000c111', 'client.message', 'contact_paige', 'client',
   'both', 'client_visible', 'PAIGE_PROMPT_TITLE_SENTINEL', 'PAIGE_PROMPT_CONTENT_SENTINEL',
   '{"prompt":"PAIGE_PROMPT_PAYLOAD_SENTINEL"}'::jsonb,
   'paige_messages', '7a110000-0000-0000-0000-00000000a113', now() - interval '1 minute'),
  ('7a110000-0000-0000-0000-00000000e222', '7a110000-0000-0000-0000-000000002222',
   '7a110000-0000-0000-0000-00000000c222', 'owner.action_taken', 'your_paige', 'owner_staff',
   'owner', 'owner_internal', 'OTHER_TENANT_TITLE_SENTINEL', 'OTHER_TENANT_SUMMARY_SENTINEL',
   '{"secret":"OTHER_TENANT_PAYLOAD_SENTINEL"}'::jsonb,
   NULL, NULL, now());

DO $proof$
DECLARE
  row_count integer;
  output_keys text[];
  blocked boolean;
  function_result text;
BEGIN
  SELECT pg_get_function_result('public.get_solo_mind_rail_events(uuid,uuid,integer)'::regprocedure)
    INTO function_result;
  IF function_result !~ '^TABLE\(id uuid, event_kind text, surface text, actor_type text, audience text, visibility text, occurred_at timestamp with time zone, contact_id uuid\)$' THEN
    RAISE EXCEPTION 'FAIL_SHAPE: unexpected resolver result: %', function_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.get_solo_mind_rail_events(uuid,uuid,integer)'::regprocedure
      AND prosecdef
      AND provolatile = 's'
      AND proconfig @> ARRAY['search_path=pg_catalog, public']
  ) THEN
    RAISE EXCEPTION 'FAIL_BOUNDARY: resolver lacks SECURITY DEFINER/STABLE/safe search_path';
  END IF;

  IF has_table_privilege('authenticated', 'public.paige_client_events', 'SELECT')
     OR has_table_privilege('anon', 'public.paige_client_events', 'SELECT')
     OR EXISTS (
       SELECT 1
       FROM pg_class AS relation,
            LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
       WHERE relation.oid = 'public.paige_client_events'::regclass
         AND privilege.grantee = 0
         AND privilege.privilege_type = 'SELECT'
     ) THEN
    RAISE EXCEPTION 'FAIL_GRANT: a browser/public role has direct rail SELECT';
  END IF;
  IF has_table_privilege('authenticated', 'public.paige_client_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.paige_client_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.paige_client_events', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated has direct rail write authority';
  END IF;
  IF EXISTS (
       SELECT 1
       FROM pg_proc AS procedure,
            LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
       WHERE procedure.oid = 'public.get_solo_mind_rail_events(uuid,uuid,integer)'::regprocedure
         AND privilege.grantee = 0
         AND privilege.privilege_type = 'EXECUTE'
     )
     OR has_function_privilege('anon', 'public.get_solo_mind_rail_events(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.get_solo_mind_rail_events(uuid,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_solo_mind_rail_events(uuid,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL_GRANT: resolver EXECUTE grants are not authenticated-only';
  END IF;

  SET LOCAL ROLE authenticated;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  SELECT count(*) INTO row_count
  FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  IF row_count <> 3 THEN RAISE EXCEPTION 'FAIL_OWNER_SCOPE: owner saw % rows', row_count; END IF;

  SELECT array_agg(key ORDER BY key) INTO output_keys
  FROM (
    SELECT DISTINCT jsonb_object_keys(to_jsonb(mind_row)) AS key
    FROM public.get_solo_mind_rail_events(
      '7a110000-0000-0000-0000-000000001111',
      '7a110000-0000-0000-0000-00000000e111', 1
    ) AS mind_row
  ) AS keys;
  IF output_keys IS DISTINCT FROM ARRAY[
    'actor_type', 'audience', 'contact_id', 'event_kind', 'id',
    'occurred_at', 'surface', 'visibility'
  ]::text[] THEN
    RAISE EXCEPTION 'FAIL_SHAPE: serialized resolver keys: %', output_keys;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50) AS mind_row
    WHERE to_jsonb(mind_row)::text ~ '(RAW_INBOUND|RAW_OUTBOUND|PAIGE_PROMPT|TITLE_SENTINEL|PAYLOAD_SENTINEL|SECRET_LIKE|external_messages|paige_messages)'
  ) THEN
    RAISE EXCEPTION 'FAIL_CONTENT: raw content or reference crossed the resolver';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count
  FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  IF row_count <> 3 THEN RAISE EXCEPTION 'FAIL_ADMIN_SCOPE: admin saw % rows', row_count; END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count
  FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  IF row_count <> 3 THEN RAISE EXCEPTION 'FAIL_COACH_SCOPE: coach saw % rows', row_count; END IF;

  -- Re-check membership on every call: a session whose authority becomes stale
  -- is denied immediately.
  RESET ROLE;
  UPDATE public.tenant_members SET status = 'suspended'
  WHERE tenant_id = '7a110000-0000-0000-0000-000000001111'
    AND user_id = '7a110000-0000-0000-0000-0000000000c1';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  blocked := false;
  BEGIN PERFORM * FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_STALE_AUTHORITY: suspended coach retained access'; END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
  blocked := false;
  BEGIN PERFORM * FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_LINKED_CLIENT: linked client gained access'; END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  blocked := false;
  BEGIN PERFORM * FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_MEMBER: ordinary member gained access'; END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
  blocked := false;
  BEGIN PERFORM * FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_NO_CONTEXT: unscoped caller gained access'; END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  blocked := false;
  BEGIN PERFORM * FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000002222', NULL, 50);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_WRONG_ACCOUNT: admin crossed account boundary'; END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count
  FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000002222', NULL, 50);
  IF row_count <> 1 THEN RAISE EXCEPTION 'FAIL_OTHER_ACCOUNT_SCOPE: other admin saw % rows', row_count; END IF;

  -- Missing and foreign-account event references resolve to no structural row.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.get_solo_mind_rail_events(
    '7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-00000000ffff', 1);
  IF row_count <> 0 THEN RAISE EXCEPTION 'FAIL_MISSING_SOURCE: fabricated event resolved'; END IF;
  SELECT count(*) INTO row_count FROM public.get_solo_mind_rail_events(
    '7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-00000000e222', 1);
  IF row_count <> 0 THEN RAISE EXCEPTION 'FAIL_STALE_SOURCE: foreign event resolved'; END IF;

  -- Actual direct table reads and writes fail at the SQL privilege wall.
  blocked := false;
  BEGIN PERFORM id FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_DIRECT_READ: source column was readable'; END IF;

  blocked := false;
  BEGIN PERFORM title, summary, payload, ref_table, ref_id FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_RAW_READ: raw source content was readable'; END IF;

  blocked := false;
  BEGIN
    INSERT INTO public.paige_client_events (
      tenant_id, contact_id, event_kind, surface, actor_type, audience,
      visibility, title, occurred_at
    ) VALUES (
      '7a110000-0000-0000-0000-000000001111',
      '7a110000-0000-0000-0000-00000000c111',
      'comms.inbound', 'client_portal', 'client', 'both', 'client_visible',
      'FORBIDDEN_DIRECT_INSERT', now()
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_DIRECT_INSERT: authenticated inserted'; END IF;

  blocked := false;
  BEGIN UPDATE public.paige_client_events SET occurred_at = occurred_at WHERE false;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_DIRECT_UPDATE: authenticated updated'; END IF;

  blocked := false;
  BEGIN DELETE FROM public.paige_client_events WHERE false;
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_DIRECT_DELETE: authenticated deleted'; END IF;

  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{}', true);
  blocked := false;
  BEGIN PERFORM * FROM public.get_solo_mind_rail_events('7a110000-0000-0000-0000-000000001111', NULL, 50);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL_ANON: unauthenticated caller executed resolver'; END IF;

  RESET ROLE;
END
$proof$;

SELECT 'MIND_SAFE_RAIL_RESOLVER_PROVEN' AS proof;
ROLLBACK;
