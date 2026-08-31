-- Provider-scoped tenant MCP registry (Integration Registry, slice 1).
--
-- WHY: `tenant_mcp_connections` was keyed `tenant_id PRIMARY KEY`, so a workspace
-- could hold exactly ONE MCP connection. The registry now has to carry a tenant's
-- n8n MCP endpoint AND their Zapier MCP endpoint at the same time. This EVOLVES the
-- one registry into provider-scoped records. It does NOT create a second registry.
--
-- FORWARD ONLY. `tenant_n8n_connections` (the shipped API-key connection, which has
-- a live customer row) is NOT referenced, altered, read, or tested against anywhere
-- in this migration. Nothing here can touch that row or its secret.
--
-- SAFE TO RESTRUCTURE, AND NOT BECAUSE THE TABLE IS EMPTY: `tenant_mcp_connections`
-- holds 0 rows on production (measured, not assumed), so the primary-key change and the
-- `provider` backfill rewrite nothing THERE. That fact is reported for the deploy record,
-- not relied on: it describes one database, and this file is replayed by every environment
-- and preview branch. Section 3 therefore normalises whatever rows exist before any new
-- constraint is added, so the migration is correct on a populated database too.
--
-- PROVIDER-NATIVE TRANSPORT, from the providers' own current documentation:
--   • Zapier MCP  — Streamable HTTP ONLY. Zapier states it does not support SSE.
--   • n8n MCP     — the MCP Server Trigger node offers SSE and Streamable HTTP.
--   • stdio       — REMOVED as a tenant-selectable transport. It is a local-process
--                   transport with no meaning for a remote tenant endpoint; neither
--                   provider offers it, and accepting it invited a value the server
--                   could never honour.
--
-- HONEST STATUS: the previous setter wrote status='connected' the moment credentials
-- were saved. Storing a token is not evidence that a connection works. Saving now
-- writes 'pending_verification'; only a real probe (update_tenant_mcp_probe) may
-- write 'connected'. The systems-check runner reads status='connected' and therefore
-- gets stricter — it now counts only connections actually proven, never merely saved.

-- ── 1. Provider scope ───────────────────────────────────────────────────────────
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'zapier';

ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_provider_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_provider_chk
  CHECK (provider IN ('zapier', 'n8n'));

-- One row per (tenant, provider). Re-keying is a no-op on an empty table.
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_pkey;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_pkey PRIMARY KEY (tenant_id, provider);

-- ── 2. Auth shape ───────────────────────────────────────────────────────────────
-- n8n is a tenant-hosted endpoint authenticated with a tenant-supplied bearer or a
-- custom header. Zapier is OAuth 2.1 against a fixed host, with DCR + PKCE. The two
-- cannot share one credential shape, so the row records which one it is.
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS auth_kind text NOT NULL DEFAULT 'bearer';
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_auth_kind_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_auth_kind_chk
  CHECK (auth_kind IN ('bearer', 'header', 'oauth'));

-- n8n "Header Auth" sends the credential under a caller-named header. The NAME is
-- not a secret; the value lives encrypted in auth_token_ct like every other secret.
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS auth_header_name text;

-- OAuth material (Zapier). Refresh tokens are secrets and are stored encrypted with
-- the same platform helper as every other credential here. The client id issued by
-- Dynamic Client Registration is NOT a secret for a public client, so it is stored
-- in the clear deliberately; a client_secret is only ever present if the provider
-- refuses public-client registration, and it is encrypted when it is.
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS refresh_token_ct bytea;
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS oauth_issuer text;
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS oauth_client_id text;
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS oauth_client_secret_ct bytea;
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS oauth_scopes text;

