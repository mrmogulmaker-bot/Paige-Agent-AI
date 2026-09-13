-- ============================================================================
-- create_class_booking §59 tenant-consistency guard (E6 LOW-1) — repeatable proof.
--
-- Proves the guard added by migration 20270312000000: a class booking whose
-- _tenant_id does not match the calendar's own tenant is REFUSED (42501) before any
-- write, while a consistent call (and a consistent null-tenant call) still succeeds.
-- Same self-contained idiom + inline pgTAP shim as calendar_booking_preset_seam.sql.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$ BEGIN
  IF current_database() <> 'calendar_class_booking_scope' THEN
    RAISE EXCEPTION 'This fixture requires the isolated calendar_class_booking_scope database (got %)', current_database();
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase role the migration GRANTs to (self-contained: the migration's
-- `GRANT EXECUTE … TO service_role` requires it to exist even on a standalone run).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

-- ── inline count-enforcing pgTAP shim ───────────────────────────────────────
CREATE TABLE _pgtap_state(planned integer NOT NULL, executed integer NOT NULL);
CREATE FUNCTION plan(integer) RETURNS text LANGUAGE plpgsql AS $$
BEGIN DELETE FROM _pgtap_state; INSERT INTO _pgtap_state VALUES($1,0); RETURN '1..'||$1; END $$;
CREATE FUNCTION _tick() RETURNS void LANGUAGE plpgsql AS $$
BEGIN UPDATE _pgtap_state SET executed=executed+1; IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: no plan'; END IF; END $$;
CREATE FUNCTION ok(boolean, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM _tick(); IF $1 IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', $2; END IF; RETURN 'ok - '||$2; END $$;
CREATE FUNCTION lives_ok(text, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM _tick(); EXECUTE $1; RETURN 'ok - '||$2;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'FAIL: % — unexpected [%] %', $2, SQLSTATE, SQLERRM; END $$;
CREATE FUNCTION throws_like(text, text, text, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM _tick();
  BEGIN EXECUTE $1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = $2 AND SQLERRM LIKE $3 THEN RETURN 'ok - '||$4; END IF;
    RAISE EXCEPTION 'FAIL: % — got [%] %, wanted [%] LIKE %', $4, SQLSTATE, SQLERRM, $2, $3;
  END;
  RAISE EXCEPTION 'FAIL: % — call succeeded, expected [%] LIKE %', $4, $2, $3;
END $$;
CREATE FUNCTION finish() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE p integer; e integer;
BEGIN SELECT planned, executed INTO p, e FROM _pgtap_state;
  IF p IS DISTINCT FROM e THEN RAISE EXCEPTION 'FAIL: planned %, executed %', p, e; END IF;
  RETURN NEXT format('ok - all %s assertions executed', e);
END $$;

-- ── minimal faithful fixture: calendars (id, tenant_id) + internal_bookings with
--    the columns create_class_booking inserts/returns. No exclusion constraint is
--    needed — the guard fires (or the happy path inserts) without it. ──────────
CREATE TABLE public.calendars (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid);
CREATE TABLE public.internal_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid, host_user_id uuid, calendar_id uuid,
  booking_kind text, capacity integer, class_session_id uuid, contact_id uuid,
  title text, start_at timestamptz, end_at timestamptz, timezone text,
  status text DEFAULT 'scheduled', source text,
  guest_name text, guest_email text, guest_phone text, notes text,
  location_type text, location_value text, intake_answers jsonb);

-- Apply the REAL LOW-1 migration (CREATE OR REPLACE create_class_booking + the guard).
\ir ../migrations/20270312000000_create_class_booking_tenant_scope_guard.sql

-- Seed: a tenant-A calendar and a platform (null-tenant) calendar.
INSERT INTO public.calendars(id, tenant_id) VALUES
  ('c0000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('c0000000-0000-0000-0000-000000000002', NULL);

SELECT plan(5);

-- 1. Consistent tenant → succeeds (session + seat created).
SELECT lives_ok($$SELECT public.create_class_booking(
  'c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  now(), now()+interval '1 hour','America/New_York', 5,
  'Class','Guest','g@x',NULL,NULL,'phone',NULL,'[]'::jsonb,'public')$$,
  'consistent tenant creates a class booking');
SELECT ok((SELECT count(*) FROM public.internal_bookings WHERE booking_kind='class_seat' AND tenant_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=1,
  'a class_seat row was written for the consistent tenant');

-- 2. Mismatched tenant (calendar is A, passed B) → refused 42501 before any write.
SELECT throws_like($$SELECT public.create_class_booking(
  'c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  now(), now()+interval '1 hour','America/New_York', 5,
  'Class','Guest','g@x',NULL,NULL,'phone',NULL,'[]'::jsonb,'public')$$,
  '42501','%does not match the calendar%','mismatched tenant refused (42501, guard message)');
SELECT ok((SELECT count(*) FROM public.internal_bookings WHERE tenant_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')=0,
  'the refused cross-tenant call wrote NO row');

-- 3. Null-tenant (platform) calendar + null passed tenant → succeeds (IS DISTINCT FROM handles null).
SELECT lives_ok($$SELECT public.create_class_booking(
  'c0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', NULL,
  now(), now()+interval '1 hour','America/New_York', 5,
  'Platform class','Guest','g@x',NULL,NULL,'phone',NULL,'[]'::jsonb,'public')$$,
  'null-tenant calendar + null passed tenant succeeds');

SELECT * FROM finish();
