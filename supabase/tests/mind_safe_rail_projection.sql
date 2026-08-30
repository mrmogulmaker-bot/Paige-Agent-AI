-- =============================================================================
-- Mind safe Context Rail projection — isolated real-caller RLS/API proof.
--
-- Runs as a disposable database transaction and rolls every fixture back.
-- Run: psql "$DB_URL" -1 -f supabase/tests/mind_safe_rail_projection.sql
--
-- This is intentionally a database-role test, not a service-role read:
-- PostgREST executes browser requests as `authenticated`, so SET LOCAL ROLE
-- authenticated exercises the same grant + RLS boundary. It proves:
--   1. active-tenant owner/staff can read only the structural evidence index;
--   2. another tenant, a member, and a caller without active tenant are denied;
--   3. a real linked-client path can read client-visible source rows through the
--      inherited rail policy but receives zero Mind rows;
--   4. inbound/outbound message text, a PAIGE prompt, producer title/summary,
--      references, and payload cannot cross the projection boundary;
--   5. the raw source has no table-level browser SELECT or write privilege.
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
  ('7a110000-0000-0000-0000-0000000000a2', '7a110000-0000-0000-0000-000000001111'),
  ('7a110000-0000-0000-0000-0000000000a1', '7a110000-0000-0000-000000001111'),
  ('7a110000-0000-0000-0000-0000000000c1', '7a110000-0000-0000-0000-000000001111'),
  ('7a110000-0000-0000-0000-0000000000b1', '7a110000-0000-0000-0000-000000001111'),
  ('7a110000-0000-0000-0000-0000000000d1', '7a110000-0000-0000-0000-000000002222'),
  ('7a110000-0000-0000-0000-0000000000e1', NULL),
  ('7a110000-0000-0000-0000-0000000000f1', '7a110000-0000-0000-0000-000000001111')
ON CONFLICT (user_id) DO NOTHING;

-- tenant_members is the tenant-scoped role source. Its existing sync trigger
-- supplies the legacy user_roles entries consumed by pce_staff_read.
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000a2', 'owner', 'active', true, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000a1', 'admin', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000c1', 'coach', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000b1', 'member', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000002222', '7a110000-0000-0000-0000-0000000000d1', 'admin', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000f1', 'member', 'active', false, now());

-- Auth provisioning may have created profile rows first. Set active tenant only
-- after the real memberships exist so guard_active_tenant_membership is honored.
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