-- ── 3. Normalise the rows that are actually there, BEFORE any check is added ────────
--
-- ORDER IS THE WHOLE POINT. Every constraint below rejects a shape the OLD table allowed
-- and the backfill above has just produced, so each one aborts the entire deploy if a row
-- still holds the old shape. Normalisation therefore runs FIRST, ahead of both checks, and
-- covers EVERY legacy shape rather than the one that came to mind.
--
-- The previous version of this block sat between the two constraints. It normalised the
-- auth shape, so the auth check passed, and it never touched `transport`, so the transport
-- check aborted on any row saved as 'sse' or 'stdio' — both of which 20260804130000
-- explicitly accepted. The bug was not the reasoning, which is written out below; it was
-- that the reasoning was applied to one of the two constraints and never re-checked against
-- the other.
--
-- Transport first, and for every row rather than only Zapier's: the client speaks
-- Streamable HTTP and nothing else, 20261014 narrows the column to 'http' outright, and no
-- stored value other than 'http' has ever reached the wire. Rewriting it removes nothing
-- that worked. This touches no credential.
DO $$
DECLARE _n integer;
BEGIN
  UPDATE public.tenant_mcp_connections
     SET transport = 'http'
   WHERE transport <> 'http';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RAISE NOTICE 'mcp registry: normalised % connection(s) to the http transport', _n;
END $$;

-- Zapier is OAuth-only here: a pasted long-lived Zapier token is refused by the
-- schema, not merely discouraged by the UI.
--
-- What a legacy row IS: a Zapier connection whose credential was pasted. That credential
-- cannot work on the new path at all — every Zapier call now refreshes an OAuth grant it
-- does not have — so leaving it in place would be a connection that reads as configured
-- and is not (§13). The row is therefore emptied of its unusable credential and marked
-- unconfigured, NOT deleted: the workspace keeps its row and sees that it needs
-- reconnecting, which is the true state. The endpoint is deliberately kept, so the admin
-- can see which connection this was.
--
-- "The table is empty on production" is true today and is NOT what makes this safe: that
-- is a claim about one database, which the migration cannot check and a reviewer cannot
-- verify, and which says nothing about any other environment replaying the same file.
DO $$
DECLARE _n integer;
BEGIN
  UPDATE public.tenant_mcp_connections SET
    auth_kind        = 'oauth',
    auth_token_ct    = NULL,
    auth_token_last4 = NULL,
    auth_header_name = NULL,
    enabled          = false,
    status           = 'unconfigured',
    last_error       = NULL
  WHERE provider = 'zapier' AND auth_kind <> 'oauth';
  GET DIAGNOSTICS _n = ROW_COUNT;
  -- Recorded in the deploy log so what actually happened is on record, rather than
  -- inferred afterwards from the absence of a failure.
  RAISE NOTICE 'mcp registry: normalised % legacy zapier connection(s) to oauth/unconfigured', _n;
END $$;

-- ── 4. Provider-native transport, and stdio removed ─────────────────────────────
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_transport_check;
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_transport_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_transport_chk CHECK (
    (provider = 'zapier' AND transport = 'http')
    OR (provider = 'n8n' AND transport IN ('http', 'sse'))
  );

ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_provider_auth_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_provider_auth_chk CHECK (
    (provider = 'zapier' AND auth_kind = 'oauth')
    OR (provider = 'n8n' AND auth_kind IN ('bearer', 'header'))
  );

-- Header auth without a header name is unusable; reject the pair, don't store it.
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_header_name_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_header_name_chk CHECK (
    auth_kind <> 'header' OR (auth_header_name IS NOT NULL AND btrim(auth_header_name) <> '')
  );

-- ── 5. Honest status ────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_status_check;
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_status_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_status_chk
  CHECK (status IN ('unconfigured', 'pending_verification', 'connected', 'error'));

