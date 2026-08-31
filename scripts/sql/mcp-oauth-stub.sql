-- Minimal stand-ins so the MCP migrations can be replayed against a bare Postgres.
--
-- These are NOT the real objects. They exist only so the migrations' DDL resolves and can
-- be executed; nothing here is a substitute for the real encryption, tenancy or role
-- helpers, and no assertion in mcp-oauth-proof.sql depends on their internals.
-- See scripts/sql/mcp-oauth-proof.sql for how to run them together.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DEFINE: anything the migrations under test define
-- themselves. `_mcp_resolve_tenant`, `_mcp_check_provider`, every RPC and the whole
-- provider-scoped shape of `tenant_mcp_connections` come from 20261005 onward. A stub that
-- pre-created them would replace the code being proved with a hand-written double, and the
-- replay would then pass without the migration's ALTERs ever having run.

-- Roles are cluster-wide, so a second database on the same cluster finds them present.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS public.tenants (id uuid PRIMARY KEY);

-- Encryption is proved by the platform's own tests; here it only has to round-trip so the
-- migrations' encrypt/decrypt call sites type-check and execute.
CREATE OR REPLACE FUNCTION public.platform_encrypt(_t text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT convert_to(_t,'UTF8') $$;
CREATE OR REPLACE FUNCTION public.platform_decrypt(_b bytea) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT convert_from(_b,'UTF8') $$;

CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.is_tenant_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.is_tenant_member(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.current_user_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

-- The PRE-migration shape, copied from 20260804130000_tenant_mcp_connections.sql. It is
-- written out rather than replayed from that file because that migration also creates RPCs
-- 20261005 then drops and replaces; starting from the table alone keeps the replay about
-- the migrations under test, and it means 20261005's ALTERs do real work here.
CREATE TABLE IF NOT EXISTS public.tenant_mcp_connections (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  label            text,
  server_url_ct    bytea,
  auth_token_ct    bytea,
  auth_token_last4 text,
  transport        text NOT NULL DEFAULT 'http'
                     CHECK (transport IN ('http', 'sse', 'stdio')),
  enabled          boolean NOT NULL DEFAULT true,
  tools_cache      jsonb,
  status           text NOT NULL DEFAULT 'unconfigured'
                     CHECK (status IN ('unconfigured', 'connected', 'error')),
  last_error       text,
  last_probed_at   timestamptz,
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_mcp_connections ENABLE ROW LEVEL SECURITY;
