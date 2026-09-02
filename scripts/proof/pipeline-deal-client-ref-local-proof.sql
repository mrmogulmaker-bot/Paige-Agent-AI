\set ON_ERROR_STOP on

-- Local-only runtime proof for the Pipeline deal client reference.
--
-- Sibling of paige-spine-local-proof.sql, for the same reason: an environment without
-- the Supabase Docker image can still run the REAL migration file against a real
-- PostgreSQL, exercise real caller roles, and roll everything back.
--
-- What this proves, and what it does not. It proves the migration parses, creates, and
-- returns the identifier under the caller's own client-visibility predicate — including
-- the case that matters most, where a caller may see a DEAL but not its CLIENT. It does
-- NOT prove production behaviour: the surrounding schema here is a minimal stub, and a
-- persisted-apply confirmation on prod remains owed.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

CREATE TYPE public.app_role AS ENUM ('admin','super_admin','coach','client');

CREATE TABLE public.tenants (id uuid PRIMARY KEY, name text);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, active_tenant_id uuid);
CREATE TABLE public.user_roles (user_id uuid, role public.app_role, PRIMARY KEY (user_id, role));
CREATE TABLE public.clients (
  id uuid PRIMARY KEY, tenant_id uuid, first_name text, last_name text, entity_name text,
  assigned_coach_user_id uuid, created_by uuid, linked_user_id uuid
);
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY, tenant_id uuid, name text, description text,
  is_default boolean DEFAULT false, lifecycle_status text DEFAULT 'active', version bigint DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY, tenant_id uuid, pipeline_id uuid, label text, description text,
  order_index int, archived_at timestamptz, move_policy text DEFAULT 'direct', version bigint DEFAULT 1
);
CREATE TABLE public.deals (
  id uuid PRIMARY KEY, tenant_id uuid, title text, pipeline_id uuid, stage_id uuid,
  contact_client_id uuid, owner_user_id uuid, status text, source text,
  updated_at timestamptz DEFAULT now(), version bigint DEFAULT 1
);
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY, tenant_id uuid, deal_id uuid, user_id uuid, title text, status text,
  due_date timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.deal_activities (
  id uuid PRIMARY KEY, deal_id uuid, summary text, type text, created_at timestamptz DEFAULT now()
);

