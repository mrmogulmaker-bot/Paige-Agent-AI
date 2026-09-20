-- ============================================================================
-- Connected MCP Gateway — a url-auth (credential-in-URL) connection is CONFIGURED (INT-079).
--
-- MCP PR-1B-a — one invariant only, no other change. get_mcp_connection_secret (migration
-- 20270319000000) refused an `auth_kind = 'url'` row (Zapier's credential-in-URL scheme, where the
-- credential lives IN the endpoint and BOTH token columns are legitimately null) as
-- `configured:false`, because the "both tokens null" guard exempted only `auth_kind = 'none'`. The
-- loader already allow-lists `url` (`MCP_EXECUTABLE_AUTH_KINDS`) and `authFromSecret` already maps it
-- to `{ kind: 'url' }`, so the ONLY defect is this RPC-side false-refuse: a validly-configured url
-- connection could never resolve, before the loader's own `url` handling ever ran.
--
-- THE FIX (one predicate): exempt `url` alongside `none` from the null-token guard. A url row whose
-- `server_url_ct` is present (the credential is inside the decrypted endpoint) is `configured:true`.
-- Everything else is BYTE-IDENTICAL to 20270319000000's body: a `bearer` / `header` / `oauth` row
-- with BOTH token columns null still returns `configured:false` (fail-closed, unchanged), the
-- `server_url_ct IS NULL` and `enabled` gates are unchanged, and the returned shape is unchanged.
--
-- Additive / backward-compatible: this only WIDENS `configured:true` to a class of row that was
-- previously (wrongly) refused; it removes nothing and changes no other branch. The only runtime
-- producer of this RPC is the library loader `makeRpcConnectionLoader` (imported by no deployed
-- function; §37), so no caller's expectations change.
--
-- ROLLBACK (forward-only repo; the inverse for the record):
--   CREATE OR REPLACE FUNCTION ... with the guard restored to `_row.auth_kind <> 'none'`
--   (i.e. re-apply 20270319000000's get_mcp_connection_secret body verbatim). No data migration,
--   no column change — this migration only replaces a function body.
--
-- §9: unchanged — the function stays SECURITY DEFINER, service-role-reachable, tenant-agnostic
-- (it returns the row's tenant_id; the caller enforces §9), and reveals no more than before.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_mcp_connection_secret(
  _connection_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.mcp_connections;
BEGIN
  IF _connection_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = _connection_id;
  -- A url-auth connection carries its credential IN the endpoint, so both token columns are
  -- legitimately null — exempt it from the null-token guard exactly as 'none' is exempt (INT-079).
  IF _row.connection_id IS NULL OR _row.server_url_ct IS NULL
     OR (_row.auth_token_ct IS NULL AND _row.refresh_token_ct IS NULL AND _row.auth_kind NOT IN ('none', 'url')) THEN
    RETURN jsonb_build_object('configured', false);
  END IF;
  IF _row.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('configured', true, 'enabled', false);
  END IF;
  RETURN jsonb_build_object(
    'configured', true, 'enabled', true,
    'connection_id', _row.connection_id, 'tenant_id', _row.tenant_id,
    'provider_key', _row.provider_key,
    'server_url', public.platform_decrypt(_row.server_url_ct),
    'auth_token', CASE WHEN _row.auth_token_ct IS NULL THEN NULL ELSE public.platform_decrypt(_row.auth_token_ct) END,
    'refresh_token', CASE WHEN _row.refresh_token_ct IS NULL THEN NULL ELSE public.platform_decrypt(_row.refresh_token_ct) END,
    'auth_kind', _row.auth_kind,
    'auth_header_name', _row.auth_header_name,
    'expires_at', _row.access_token_expires_at,
    'oauth_issuer', _row.oauth_issuer,
    'oauth_client_id', _row.oauth_client_id,
    'oauth_client_secret', CASE WHEN _row.oauth_client_secret_ct IS NULL THEN NULL ELSE public.platform_decrypt(_row.oauth_client_secret_ct) END,
    'transport', _row.transport,
    'granted_scopes', _row.granted_scopes
  );
END;
$$;
