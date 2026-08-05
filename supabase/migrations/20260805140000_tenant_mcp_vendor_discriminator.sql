-- tenant_mcp_connections — add a VENDOR discriminator so a tenant can hold BOTH a
-- Zapier MCP connection AND an n8n MCP (Server Trigger) connection at once (#267).
--
-- WHY (§18 extend, not fork): tenant_mcp_connections (20260804130000) was one row per
-- tenant (PK = tenant_id), implicitly Zapier-only. #267 adds an OUTBOUND MCP path to a
-- tenant's own published n8n MCP Server Trigger tools ALONGSIDE the existing Zapier
-- path — same table, same encrypted-secret model, same dual-caller RPC guards — so the
-- runtime is one home, discriminated by `vendor`. n8n's MCP endpoint is session-based
-- (SSE / Streamable-HTTP with an initialize handshake); Zapier's is a stateless
-- single-shot POST. Both are still "a tenant-supplied MCP server URL + a bearer token,"
-- so they share this store.
--
-- BACKWARD-COMPATIBLE BY CONSTRUCTION (§37):
--  • `vendor` defaults to 'zapier', so every existing row and every existing Zapier
--    caller that passes no vendor keeps resolving the Zapier row byte-for-byte.
--  • Each RPC gains a trailing `_vendor text DEFAULT 'zapier'` param. PostgREST fills
--    the default when a caller omits it, so the current Zapier producers (which pass
--    only their existing named args) are unchanged. New n8n callers pass _vendor=>'n8n'.
--  • A token is STILL mandatory for both vendors — n8n's MCP Server Trigger authenticates
--    with a separate Bearer credential (the secret is NOT embedded in the URL path, unlike
--    Zapier), so set_ keeps its MCP_NO_TOKEN raise for every vendor. (No no-auth n8n path.)
--
-- The five RPCs are DROPPED and recreated (not CREATE OR REPLACE) because adding a
-- parameter changes the function signature — replacing in place would leave a stale
-- overload PostgREST could ambiguously resolve. Dropping first guarantees exactly ONE
-- function per name, with the defaulted _vendor param.

-- ── 1. Column + primary key ─────────────────────────────────────────────────────
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS vendor text NOT NULL DEFAULT 'zapier';

-- Constrain to the vendors the runtime actually drives. A future vendor is a new
-- migration (widen the CHECK), never a silent free-text value (§13).
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_vendor_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_vendor_chk CHECK (vendor IN ('zapier', 'n8n'));

-- Re-key on (tenant_id, vendor) so a Zapier row and an n8n row coexist for one tenant.
-- (The tenant_id → tenants(id) FK is a separate constraint and is untouched.)
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_pkey;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_pkey PRIMARY KEY (tenant_id, vendor);

-- ── 2. set_tenant_mcp_connection — operator saves/updates their MCP creds ─────────
DROP FUNCTION IF EXISTS public.set_tenant_mcp_connection(text, text, text, text, uuid);
CREATE FUNCTION public.set_tenant_mcp_connection(
  _server_url text,
  _auth_token text,
  _transport  text DEFAULT 'http',
  _label      text DEFAULT NULL,
  _tenant_id  uuid DEFAULT NULL,
  _vendor     text DEFAULT 'zapier'
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
  _vend      text := lower(btrim(COALESCE(_vendor, 'zapier')));
BEGIN
  IF _vend NOT IN ('zapier', 'n8n') THEN
    RAISE EXCEPTION 'MCP_BAD_VENDOR: vendor must be zapier or n8n' USING ERRCODE = '22023';
  END IF;
  IF _url = '' THEN
    RAISE EXCEPTION 'MCP_NO_URL: server URL is required' USING ERRCODE = '22023';
  END IF;
  IF _url !~* '^https://' THEN
    RAISE EXCEPTION 'MCP_INSECURE_URL: server URL must be https://' USING ERRCODE = '22023';
  END IF;
  -- A token is required for BOTH vendors: Zapier embeds a secret in its path AND uses a
  -- bearer; n8n's MCP Server Trigger authenticates with a separate Bearer credential.
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
    (tenant_id, vendor, label, server_url_ct, auth_token_ct, auth_token_last4, transport,
     enabled, status, last_error, created_by, updated_by, updated_at)
  VALUES
    (_tenant, _vend, NULLIF(btrim(COALESCE(_label, '')), ''), public.platform_encrypt(_url),
     public.platform_encrypt(_token), right(_token, 4), _transp,
     true, 'connected', NULL, _caller, _caller, now())
  ON CONFLICT (tenant_id, vendor) DO UPDATE SET
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

  RETURN jsonb_build_object('ok', true, 'tenant_id', _tenant, 'vendor', _vend, 'status', 'connected',
                            'transport', _transp, 'auth_token_last4', right(_token, 4));
END;
$$;

-- ── 3. get_tenant_mcp_connection — SAFE status for the operator UI (no token) ──────
DROP FUNCTION IF EXISTS public.get_tenant_mcp_connection(uuid);
CREATE FUNCTION public.get_tenant_mcp_connection(
  _tenant_id uuid DEFAULT NULL,
  _vendor    text DEFAULT 'zapier'
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
  _vend   text := lower(btrim(COALESCE(_vendor, 'zapier')));
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

  SELECT * INTO _row FROM public.tenant_mcp_connections WHERE tenant_id = _tenant AND vendor = _vend;

  IF _row.tenant_id IS NULL THEN
    RETURN jsonb_build_object('configured', false, 'vendor', _vend, 'status', 'unconfigured');
  END IF;

  RETURN jsonb_build_object(
    'configured', _row.auth_token_ct IS NOT NULL,
    'vendor', _row.vendor,
    'label', _row.label,
    -- SECURITY (§9 intra-tenant): a remote-MCP server_url can embed the secret in its
    -- path (Zapier: https://mcp.zapier.com/api/mcp/s/<SECRET>/mcp). So the member-facing
    -- safe getter returns ONLY scheme+host as a display hint — never the full secret
    -- path. The full decrypted URL lives exclusively in get_tenant_mcp_secret below.
    'server_url_host', CASE
      WHEN _row.server_url_ct IS NOT NULL
        THEN regexp_replace(public.platform_decrypt(_row.server_url_ct), '^(https?://[^/]+).*$', '\1')
      ELSE NULL END,
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
DROP FUNCTION IF EXISTS public.get_tenant_mcp_secret(uuid);
CREATE FUNCTION public.get_tenant_mcp_secret(
  _tenant_id uuid,
  _vendor    text DEFAULT 'zapier'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row  public.tenant_mcp_connections;
  _vend text := lower(btrim(COALESCE(_vendor, 'zapier')));
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _row FROM public.tenant_mcp_connections WHERE tenant_id = _tenant_id AND vendor = _vend;
  IF _row.tenant_id IS NULL OR _row.auth_token_ct IS NULL OR _row.server_url_ct IS NULL THEN
    RETURN jsonb_build_object('configured', false, 'vendor', _vend);
  END IF;
  IF _row.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('configured', true, 'vendor', _vend, 'enabled', false);
  END IF;
  RETURN jsonb_build_object(
    'configured', true,
    'enabled', true,
    'vendor', _row.vendor,
    'server_url', public.platform_decrypt(_row.server_url_ct),
    'auth_token', public.platform_decrypt(_row.auth_token_ct),
    'transport', _row.transport
  );
END;
$$;

-- ── 5. update_tenant_mcp_probe — SERVICE-ROLE ONLY, edge fn writes probe/sync state ─
DROP FUNCTION IF EXISTS public.update_tenant_mcp_probe(uuid, text, text, jsonb);
CREATE FUNCTION public.update_tenant_mcp_probe(
  _tenant_id   uuid,
  _status      text,
  _last_error  text  DEFAULT NULL,
  _tools_cache jsonb DEFAULT NULL,
  _vendor      text  DEFAULT 'zapier'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vend text := lower(btrim(COALESCE(_vendor, 'zapier')));
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
  WHERE tenant_id = _tenant_id AND vendor = _vend;
END;
$$;

-- ── 6. clear_tenant_mcp_connection — operator disconnects ─────────────────────────
DROP FUNCTION IF EXISTS public.clear_tenant_mcp_connection(uuid);
CREATE FUNCTION public.clear_tenant_mcp_connection(
  _tenant_id uuid DEFAULT NULL,
  _vendor    text DEFAULT 'zapier'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _vend   text := lower(btrim(COALESCE(_vendor, 'zapier')));
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
  WHERE tenant_id = _tenant AND vendor = _vend;
END;
$$;

-- ── 7. Grants (mirror 20260804130000, on the NEW _vendor signatures) ───────────────
REVOKE ALL ON FUNCTION public.set_tenant_mcp_connection(text, text, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_mcp_connection(uuid, text)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_mcp_secret(uuid, text)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tenant_mcp_probe(uuid, text, text, jsonb, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_tenant_mcp_connection(uuid, text)                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_tenant_mcp_connection(text, text, text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_connection(uuid, text)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_tenant_mcp_connection(uuid, text)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_secret(uuid, text)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_mcp_probe(uuid, text, text, jsonb, text)        TO service_role;