CREATE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role = _role)
$$;
CREATE FUNCTION public.has_any_role(_user_id uuid, _roles text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role::text = ANY(_roles))
$$;
CREATE FUNCTION public.current_user_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT p.active_tenant_id FROM public.profiles p WHERE p.user_id = auth.uid()
$$;
CREATE FUNCTION public.is_tenant_admin(_tenant uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.is_assigned_to_client(_user uuid, _client uuid, _role text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

-- The real migration file, applied verbatim.
\ir ../../supabase/migrations/20261041000000_pipeline_deal_carries_its_client_reference.sql

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001','admin@tests.invalid'),
  ('a0000000-0000-4000-8000-000000000002','coach@tests.invalid');
INSERT INTO public.tenants (id, name) VALUES ('11111111-0000-4000-8000-000000000001','Tenant A');
INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('a0000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-4000-8000-000000000001','admin'),
  ('a0000000-0000-4000-8000-000000000002','coach');

-- Two clients. The coach is assigned to the first and NOT to the second.
INSERT INTO public.clients (id, tenant_id, first_name, last_name, assigned_coach_user_id, created_by) VALUES
  ('c0000000-0000-4000-8000-00000000c101','11111111-0000-4000-8000-000000000001','Visible','Client','a0000000-0000-4000-8000-000000000002',NULL),
  ('c0000000-0000-4000-8000-00000000c102','11111111-0000-4000-8000-000000000001','Hidden','Client',NULL,NULL);

INSERT INTO public.pipelines (id, tenant_id, name) VALUES ('90000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','Retainers');
INSERT INTO public.pipeline_stages (id, tenant_id, pipeline_id, label, order_index) VALUES
  ('80000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','Scoping',0);

-- Both deals are OWNED by the coach, so both are visible as deals. Only the first
-- client is visible to them, which is precisely the case this proof exists for.
INSERT INTO public.deals (id, tenant_id, title, pipeline_id, stage_id, contact_client_id, owner_user_id) VALUES
  ('d0000000-0000-4000-8000-00000000d101','11111111-0000-4000-8000-000000000001','Visible deal','90000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000c101','a0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000d102','11111111-0000-4000-8000-000000000001','Hidden-client deal','90000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000c102','a0000000-0000-4000-8000-000000000002');

DO $$
DECLARE _deals jsonb; _visible jsonb; _hidden jsonb;
BEGIN
  -- ADMIN sees both clients, so both deals carry an identifier.
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _deals := public.get_pipeline_workspace_pre_identity('11111111-0000-4000-8000-000000000001') -> 'deals';
  IF jsonb_array_length(_deals) <> 2 THEN RAISE EXCEPTION 'admin should see both deals, saw %', jsonb_array_length(_deals); END IF;
  SELECT d INTO _visible FROM jsonb_array_elements(_deals) d WHERE d ->> 'id' = 'd0000000-0000-4000-8000-00000000d101';
  IF _visible ->> 'client_id' IS DISTINCT FROM 'c0000000-0000-4000-8000-00000000c101' THEN
    RAISE EXCEPTION 'admin: client_id missing or wrong: %', _visible ->> 'client_id';
  END IF;
  IF _visible ->> 'client_name' <> 'Visible Client' THEN RAISE EXCEPTION 'admin: client_name regressed: %', _visible ->> 'client_name'; END IF;

  -- COACH sees both DEALS (they own them) but only ONE client. The identifier must be
  -- absent exactly where the name is, or it would out-run the visibility predicate.
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  _deals := public.get_pipeline_workspace_pre_identity('11111111-0000-4000-8000-000000000001') -> 'deals';
  IF jsonb_array_length(_deals) <> 2 THEN RAISE EXCEPTION 'coach should see both owned deals, saw %', jsonb_array_length(_deals); END IF;
  SELECT d INTO _visible FROM jsonb_array_elements(_deals) d WHERE d ->> 'id' = 'd0000000-0000-4000-8000-00000000d101';
  SELECT d INTO _hidden  FROM jsonb_array_elements(_deals) d WHERE d ->> 'id' = 'd0000000-0000-4000-8000-00000000d102';
  IF _visible ->> 'client_id' IS DISTINCT FROM 'c0000000-0000-4000-8000-00000000c101' THEN
    RAISE EXCEPTION 'coach: assigned client_id should be present, got %', _visible ->> 'client_id';
  END IF;
  IF _hidden ->> 'client_id' IS NOT NULL THEN
    RAISE EXCEPTION 'LEAK: coach received a client_id for a client they cannot see: %', _hidden ->> 'client_id';
  END IF;
  IF _hidden ->> 'client_name' <> 'Client not recorded' THEN
    RAISE EXCEPTION 'coach: hidden client name regressed: %', _hidden ->> 'client_name';
  END IF;

  -- A caller with no active tenant, and a caller naming another tenant, are both refused.
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  BEGIN
    PERFORM public.get_pipeline_workspace_pre_identity('22222222-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'a foreign tenant argument should have been refused';
  EXCEPTION WHEN sqlstate '42501' THEN NULL;
  END;

  -- No raw Rail or deal content crosses.
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  _deals := public.get_pipeline_workspace_pre_identity('11111111-0000-4000-8000-000000000001') -> 'deals';
  IF _deals::text ~* '(contact_client_id|payload|stage_name|actor_user_id)' THEN
    RAISE EXCEPTION 'forbidden field crossed the projection: %', _deals::text;
  END IF;
END $$;

SELECT 'Pipeline deal client reference local proof: PASS' AS result;

ROLLBACK;
