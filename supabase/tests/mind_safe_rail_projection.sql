-- =============================================================================
-- Mind safe Context Rail projection — isolated real-caller RLS/API proof.
--
-- Runs as a disposable database transaction and rolls every fixture back.
-- Run: psql "$DB_URL" -1 -f supabase/tests/mind_safe_rail_projection.sql
--
-- This is intentionally a database-role test, not a service-role query:
-- PostgREST executes browser requests as `authenticated`, so SET LOCAL ROLE
-- authenticated exercises the same grant + RLS boundary.  It proves:
--   1. own-tenant admin and coach can read the safe view;
--   2. another tenant is invisible;
--   3. a same-tenant non-staff member is denied rows;
--   4. no active tenant returns no rows;
--   5. payload and raw `SELECT *` are denied before a browser could receive them.
-- =============================================================================
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('7a110000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'mind-rail-admin@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'mind-rail-coach@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000m1', 'authenticated', 'authenticated', 'mind-rail-member@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000x1', 'authenticated', 'authenticated', 'mind-rail-other@x.invalid'),
  ('7a110000-0000-0000-0000-0000000000n1', 'authenticated', 'authenticated', 'mind-rail-no-tenant@x.invalid');

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('7a110000-0000-0000-0000-000000001111', 'mind-rail-t1', 'Mind Rail T1', 'active', 'standalone', 'MRT1', '{}'::jsonb),
  ('7a110000-0000-0000-0000-000000002222', 'mind-rail-t2', 'Mind Rail T2', 'active', 'standalone', 'MRT2', '{}'::jsonb);

INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('7a110000-0000-0000-0000-0000000000a1', '7a110000-0000-0000-0000-000000001111'),
  ('7a110000-0000-0000-0000-0000000000c1', '7a110000-0000-0000-0000-000000001111'),
  ('7a110000-0000-0000-0000-0000000000m1', '7a110000-0000-0000-0000-000000001111'),
  ('7a110000-0000-0000-0000-0000000000x1', '7a110000-0000-0000-0000-000000002222'),
  ('7a110000-0000-0000-0000-0000000000n1', NULL);

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000a1', 'admin', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000c1', 'coach', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000m1', 'member', 'active', false, now()),
  ('7a110000-0000-0000-0000-000000002222', '7a110000-0000-0000-0000-0000000000x1', 'admin', 'active', false, now());

INSERT INTO public.clients (id, tenant_id, created_by, first_name, last_name) VALUES
  ('7a110000-0000-0000-0000-00000000c111', '7a110000-0000-0000-0000-000000001111', '7a110000-0000-0000-0000-0000000000a1', 'Rail', 'One'),
  ('7a110000-0000-0000-0000-00000000c222', '7a110000-0000-0000-0000-000000002222', '7a110000-0000-0000-0000-0000000000x1', 'Rail', 'Two');

INSERT INTO public.paige_client_events (
  id, tenant_id, contact_id, event_kind, surface, actor_type, audience,
  visibility, title, summary, payload, occurred_at
) VALUES
  ('7a110000-0000-0000-0000-00000000e111', '7a110000-0000-0000-0000-000000001111',
   '7a110000-0000-0000-0000-00000000c111', 'owner.action_taken', 'test', 'owner_staff',
   'owner', 'owner_internal', 'Safe title one', 'Safe summary one', '{"must_not_leave_the_database":"payload"}'::jsonb, now()),
  ('7a110000-0000-0000-0000-00000000e222', '7a110000-0000-0000-0000-000000002222',
   '7a110000-0000-0000-0000-00000000c222', 'owner.action_taken', 'test', 'owner_staff',
   'owner', 'owner_internal', 'Safe title two', 'Safe summary two', '{"must_not_leave_the_database":"payload"}'::jsonb, now());

DO $proof$
DECLARE
  row_count integer;
  payload_blocked boolean := false;
  star_blocked boolean := false;
BEGIN
  -- Projection shape itself cannot include payload or any other raw field.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'solo_mind_rail_events'
      AND column_name = 'payload'
  ) THEN
    RAISE EXCEPTION 'FAIL_SHAPE: safe view exposes payload';
  END IF;

  IF has_table_privilege('authenticated', 'public.paige_client_events', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated has raw table-level SELECT';
  END IF;
  IF has_column_privilege('authenticated', 'public.paige_client_events', 'payload', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated can select payload';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.solo_mind_rail_events', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL_GRANT: authenticated cannot select safe view';
  END IF;

  SET LOCAL ROLE authenticated;

  -- Own-tenant admin: allowed through view, never cross-tenant.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL_ADMIN_SCOPE: admin saw % rows (expected 1 own-tenant row)', row_count;
  END IF;

  -- Browser-compatible raw payload and wildcard attempts both fail at the DB boundary.
  BEGIN
    PERFORM payload FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN
    payload_blocked := true;
  END;
  IF NOT payload_blocked THEN
    RAISE EXCEPTION 'FAIL_PAYLOAD: authenticated selected payload';
  END IF;

  BEGIN
    PERFORM * FROM public.paige_client_events;
  EXCEPTION WHEN insufficient_privilege THEN
    star_blocked := true;
  END;
  IF NOT star_blocked THEN
    RAISE EXCEPTION 'FAIL_STAR: raw select-star succeeded';
  END IF;

  -- Same-tenant coach is permitted by the existing staff RLS policy.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL_COACH_SCOPE: coach saw % rows (expected 1 own-tenant row)', row_count;
  END IF;

  -- A staff user seated in the other tenant sees only that tenant's event.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000x1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL_CROSS_TENANT: other tenant saw % rows (expected only own row)', row_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.solo_mind_rail_events WHERE id = '7a110000-0000-0000-0000-00000000e111') THEN
    RAISE EXCEPTION 'FAIL_CROSS_TENANT: other tenant saw T1 event';
  END IF;

  -- Same-tenant member is authenticated but not one of the staff roles RLS permits.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000m1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL_NONSTAFF: member saw % event rows', row_count;
  END IF;

  -- An authenticated user without active tenant context receives no rows.
  PERFORM set_config('request.jwt.claims', '{"sub":"7a110000-0000-0000-0000-0000000000n1","role":"authenticated"}', true);
  SELECT count(*) INTO row_count FROM public.solo_mind_rail_events;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL_NO_TENANT: unscoped user saw % event rows', row_count;
  END IF;

  RESET ROLE;
END
$proof$;

SELECT 'MIND_SAFE_RAIL_PROJECTION_PROVEN' AS proof;
ROLLBACK;
