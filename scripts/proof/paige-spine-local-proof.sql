\set ON_ERROR_STOP on

-- Local-only runtime proof for environments without the Supabase Docker image.
-- This builds the minimum canonical source/RLS contract in a fresh PostgreSQL DB,
-- applies the real migration file, exercises real roles, then rolls everything back.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, aud text, role text, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.uid_uuid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.uid())::uuid
$$;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY, slug text, name text, status text, account_type text,
  account_number_prefix text, account_number bigint, features jsonb
);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY REFERENCES auth.users(id), active_tenant_id uuid);
CREATE TABLE public.tenant_members (
  tenant_id uuid, user_id uuid, role text, status text, is_owner boolean, joined_at timestamptz,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE public.user_roles (user_id uuid, role text, PRIMARY KEY (user_id, role));
CREATE TABLE public.clients (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, account_number text NOT NULL UNIQUE,
  created_by uuid NOT NULL, first_name text NOT NULL, last_name text NOT NULL,
  email text, linked_user_id uuid
);
CREATE TABLE public.paige_event_kinds (slug text PRIMARY KEY);
INSERT INTO public.paige_event_kinds VALUES ('owner.crm_mutation');
CREATE TABLE public.paige_client_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, contact_id uuid NOT NULL REFERENCES public.clients(id),
  event_kind text NOT NULL REFERENCES public.paige_event_kinds(slug), surface text NOT NULL,
  actor_type text NOT NULL, actor_user_id uuid, audience text NOT NULL, visibility text NOT NULL,
  title text NOT NULL, summary text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ref_table text, ref_id uuid, occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL
);

CREATE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY (_roles))
$$;
CREATE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;
CREATE FUNCTION public.current_user_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.active_tenant_id FROM public.profiles p
  WHERE p.user_id = auth.uid_uuid()
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id = auth.uid_uuid()
      AND m.tenant_id = p.active_tenant_id AND m.status = 'active')
$$;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_client_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_staff_read ON public.clients FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
    AND public.has_any_role(auth.uid_uuid(), ARRAY['admin','super_admin','coach']));
CREATE POLICY rail_staff_read ON public.paige_client_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
    AND public.has_any_role(auth.uid_uuid(), ARRAY['admin','super_admin','coach']));
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.uid_uuid(), public.has_any_role(uuid,text[]), public.is_platform_owner(), public.current_user_tenant_id() TO authenticated;