-- ── 6. Provider-scoped RPCs ─────────────────────────────────────────────────────
-- The old single-connection signatures are DROPPED rather than overloaded: adding a
-- defaulted `_provider` would leave two candidates and make a named-argument call
-- from PostgREST ambiguous. Every producer is updated in the same change (§37):
--   • supabase/functions/call-zapier-action        → get_tenant_mcp_secret
--   • supabase/functions/_shared/systems-check-runners/external_automation_detected
--     reads the TABLE directly with .limit(1); still correct with several rows
--   • src/solo/settings-integrations.tsx           → get_tenant_mcp_connection
DROP FUNCTION IF EXISTS public.set_tenant_mcp_connection(text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.get_tenant_mcp_connection(uuid);
DROP FUNCTION IF EXISTS public.clear_tenant_mcp_connection(uuid);
DROP FUNCTION IF EXISTS public.get_tenant_mcp_secret(uuid);
DROP FUNCTION IF EXISTS public.update_tenant_mcp_probe(uuid, text, text, jsonb);

-- Shared caller gate. Identical in shape to the audited n8n seam: the subject is
-- always auth.uid(), a mismatched _tenant_id raises, and a write demands admin.
CREATE OR REPLACE FUNCTION public._mcp_resolve_tenant(
  _tenant_id uuid,
  _need_admin boolean
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF _need_admin THEN
      IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
        RAISE EXCEPTION 'MCP_FORBIDDEN: admin required' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NOT (public.is_tenant_member(_tenant) OR public.is_platform_owner()) THEN
        RAISE EXCEPTION 'MCP_FORBIDDEN: not a member' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    -- service_role / trusted context: auth.uid() is NULL only there, because
    -- EXECUTE is never granted to anon (asserted by the grants at the foot of
    -- this file and by the definer-fn CI guard).
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN _tenant;
END;
$$;

CREATE OR REPLACE FUNCTION public._mcp_check_provider(_provider text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE _p text := lower(btrim(COALESCE(_provider, '')));
BEGIN
  IF _p NOT IN ('zapier', 'n8n') THEN
    RAISE EXCEPTION 'MCP_BAD_PROVIDER: provider must be zapier or n8n' USING ERRCODE = '22023';
  END IF;
  RETURN _p;
END;
$$;

-- 5a. Safe status read — one provider, or every provider for the tenant.
CREATE OR REPLACE FUNCTION public.get_tenant_mcp_connections(
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _out jsonb;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  SELECT COALESCE(jsonb_object_agg(c.provider, jsonb_build_object(
           'configured', c.auth_token_ct IS NOT NULL OR c.refresh_token_ct IS NOT NULL,
           'provider', c.provider,
           'label', c.label,
           'transport', c.transport,
           'auth_kind', c.auth_kind,
           -- Safe display hint only. The token itself is unreadable from here.
           'auth_token_last4', c.auth_token_last4,
           'enabled', c.enabled,
           'status', c.status,
           'expires_at', c.access_token_expires_at,
           'last_probed_at', c.last_probed_at,
           -- Host only, never the full URL with its secret path segment. An n8n MCP
           -- trigger URL carries a random path that is itself a capability.
           'server_url_host', CASE WHEN c.server_url_ct IS NOT NULL
             THEN split_part(split_part(public.platform_decrypt(c.server_url_ct), '://', 2), '/', 1)
             ELSE NULL END,
           'tool_count', CASE WHEN c.tools_cache IS NULL THEN NULL
                              ELSE jsonb_array_length(COALESCE(c.tools_cache -> 'tools', '[]'::jsonb)) END
         )), '{}'::jsonb)
    INTO _out
    FROM public.tenant_mcp_connections c
   WHERE c.tenant_id = _tenant;
  RETURN _out;
END;
$$;

-- 5b. n8n connect — tenant-supplied endpoint + bearer/header credential.
-- Zapier cannot be written through this path: its credential is minted by OAuth,
-- never pasted, and the provider/auth CHECK refuses the row anyway.
CREATE OR REPLACE FUNCTION public.set_tenant_n8n_mcp_connection(
  _server_url   text,
  _auth_token   text,
  _transport    text DEFAULT 'http',
  _auth_kind    text DEFAULT 'bearer',
  _header_name  text DEFAULT NULL,
  _label        text DEFAULT NULL,
  _tenant_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _url    text := btrim(COALESCE(_server_url, ''));
  _token  text := btrim(COALESCE(_auth_token, ''));
  _transp text := lower(btrim(COALESCE(_transport, 'http')));
  _kind   text := lower(btrim(COALESCE(_auth_kind, 'bearer')));
  _hname  text := NULLIF(btrim(COALESCE(_header_name, '')), '');
BEGIN
  IF _url = '' THEN RAISE EXCEPTION 'MCP_NO_URL: server URL is required' USING ERRCODE = '22023'; END IF;
  IF _url !~* '^https://' THEN
    RAISE EXCEPTION 'MCP_INSECURE_URL: server URL must be https://' USING ERRCODE = '22023';
  END IF;
  -- Credentials in the URL would be logged by every hop that ever sees it.
  IF _url ~ '@' AND split_part(split_part(_url, '://', 2), '/', 1) ~ '@' THEN
    RAISE EXCEPTION 'MCP_URL_CREDENTIALS: remove the credentials from the URL' USING ERRCODE = '22023';
  END IF;
  IF _token = '' THEN RAISE EXCEPTION 'MCP_NO_TOKEN: a credential is required' USING ERRCODE = '22023'; END IF;
  IF _transp NOT IN ('http', 'sse') THEN
    RAISE EXCEPTION 'MCP_BAD_TRANSPORT: n8n supports http or sse' USING ERRCODE = '22023';
  END IF;
  IF _kind NOT IN ('bearer', 'header') THEN
    RAISE EXCEPTION 'MCP_BAD_AUTH_KIND: n8n uses bearer or header auth' USING ERRCODE = '22023';
  END IF;
  IF _kind = 'header' AND _hname IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_HEADER_NAME: header auth needs a header name' USING ERRCODE = '22023';
  END IF;

  _tenant := public._mcp_resolve_tenant(_tenant_id, true);

  INSERT INTO public.tenant_mcp_connections
    (tenant_id, provider, label, server_url_ct, auth_token_ct, auth_token_last4,
     transport, auth_kind, auth_header_name, enabled, status, last_error,
     created_by, updated_by, updated_at)
  VALUES
    (_tenant, 'n8n', NULLIF(btrim(COALESCE(_label, '')), ''),
     public.platform_encrypt(_url), public.platform_encrypt(_token), right(_token, 4),
     _transp, _kind, _hname, true,
     -- Saved, not proven. Only a real probe may claim 'connected'.
     'pending_verification', NULL, _caller, _caller, now())
  ON CONFLICT (tenant_id, provider) DO UPDATE SET
    label            = COALESCE(NULLIF(btrim(COALESCE(_label, '')), ''), public.tenant_mcp_connections.label),
    server_url_ct    = EXCLUDED.server_url_ct,
    auth_token_ct    = EXCLUDED.auth_token_ct,
    auth_token_last4 = EXCLUDED.auth_token_last4,
    transport        = EXCLUDED.transport,
    auth_kind        = EXCLUDED.auth_kind,
    auth_header_name = EXCLUDED.auth_header_name,
    enabled          = true,
    status           = 'pending_verification',
    last_error       = NULL,
    updated_by       = EXCLUDED.updated_by,
    updated_at       = now();

  RETURN jsonb_build_object('ok', true, 'provider', 'n8n', 'status', 'pending_verification',
                            'transport', _transp, 'auth_token_last4', right(_token, 4));
END;
$$;

-- 5c. Disconnect one provider. Every credential column is cleared, not just the
-- one that provider happens to use, so no material can survive a reconnect.
CREATE OR REPLACE FUNCTION public.clear_tenant_mcp_connection(
  _provider  text,
  _tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _p text := public._mcp_check_provider(_provider);
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);
  UPDATE public.tenant_mcp_connections SET
    server_url_ct = NULL, auth_token_ct = NULL, auth_token_last4 = NULL,
    refresh_token_ct = NULL, oauth_client_secret_ct = NULL,
    access_token_expires_at = NULL, tools_cache = NULL,
    status = 'unconfigured', enabled = false, last_error = NULL,
    updated_by = auth.uid(), updated_at = now()
  WHERE tenant_id = _tenant AND provider = _p;
END;
$$;

-- 5d. SERVICE-ROLE ONLY decrypted read. The only path to a usable credential.
CREATE OR REPLACE FUNCTION public.get_tenant_mcp_secret(
  _tenant_id uuid,
  _provider  text DEFAULT 'zapier'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.tenant_mcp_connections; _p text := public._mcp_check_provider(_provider);
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _row FROM public.tenant_mcp_connections
   WHERE tenant_id = _tenant_id AND provider = _p;
  IF _row.tenant_id IS NULL OR _row.server_url_ct IS NULL
     OR (_row.auth_token_ct IS NULL AND _row.refresh_token_ct IS NULL) THEN
    RETURN jsonb_build_object('configured', false);
  END IF;
  IF _row.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('configured', true, 'enabled', false);
  END IF;
  RETURN jsonb_build_object(
    'configured', true, 'enabled', true, 'provider', _row.provider,
    'server_url', public.platform_decrypt(_row.server_url_ct),
    'auth_token', CASE WHEN _row.auth_token_ct IS NULL THEN NULL
                       ELSE public.platform_decrypt(_row.auth_token_ct) END,
    'refresh_token', CASE WHEN _row.refresh_token_ct IS NULL THEN NULL
                          ELSE public.platform_decrypt(_row.refresh_token_ct) END,
    'auth_kind', _row.auth_kind,
    'auth_header_name', _row.auth_header_name,
    'expires_at', _row.access_token_expires_at,
    'oauth_issuer', _row.oauth_issuer,
    'oauth_client_id', _row.oauth_client_id,
    'oauth_client_secret', CASE WHEN _row.oauth_client_secret_ct IS NULL THEN NULL
                                ELSE public.platform_decrypt(_row.oauth_client_secret_ct) END,
    'transport', _row.transport
  );
END;
$$;

-- 5e. SERVICE-ROLE ONLY probe write. A probe is the ONLY writer of 'connected'.
CREATE OR REPLACE FUNCTION public.update_tenant_mcp_probe(
  _tenant_id   uuid,
  _provider    text,
  _status      text,
  _last_error  text  DEFAULT NULL,
  _tools_cache jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _p text := public._mcp_check_provider(_provider);
BEGIN
  IF _status IS NOT NULL AND _status NOT IN ('unconfigured', 'pending_verification', 'connected', 'error') THEN
    RAISE EXCEPTION 'MCP_BAD_STATUS' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tenant_mcp_connections SET
    status         = COALESCE(_status, status),
    -- Provider error text is unbounded external content. It is retained for
    -- operators but is never returned by any tenant-reachable read above.
    last_error     = _last_error,
    tools_cache    = COALESCE(_tools_cache, tools_cache),
    last_probed_at = now(),
    updated_at     = now()
  WHERE tenant_id = _tenant_id AND provider = _p;
END;
$$;

-- ── 7. Grants — anon never reaches any of these ─────────────────────────────────
REVOKE ALL ON FUNCTION public._mcp_resolve_tenant(uuid, boolean)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mcp_check_provider(text)                                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_mcp_connections(uuid)                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_tenant_n8n_mcp_connection(text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_tenant_mcp_connection(text, uuid)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_mcp_secret(uuid, text)                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tenant_mcp_probe(uuid, text, text, text, jsonb)               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_connections(uuid)                                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_n8n_mcp_connection(text, text, text, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_tenant_mcp_connection(text, uuid)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_secret(uuid, text)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_mcp_probe(uuid, text, text, text, jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION public._mcp_resolve_tenant(uuid, boolean)                                   TO service_role;
GRANT EXECUTE ON FUNCTION public._mcp_check_provider(text)                                            TO authenticated, service_role;

COMMENT ON TABLE public.tenant_mcp_connections IS
  'Provider-scoped tenant MCP connections, one row per (tenant, provider). n8n uses a tenant-supplied endpoint with bearer/header auth; Zapier uses OAuth 2.1 (DCR + PKCE) against mcp.zapier.com. Every credential column is encrypted; only get_tenant_mcp_secret (service_role) can decrypt, and only a probe may write status=connected.';
