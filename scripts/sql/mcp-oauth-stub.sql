-- Minimal stand-ins so the MCP migrations can be replayed against a bare Postgres.
--
-- These are NOT the real objects. They exist only so the migrations' DDL resolves and can
-- be executed; nothing here is a substitute for the real encryption, tenancy or role
-- helpers, and no assertion in mcp-oauth-proof.sql depends on their internals.
-- See scripts/sql/mcp-oauth-proof.sql for how to run them together.

-- Minimal stand-ins for the objects these migrations depend on. Only enough for the DDL
-- to resolve; the point is to make Postgres parse and accept every statement.
-- Roles are cluster-wide, so a second database on the same cluster finds them present.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE IF NOT EXISTS public.tenants (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.platform_encrypt(_t text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT convert_to(_t,'UTF8') $$;
CREATE OR REPLACE FUNCTION public.platform_decrypt(_b bytea) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT convert_from(_b,'UTF8') $$;
CREATE OR REPLACE FUNCTION public._mcp_check_provider(_p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim(_p)) $$;
CREATE OR REPLACE FUNCTION public._mcp_resolve_tenant(_t uuid, _a boolean) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT _t $$;
CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.is_tenant_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE IF NOT EXISTS public.tenant_mcp_connections (
  tenant_id uuid NOT NULL, provider text NOT NULL, label text,
  server_url_ct bytea, auth_token_ct bytea, auth_token_last4 text,
  refresh_token_ct bytea, access_token_expires_at timestamptz,
  oauth_issuer text, oauth_client_id text, oauth_client_secret_ct bytea, oauth_scopes text[],
  transport text, auth_kind text, auth_header_name text, enabled boolean,
  status text, last_error text, tools_cache jsonb, last_probed_at timestamptz,
  created_by uuid, updated_by uuid, updated_at timestamptz,
  PRIMARY KEY (tenant_id, provider)
);
