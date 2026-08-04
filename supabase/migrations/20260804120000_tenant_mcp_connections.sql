-- Per-tenant MCP (Zapier / remote MCP server) connections — each tenant connects
-- THEIR OWN MCP server so Paige can call Zapier actions on their behalf (§9: never a
-- platform default; the shared ZAPIER_MCP_TOKEN + admin-role paige_mcp_connections is
-- a multi-tenant ISOLATION GAP — it has no tenant_id, so one tenant's connection is
-- reachable by every admin and every action routes through one shared env-var token).
--
-- This migration is the §9 fix (Wave 1 #240, Track B slice B1): a NEW tenant-scoped
-- table that mirrors the PROVEN tenant_n8n_connections model EXACTLY, adapted to MCP
-- fields (server_url + transport + tools_cache instead of base_url + workflow_count).
--
-- ADDITIVE ONLY — the legacy platform-global paige_mcp_connections table is NOT dropped
-- or altered here; its retirement (and the call-zapier-action edge fn cutover) are later
-- slices. This migration only ADDS the new tenant-scoped table + RPCs.
--
-- Secrets: the MCP server URL and bearer token are stored ENCRYPTED via the platform's
-- pgcrypto helper (platform_encrypt/decrypt, keyed off _internal_secrets.platform_column_key,
-- service_role only) — the same helpers tenant_n8n_connections uses. The decrypted token
-- is NEVER returned to a browser; only edge functions (service role) can read it, and only
-- to call the tenant's MCP server-side.
--
-- Access mirrors tenant_n8n_connections: RLS owner-ALL, and all reads/writes go through
-- dual-caller SECURITY DEFINER RPCs (JWT caller pinned to their own tenant + admin-gated;
-- service/Paige path trusts the passed tenant_id). No tenant-member SELECT policy exists on
-- purpose — the ciphertext columns must never be exposed to a member row-read; safe status
-- is served by the getter RPC. §190 lockdown discipline: the plaintext URL never lives in a
-- readable column — only the encrypted server_url_ct does — so there is no column to REVOKE.

-- ── 1. Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_mcp_connections (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  label            text,
  server_url_ct    bytea,                       -- encrypted MCP server URL (e.g. https://mcp.zapier.com/api/mcp/s/…)
  auth_token_ct    bytea,                       -- encrypted MCP bearer token
  auth_token_last4 text,                        -- safe display hint, never the token
  transport        text NOT NULL DEFAULT 'http'
                     CHECK (transport IN ('http', 'sse', 'stdio')),
  enabled          boolean NOT NULL DEFAULT true,
  tools_cache      jsonb,                       -- last-probed tool inventory (display/routing hint)
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

-- Platform owner may operate directly; everyone else goes through the RPCs. No
-- tenant-member SELECT policy exists on purpose — the ciphertext columns must
-- never be exposed to a member row-read; safe status is served by the getter RPC.
DROP POLICY IF EXISTS tenant_mcp_owner_all ON public.tenant_mcp_connections;
CREATE POLICY tenant_mcp_owner_all ON public.tenant_mcp_connections
  FOR ALL
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- ── 2. set_tenant_mcp_connection — operator saves/updates their MCP creds ─────────
CREATE OR REPLACE FUNCTION public.set_tenant_mcp_connection(
  _server_url text,
  _auth_token text,
  _transport  text DEFAULT 'http',
  _label      text DEFAULT NULL,
  _tenant_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller    uuid := auth.uid();
  _tenant    uuid;
  _url       text := btrim(COALESCE(_server_url, ''));
  _token     text := btrim(COALESCE(_auth_token, ''));
  _transp    text := lower(btrim(COALESCE(_transport, 'http')));
BEGIN
  IF _url = '' THEN
    RAISE EXCEPTION 'MCP_NO_URL: server URL is required' USING ERRCODE = '22023';
  END IF;
  IF _url !~* '^https://' THEN
    RAISE EXCEPTION 'MCP_INSECURE_URL: server URL must be https://' USING ERRCODE = '22023';
  END IF;
  IF _token = '' THEN
    RAISE EXCEPTION 'MCP_NO_TOKEN: auth token is required' USING ERRCODE = '22023';
  END IF;
  IF _transp NOT IN ('http', 'sse', 'stdio') THEN
    RAISE EXCEPTION 'MCP_BAD_TRANSPORT: transport must be http, sse, or stdio' USING ERRCODE = '22023';
  END IF;

  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: admin required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO public.tenant_mcp_connections
    (tenant_id, label, server_url_ct, auth_token_ct, auth_token_last4, transport,
     enabled, status, last_error, created_by, updated_by, updated_at)
  VALUES
    (_tenant, NULLIF(btrim(COALESCE(_label, '')), ''), public.platform_encrypt(_url),
     public.platform_encrypt(_token), right(_token, 4), _transp,
     true, 'connected', NULL, _caller, _caller, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    label            = COALESCE(NULLIF(btrim(COALESCE(_label, '')), ''), public.tenant_mcp_connections.label),
    server_url_ct    = EXCLUDED.server_url_ct,
    auth_token_ct    = EXCLUDED.auth_token_ct,
    auth_token_last4 = EXCLUDED.auth_token_last4,
    transport        = EXCLUDED.transport,
    enabled          = true,
    status           = 'connected',
    last_error       = NULL,
    updated_by       = EXCLUDED.updated_by,
    updated_at       = now();

  RETURN jsonb_build_object('ok', true, 'tenant_id', _tenant, 'status', 'connected',
                            'transport', _transp, 'auth_token_last4', right(_token, 4));
END;
$$;

-- ── 3. get_tenant_mcp_connection — SAFE status for the operator UI (no token) ──────
CREATE OR REPLACE FUNCTION public.get_tenant_mcp_connection(
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row    public.tenant_mcp_connections;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_member(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: not a member' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  SELECT * INTO _row FROM public.tenant_mcp_connections WHERE tenant_id = _tenant;

  IF _row.tenant_id IS NULL THEN
    RETURN jsonb_build_object('configured', false, 'status', 'unconfigured');
  END IF;

  RETURN jsonb_build_object(
    'configured', _row.auth_token_ct IS NOT NULL,
    'label', _row.label,
    'server_url', CASE WHEN _row.server_url_ct IS NOT NULL THEN public.platform_decrypt(_row.server_url_ct) ELSE NULL END,
    'auth_token_last4', _row.auth_token_last4,
    'transport', _row.transport,
    'enabled', _row.enabled,
    'tools_cache', _row.tools_cache,
    'status', _row.status,
    'last_error', _row.last_error,
    'last_probed_at', _row.last_probed_at
  );
END;
$$;

-- ── 4. get_tenant_mcp_secret — SERVICE-ROLE ONLY, returns decrypted creds ─────────
-- The only path to the decrypted token. Never granted to authenticated; used by the
-- call-zapier-action edge function (service role) to call the tenant's MCP server.
-- §39/§45 lesson: SECURITY DEFINER bypasses REVOKE, so the caller is gated explicitly —
-- EXECUTE is REVOKED from anon + authenticated and GRANTed only to service_role below.
CREATE OR REPLACE FUNCTION public.get_tenant_mcp_secret(
  _tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.tenant_mcp_connections;
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _row FROM public.tenant_mcp_connections WHERE tenant_id = _tenant_id;
  IF _row.tenant_id IS NULL OR _row.auth_token_ct IS NULL OR _row.server_url_ct IS NULL THEN
    RETURN jsonb_build_object('configured', false);
  END IF;
  IF _row.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('configured', true, 'enabled', false);
  END IF;
  RETURN jsonb_build_object(
    'configured', true,
    'enabled', true,
    'server_url', public.platform_decrypt(_row.server_url_ct),
    'auth_token', public.platform_decrypt(_row.auth_token_ct),
    'transport', _row.transport
  );
END;
$$;

-- ── 5. update_tenant_mcp_probe — SERVICE-ROLE ONLY, edge fn writes probe/sync state ─
CREATE OR REPLACE FUNCTION public.update_tenant_mcp_probe(
  _tenant_id   uuid,
  _status      text,
  _last_error  text  DEFAULT NULL,
  _tools_cache jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _status IS NOT NULL AND _status NOT IN ('unconfigured', 'connected', 'error') THEN
    RAISE EXCEPTION 'MCP_BAD_STATUS' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tenant_mcp_connections SET
    status         = COALESCE(_status, status),
    last_error     = _last_error,
    tools_cache    = COALESCE(_tools_cache, tools_cache),
    last_probed_at = now(),
    updated_at     = now()
  WHERE tenant_id = _tenant_id;
END;
$$;

-- ── 6. clear_tenant_mcp_connection — operator disconnects ─────────────────────────
CREATE OR REPLACE FUNCTION public.clear_tenant_mcp_connection(
  _tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: admin required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  UPDATE public.tenant_mcp_connections SET
    server_url_ct = NULL, auth_token_ct = NULL, auth_token_last4 = NULL,
    enabled = false, tools_cache = NULL,
    status = 'unconfigured', last_error = NULL,
    updated_by = _caller, updated_at = now()
  WHERE tenant_id = _tenant;
END;
$$;

-- ── 7. Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.set_tenant_mcp_connection(text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_mcp_connection(uuid)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_mcp_secret(uuid)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tenant_mcp_probe(uuid, text, text, jsonb)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_tenant_mcp_connection(uuid)                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_tenant_mcp_connection(text, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_connection(uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_tenant_mcp_connection(uuid)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_secret(uuid)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_mcp_probe(uuid, text, text, jsonb)        TO service_role;
