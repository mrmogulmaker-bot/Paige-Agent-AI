-- Put back the two fields a CREATE OR REPLACE quietly removed.
--
-- WHAT HAPPENED
--
-- 20261016 needed one change to `get_tenant_mcp_secret`: let a 'url' connection count as
-- configured. It made that change by copying the function body from 20261005 and editing
-- the guard -- but 20261008 had ALREADY extended the same function, adding
-- `approved_capabilities` and `capability_pins` to its return. Copying the older body and
-- replacing the function silently deleted both.
--
-- The result was worse than the bug being fixed. `call-zapier-action` reads those fields to
-- decide what a workspace has authorised; absent, they default to `[]` and `{}`, so EVERY
-- approved Zapier capability was refused as unapproved, and discovery rendered every tool
-- as never-approved. A migration written to make the connection usable made every governed
-- call on it fail.
--
-- THE LESSON, WRITTEN WHERE THE NEXT PERSON EDITS IT
--
-- `CREATE OR REPLACE FUNCTION` replaces the WHOLE body. Basing one on an older migration's
-- copy discards every change made in between, and nothing fails at apply time to say so:
-- the migration is valid SQL, the function exists, and the loss only shows up as behaviour.
-- Take the CURRENT definition (\sf, or pg_get_functiondef) as the base and edit that --
-- never an older file that happens to contain a version of it.
--
-- This function is now defined in one place per change, and every field any caller reads is
-- listed here explicitly.
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
  -- A 'url' connection's credential IS its address, so it needs no token or grant to be
  -- configured. Everything else needs one of the two.
  IF _row.tenant_id IS NULL OR _row.server_url_ct IS NULL
     OR (_row.auth_kind <> 'url'
         AND _row.auth_token_ct IS NULL AND _row.refresh_token_ct IS NULL) THEN
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
    'transport', _row.transport,
    -- Restored. What the workspace authorised, and the contract it authorised it against.
    -- Absent, the governed caller reads them as "nothing approved" and refuses everything.
    'approved_capabilities', COALESCE(_row.approved_capabilities, '[]'::jsonb),
    'capability_pins', COALESCE(_row.capability_pins, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_mcp_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_secret(uuid, text) TO service_role;
