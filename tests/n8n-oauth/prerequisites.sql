\set ON_ERROR_STOP on
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT COALESCE(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
GRANT SELECT ON auth.sessions TO service_role;
CREATE TABLE public.tenants(id uuid PRIMARY KEY,account_number bigint);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,active_tenant_id uuid);
CREATE TABLE public.tenant_members(tenant_id uuid,user_id uuid,is_owner boolean,status text,role text,joined_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION public.current_user_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT COALESCE((SELECT p.active_tenant_id FROM profiles p WHERE p.user_id=auth.uid() AND EXISTS(SELECT 1 FROM tenant_members m WHERE m.user_id=auth.uid() AND m.tenant_id=p.active_tenant_id AND m.status='active')),
(SELECT tenant_id FROM tenant_members WHERE user_id=auth.uid() AND status='active' ORDER BY joined_at ASC LIMIT 1)) $$;
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_user_id uuid,_tenant_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM tenant_members WHERE user_id=_user_id AND is_owner=true AND status='active' AND (_tenant_id IS NULL OR tenant_id=_tenant_id)) $$;
-- Real pgcrypto, ephemeral fixture-only key, never production credentials.
CREATE OR REPLACE FUNCTION public.platform_encrypt(v text) RETURNS bytea LANGUAGE sql STRICT AS $$ SELECT pgp_sym_encrypt(v,'ephemeral-n8n-proof-key') $$;
CREATE OR REPLACE FUNCTION public.platform_decrypt(v bytea) RETURNS text LANGUAGE sql STRICT AS $$ SELECT pgp_sym_decrypt(v,'ephemeral-n8n-proof-key') $$;
CREATE TABLE public.tenant_n8n_connections(tenant_id uuid PRIMARY KEY,api_key_ct bytea,base_url_ct bytea,status text,last_sync_at timestamptz,workflow_count int);
CREATE TABLE public.tenant_mcp_connections(tenant_id uuid,provider text,server_url_ct bytea,auth_token_ct bytea,auth_token_last4 text,
 refresh_token_ct bytea,access_token_expires_at timestamptz,oauth_issuer text,oauth_client_id text,oauth_client_secret_ct bytea,
 oauth_scopes text[],auth_kind text,auth_header_name text,transport text,enabled boolean,status text,last_error text,last_probed_at timestamptz,
 approved_capabilities jsonb,capability_pins jsonb,tools_cache jsonb,created_by uuid,updated_by uuid,updated_at timestamptz,PRIMARY KEY(tenant_id,provider));
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO tenants VALUES('10000000-0000-0000-0000-000000000001',100001),('10000000-0000-0000-0000-000000000002',100002);
INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
INSERT INTO tenant_members(tenant_id,user_id,is_owner,status,role) VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true,'active','owner'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',true,'active','owner'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false,'active','member');
INSERT INTO tenant_n8n_connections(tenant_id,api_key_ct,status,last_sync_at,workflow_count) VALUES('10000000-0000-0000-0000-000000000001',platform_encrypt('fixture-api-secret'),'connected',now(),0);

INSERT INTO auth.sessions VALUES('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',NULL);
CREATE FUNCTION public.get_tenant_n8n_api_readiness() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT jsonb_build_object('health',CASE WHEN status='error' THEN 'needs_attention' ELSE 'connected' END,'workflow_count',workflow_count,'last_success_at',last_sync_at) FROM tenant_n8n_connections WHERE tenant_id=current_user_tenant_id() $$;
