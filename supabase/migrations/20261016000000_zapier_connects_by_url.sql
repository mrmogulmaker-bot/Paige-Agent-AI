-- Zapier connects with the URL Zapier actually hands its users.
--
-- WHAT WAS WRONG
--
-- 20261005 wrote `CHECK (provider = 'zapier' AND auth_kind = 'oauth')`, so the registry
-- would only ever hold a Zapier row obtained through an authorization grant. That is not
-- the artifact Zapier gives a user. A Zapier MCP server is a personal URL of the form
-- https://mcp.zapier.com/api/mcp/s/<secret>/mcp -- the secret is IN THE PATH, and requests
-- to it carry no Authorization header at all. The constraint therefore refused the only
-- credential the operator actually has, and the Zapier card could offer consent and
-- nothing else.
--
-- This WIDENS rather than replaces: an OAuth Zapier row is still valid and the consent
-- path is untouched (§58 -- nothing that worked stops working). No existing row can
-- violate a widened CHECK, so this cannot abort a deploy on a populated database.
--
-- WHY 'url' IS ITS OWN AUTH KIND
--
-- It is not 'bearer' with the token moved. The distinction is operational: for 'url' there
-- is no header to send, no token column to populate, and nothing to rotate independently of
-- the address. Calling it 'bearer' with a NULL token would make every consumer guess.
--
-- WHY THE SECRET IN THE PATH IS SAFE HERE
--
-- `server_url_ct` is encrypted at rest, and the browser-reachable read
-- (`get_tenant_mcp_connections`) returns only `server_url_host` -- scheme and host, cut by
-- regexp before it leaves the database. So the path, and therefore the secret, is never
-- exposed to a client. The URL-credentials guard below still rejects credentials in the
-- AUTHORITY (user:pass@host), which every hop would log; a path segment is not logged that
-- way and is the provider's own documented design.

ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_auth_kind_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_auth_kind_chk
  CHECK (auth_kind IN ('bearer', 'header', 'oauth', 'url'));

ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_provider_auth_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_provider_auth_chk CHECK (
    (provider = 'zapier' AND auth_kind IN ('oauth', 'url'))
    OR (provider = 'n8n' AND auth_kind IN ('bearer', 'header'))
  );

-- A 'url' row carries no separate credential. Stating it as a constraint keeps a
-- half-written row -- a URL kind that also stored a token -- from ever existing.
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_url_kind_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_url_kind_chk CHECK (
    auth_kind <> 'url' OR (auth_token_ct IS NULL AND auth_token_last4 IS NULL)
  );

-- Save a Zapier MCP server URL.
--
-- The host is pinned to Zapier's MCP host. This row is the Zapier slot: the surface that
-- writes it is labelled Zapier, the consumer that reads it is the Zapier action caller, and
-- an arbitrary address stored here would make both of those statements false. Pinning also
-- means the pasted secret can only ever be sent to Zapier.
CREATE OR REPLACE FUNCTION public.set_tenant_zapier_mcp_url_connection(
  _server_url text,
  _label      text DEFAULT NULL,
  _tenant_id  uuid DEFAULT NULL
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
  _host   text;
BEGIN
  IF _url = '' THEN RAISE EXCEPTION 'MCP_NO_URL: server URL is required' USING ERRCODE = '22023'; END IF;
  IF _url !~* '^https://' THEN
    RAISE EXCEPTION 'MCP_INSECURE_URL: server URL must be https://' USING ERRCODE = '22023';
  END IF;

  _host := lower(split_part(split_part(_url, '://', 2), '/', 1));

  -- Credentials in the AUTHORITY are rejected; the provider's own secret path segment is
  -- not the same thing and is what makes this connection work.
  IF _host ~ '@' THEN
    RAISE EXCEPTION 'MCP_URL_CREDENTIALS: remove the credentials from the URL' USING ERRCODE = '22023';
  END IF;
  IF _host <> 'mcp.zapier.com' THEN
    RAISE EXCEPTION 'MCP_NOT_ZAPIER: this is the Zapier connection; the address must be on mcp.zapier.com'
      USING ERRCODE = '22023';
  END IF;

  _tenant := public._mcp_resolve_tenant(_tenant_id, true);

  INSERT INTO public.tenant_mcp_connections
    (tenant_id, provider, label, server_url_ct, auth_token_ct, auth_token_last4,
     transport, auth_kind, auth_header_name, enabled, status, last_error,
     refresh_token_ct, access_token_expires_at, oauth_issuer, oauth_client_id,
     oauth_client_secret_ct, oauth_scopes,
     created_by, updated_by, updated_at)
  VALUES
    (_tenant, 'zapier', NULLIF(btrim(COALESCE(_label, '')), ''),
     public.platform_encrypt(_url), NULL, NULL,
     'http', 'url', NULL, true,
     -- Saved, not proven. Only a real probe may claim 'connected'.
     'pending_verification', NULL,
     NULL, NULL, NULL, NULL, NULL, NULL,
     _caller, _caller, now())
  ON CONFLICT (tenant_id, provider) DO UPDATE SET
    label                  = COALESCE(NULLIF(btrim(COALESCE(_label, '')), ''), public.tenant_mcp_connections.label),
    server_url_ct          = EXCLUDED.server_url_ct,
    auth_token_ct          = NULL,
    auth_token_last4       = NULL,
    transport              = 'http',
    auth_kind              = 'url',
    auth_header_name       = NULL,
    enabled                = true,
    status                 = 'pending_verification',
    last_error             = NULL,
    -- Switching from a grant to a pasted URL must not leave the old grant's material
    -- behind: it is no longer reachable, and a stale refresh token is a live credential
    -- nobody can see.
    refresh_token_ct       = NULL,
    access_token_expires_at = NULL,
    oauth_issuer           = NULL,
    oauth_client_id        = NULL,
    oauth_client_secret_ct = NULL,
    oauth_scopes           = NULL,
    updated_by             = EXCLUDED.updated_by,
    updated_at             = now();

  RETURN jsonb_build_object('ok', true, 'provider', 'zapier', 'status', 'pending_verification',
                            'auth_kind', 'url');
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_zapier_mcp_url_connection(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_zapier_mcp_url_connection(text, text, uuid) TO authenticated, service_role;

-- The secret read has to recognise a connection whose credential IS its address.
--
-- The previous guard treated "no auth token AND no refresh token" as unconfigured. That is
-- exactly the shape of a 'url' row, so a correctly saved Zapier URL connection would have
-- been reported `configured: false` and the action caller would have told the operator
-- nothing was connected -- with a row sitting right there. The guard now asks the question
-- it meant to ask: is there anything here we could authenticate WITH? For 'url' the answer
-- is the address itself.
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
    'transport', _row.transport
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_mcp_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_secret(uuid, text) TO service_role;
