\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT COALESCE(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.tenants(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,active_tenant_id uuid);
CREATE TABLE public.tenant_members(tenant_id uuid,user_id uuid,status text,role text,joined_at timestamptz DEFAULT now());
CREATE FUNCTION public.current_user_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT p.active_tenant_id FROM profiles p WHERE p.user_id=auth.uid() AND EXISTS(SELECT 1 FROM tenant_members m WHERE m.user_id=auth.uid() AND m.tenant_id=p.active_tenant_id AND m.status='active')),
 (SELECT tenant_id FROM tenant_members WHERE user_id=auth.uid() AND status='active' ORDER BY joined_at ASC LIMIT 1)) $$;
CREATE FUNCTION public.is_tenant_admin_as(_actor uuid,_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM tenant_members WHERE user_id=_actor AND tenant_id=_tenant AND status='active' AND role IN ('owner','admin')) $$;
CREATE FUNCTION public.is_tenant_admin(_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT is_tenant_admin_as(auth.uid(),_tenant) $$;
CREATE FUNCTION public.is_tenant_member(_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM tenant_members WHERE user_id=auth.uid() AND tenant_id=_tenant AND status='active') $$;
CREATE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.platform_encrypt(v text) RETURNS bytea LANGUAGE sql STRICT AS $$ SELECT pgp_sym_encrypt(v,'ephemeral-fixture-key') $$;
CREATE FUNCTION public.platform_decrypt(v bytea) RETURNS text LANGUAGE sql STRICT AS $$ SELECT pgp_sym_decrypt(v,'ephemeral-fixture-key') $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
\ir ../../supabase/migrations/20260711210000_tenant_n8n_connections.sql
\ir ../../supabase/migrations/20261010000000_n8n_url_credentials_guard.sql
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO tenants VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
INSERT INTO tenant_members(tenant_id,user_id,status,role) VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','active','admin'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','active','admin'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','active','member');
-- Deliberately permissive fixture RLS: test new guard holds even through the legacy ALL policy.
GRANT ALL ON tenant_n8n_connections TO authenticated,service_role;
CREATE POLICY proof_legacy_all ON tenant_n8n_connections FOR ALL TO authenticated USING(true) WITH CHECK(true);