\ir ../../supabase/migrations/20260902004019_paige_spine_foundation.sql

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.get_pipeline_spine_evidence(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymous execute privilege leaked';
  END IF;
  IF has_table_privilege('authenticated', 'public.paige_client_events', 'SELECT') THEN
    RAISE EXCEPTION 'direct source-table access leaked';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_pipeline_spine_evidence(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated execute privilege missing';
  END IF;
  IF has_function_privilege('service_role', 'public.get_pipeline_spine_evidence(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role execute privilege leaked';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_pipeline_spine_evidence(text,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'adapter is not security definer';
  END IF;
END $$;

INSERT INTO auth.users VALUES
  ('f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@tests.invalid'),
  ('f1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@tests.invalid'),
  ('f2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'other@tests.invalid');
INSERT INTO public.tenants VALUES
  ('f1000000-0000-0000-0000-000000001111', 'a', 'A', 'active', 'standalone', 'A', 1, '{}'),
  ('f2000000-0000-0000-0000-000000002222', 'b', 'B', 'active', 'standalone', 'B', 2, '{}');
INSERT INTO public.profiles VALUES
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000001111'),
  ('f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000001111'),
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000002222');
INSERT INTO public.tenant_members VALUES
  ('f1000000-0000-0000-0000-000000001111', 'f1000000-0000-0000-0000-000000000001', 'owner', 'active', true, now()),
  ('f1000000-0000-0000-0000-000000001111', 'f1000000-0000-0000-0000-000000000002', 'member', 'active', false, now()),
  ('f2000000-0000-0000-0000-000000002222', 'f2000000-0000-0000-0000-000000000001', 'owner', 'active', true, now());
INSERT INTO public.user_roles VALUES
  ('f1000000-0000-0000-0000-000000000001', 'admin'),
  ('f2000000-0000-0000-0000-000000000001', 'admin');
INSERT INTO public.clients VALUES
  ('f1000000-0000-0000-0000-00000000c101', 'f1000000-0000-0000-0000-000000001111', 'CLT-SPINE-A', 'f1000000-0000-0000-0000-000000000001', 'Safe', 'A', 'a@tests.invalid', NULL),
  ('f2000000-0000-0000-0000-00000000c201', 'f2000000-0000-0000-0000-000000002222', 'CLT-SPINE-B', 'f2000000-0000-0000-0000-000000000001', 'Safe', 'B', 'b@tests.invalid', NULL);
INSERT INTO public.paige_client_events VALUES
  ('f1000000-0000-0000-0000-00000000e101', 'f1000000-0000-0000-0000-000000001111', 'f1000000-0000-0000-0000-00000000c101', 'owner.crm_mutation', 'campaigns_pipeline', 'owner_staff', 'f1000000-0000-0000-0000-000000000001', 'owner', 'owner_internal', 'SECRET_TITLE', 'SECRET_SUMMARY', '{"policy_result":"allowed","actor_kind":"human","deal_id":"SECRET_DEAL"}', 'deals', 'f1000000-0000-0000-0000-00000000d101', now() - interval '1 day', now()),
  ('f1000000-0000-0000-0000-00000000e102', 'f1000000-0000-0000-0000-000000001111', 'f1000000-0000-0000-0000-00000000c101', 'owner.crm_mutation', 'campaigns_pipeline', 'paige_agent', NULL, 'owner', 'owner_internal', 'SECRET_STALE', NULL, '{"policy_result":"allowed","actor_kind":"paige"}', 'deals', 'f1000000-0000-0000-0000-00000000d102', now() - interval '31 days', now()),
  ('f1000000-0000-0000-0000-00000000e103', 'f1000000-0000-0000-0000-000000001111', 'f1000000-0000-0000-0000-00000000c101', 'owner.crm_mutation', 'campaigns_pipeline', 'owner_staff', NULL, 'owner', 'owner_internal', 'SECRET_EXPIRED', NULL, '{"policy_result":"allowed","actor_kind":"human"}', 'deals', 'f1000000-0000-0000-0000-00000000d103', now() - interval '366 days', now()),
  ('f2000000-0000-0000-0000-00000000e201', 'f2000000-0000-0000-0000-000000002222', 'f2000000-0000-0000-0000-00000000c201', 'owner.crm_mutation', 'campaigns_pipeline', 'owner_staff', NULL, 'owner', 'owner_internal', 'SECRET_OTHER', NULL, '{"policy_result":"allowed","actor_kind":"human"}', 'deals', 'f2000000-0000-0000-0000-00000000d201', now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $$ DECLARE n integer; leaked boolean; BEGIN
  SELECT count(*), coalesce(bool_or(row_to_json(r)::text ~* '(SECRET_|"title"|"summary"|"payload"|actor_user_id|deal_id|"ref_id")'), false)
    INTO n, leaked FROM public.get_pipeline_spine_evidence('clt-spine-a', 50) r;
  IF n <> 2 THEN RAISE EXCEPTION 'expected two own retained events, got %', n; END IF;
  IF leaked THEN RAISE EXCEPTION 'raw or internal content crossed the boundary'; END IF;
  IF (SELECT count(*) FROM public.get_pipeline_spine_evidence('CLT-SPINE-B', 50)) <> 0 THEN
    RAISE EXCEPTION 'cross-tenant public reference returned evidence';
  END IF;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_pipeline_spine_evidence('CLT-SPINE-A', 50)) <> 0 THEN
    RAISE EXCEPTION 'ordinary member read staff-only Rail evidence';
  END IF;
END $$;

RESET ROLE;
UPDATE public.profiles SET active_tenant_id = 'f2000000-0000-0000-0000-000000002222'
 WHERE user_id = 'f1000000-0000-0000-0000-000000000001';
INSERT INTO public.tenant_members VALUES
  ('f2000000-0000-0000-0000-000000002222', 'f1000000-0000-0000-0000-000000000001', 'admin', 'active', false, now());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT set_config('search_path', 'pg_temp, public', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_pipeline_spine_evidence('CLT-SPINE-A', 50)) <> 0 THEN
    RAISE EXCEPTION 'account switch retained prior scope';
  END IF;
  IF (SELECT count(*) FROM public.get_pipeline_spine_evidence('CLT-SPINE-B', 50)) <> 1 THEN
    RAISE EXCEPTION 'hostile search path or account switch broke current scope';
  END IF;
END $$;

RESET ROLE;
SELECT 'PAIGE Spine local runtime proof: PASS' AS result;
ROLLBACK;