-- The linked consumer carries the real client app role in addition to ordinary
-- tenant membership, matching the client-invite/portal authorization path.
INSERT INTO public.user_roles (user_id, role)
VALUES ('7a110000-0000-0000-0000-0000000000f1', 'client')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.clients (id, tenant_id, created_by, first_name, last_name, linked_user_id) VALUES
  ('7a110000-0000-0000-0000-00000000c111', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-0000000000a1', 'Rail', 'One', '7a110000-0000-0000-0000-0000000000f1'),
  ('7a110000-0000-0000-0000-00000000c222', '7a110000-0000-0000-0000-000000002222',
   '7a110000-0000-0000-0000-0000000000d1', 'Rail', 'Two', NULL);

-- The three T1 rows deliberately put adversarial content in every producer-text
-- location. All are client-visible so pce_client_read genuinely permits them to
-- the linked client; the stricter Mind projection must still deny that caller.
INSERT INTO public.paige_client_events (
  id, tenant_id, contact_id, event_kind, surface, actor_type, audience,
  visibility, title, summary, payload, ref_table, ref_id, occurred_at
) VALUES
  ('7a110000-0000-0000-0000-00000000e111', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-00000000c111', 'comms.inbound', 'client_portal', 'client',
   'both', 'client_visible', 'INBOUND_TITLE_SENTINEL', 'RAW_INBOUND_MESSAGE_SENTINEL',
   '{"body":"RAW_INBOUND_PAYLOAD_SENTINEL"}'::jsonb, 'external_messages',
   '7a110000-0000-0000-0000-00000000a111', now() - interval '3 minutes'),
  ('7a110000-0000-0000-0000-00000000e112', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-00000000c111', 'comms.outbound', 'your_paige', 'paige_agent',
   'both', 'client_visible', 'OUTBOUND_TITLE_SENTINEL', 'RAW_OUTBOUND_MESSAGE_SENTINEL',
   '{"body":"RAW_OUTBOUND_PAYLOAD_SENTINEL"}'::jsonb, 'external_messages',
   '7a110000-0000-0000-0000-00000000a112', now() - interval '2 minutes'),
  ('7a110000-0000-0000-0000-00000000e113', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-00000000c111', 'client.message', 'contact_paige', 'client',
   'both', 'client_visible', 'PAIGE_PROMPT_TITLE_SENTINEL', 'PAIGE_PROMPT_CONTENT_SENTINEL',
   '{"prompt":"PAIGE_PROMPT_PAYLOAD_SENTINEL"}'::jsonb, 'paige_messages',
   '7a110000-0000-0000-0000-00000000a113', now() - interval '1 minute'),
  ('7a110000-0000-0000-0000-00000000e222', '7a110000-0000-0000-0000-000000002222',
   '7a110000-0000-0000-0000-00000000c222', 'owner.action_taken', 'your_paige', 'owner_staff',
   'owner', 'owner_internal', 'OTHER_TENANT_TITLE_SENTINEL', 'OTHER_TENANT_SUMMARY_SENTINEL',
   '{"secret":"OTHER_TENANT_PAYLOAD_SENTINEL"}'::jsonb, NULL, NULL, now());

DO $proof$
DECLARE
  row_count integer;
  projected_columns text[];
  payload_blocked boolean := false;
  title_blocked boolean := false;
  summary_blocked boolean := false;
  star_blocked boolean := false;
BEGIN
  SELECT array_agg(column_name::text ORDER BY ordinal_position)
    INTO projected_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'solo_mind_rail_events';

  IF projected_columns IS DISTINCT FROM ARRAY[
    'id', 'event_kind', 'surface', 'actor_type', 'audience', 'visibility',
    'occurred_at', 'contact_id'
  ]::text[] THEN
    RAISE EXCEPTION 'FAIL_SHAPE: unexpected Mind columns: %', projected_columns;
  END IF;

  IF has_table_privilege('authenticated', 'public.paige_client_events', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated has raw table-level SELECT';
  END IF;
  IF has_table_privilege('authenticated', 'public.paige_client_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.paige_client_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.paige_client_events', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated has a raw-table write privilege';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'paige_client_events'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
      AND column_name NOT IN (
        'id', 'event_kind', 'surface', 'actor_type', 'audience', 'visibility',
        'occurred_at', 'contact_id'
      )
  ) THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated has an unapproved raw source column';
  END IF;
  IF has_column_privilege('authenticated', 'public.paige_client_events', 'title', 'SELECT')
     OR has_column_privilege('authenticated', 'public.paige_client_events', 'summary', 'SELECT')
     OR has_column_privilege('authenticated', 'public.paige_client_events', 'payload', 'SELECT')
     OR has_column_privilege('authenticated', 'public.paige_client_events', 'ref_table', 'SELECT')
     OR has_column_privilege('authenticated', 'public.paige_client_events', 'ref_id', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated can select producer content or references';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.solo_mind_rail_events', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated cannot select safe view';
  END IF;

  SET LOCAL ROLE authenticated;

  -- Own-tenant staff: allowed through the view, never cross-tenant and never
  -- carrying any adversarial producer content in the serialized row.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 3 THEN
    RAISE EXCEPTION 'FAIL_ADMIN_SCOPE: admin saw % rows (expected 3)', row_count;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.solo_mind_rail_events AS mind_row
    WHERE to_jsonb(mind_row)::text ~ '(RAW_INBOUND|RAW_OUTBOUND|PAIGE_PROMPT|_TITLE_SENTINEL|_PAYLOAD_SENTINEL)'
  ) THEN
    RAISE EXCEPTION 'FAIL_CONTENT: producer text crossed the Mind projection';
  END IF;

  -- Canonical Tenant-tier ownership is an active is_owner membership. The
  -- lockstep role='owner' supplies the existing source RLS role bridge.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 3 THEN
    RAISE EXCEPTION 'FAIL_OWNER_SCOPE: owner saw % rows (expected 3)', row_count;
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

  -- Browser-compatible direct content and wildcard attempts fail at the DB
  -- boundary even though the caller has narrow structural column privileges.
  BEGIN
    PERFORM payload FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN
    payload_blocked := true;
  END;
  BEGIN
    PERFORM title FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN
    title_blocked := true;
  END;
  BEGIN
    PERFORM summary FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN
    summary_blocked := true;
  END;
  BEGIN
    PERFORM * FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN
    star_blocked := true;
  END;
  IF NOT payload_blocked OR NOT title_blocked OR NOT summary_blocked OR NOT star_blocked THEN
    RAISE EXCEPTION 'FAIL_RAW_READ: payload %, title %, summary %, star %',
      payload_blocked, title_blocked, summary_blocked, star_blocked;
  END IF;

  -- Same-tenant coach is staff in both the tenant-scoped model and source RLS.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 3 THEN
    RAISE EXCEPTION 'FAIL_COACH_SCOPE: coach saw % rows (expected 3)', row_count;
  END IF;

  -- The linked client genuinely reaches the three client-visible source rows via
  -- pce_client_read, proving the Mind denial is the additional staff-only gate.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
  SELECT count(id) INTO row_count FROM public.paige_client_events;
  IF row_count <> 3 THEN
    RAISE EXCEPTION 'FAIL_CLIENT_PATH: linked client source policy saw % rows (expected 3)', row_count;
  END IF;
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL_CLIENT_MIND_DENY: linked client saw % Mind rows', row_count;
  END IF;

  -- Other-tenant staff sees only their active tenant's row.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL_CROSS_TENANT: other tenant saw % rows (expected 1)', row_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.solo_mind_rail_events
    WHERE id IN (
      '7a110000-0000-0000-0000-00000000e111',
      '7a110000-0000-0000-0000-00000000e112',
      '7a110000-0000-0000-0000-00000000e113'
    )
  ) THEN
    RAISE EXCEPTION 'FAIL_CROSS_TENANT: other tenant saw T1 evidence';
  END IF;

  -- Same-tenant member is active but outside the owner/staff allowlist.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL_NONSTAFF: member saw % Mind rows', row_count;
  END IF;

  -- An authenticated user without active tenant context receives no rows.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL_NO_TENANT: unscoped user saw % Mind rows', row_count;
  END IF;

  RESET ROLE;
END
$proof$;

SELECT 'MIND_SAFE_RAIL_PROJECTION_PROVEN' AS proof;
ROLLBACK;
