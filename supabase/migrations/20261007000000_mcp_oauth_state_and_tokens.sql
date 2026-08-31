-- OAuth state and token storage for a tenant's MCP provider.
--
-- WHAT THIS IS FOR
--
-- An authorization-code flow leaves the server between the consent redirect and the
-- callback. Two things have to survive that gap without ever reaching the browser: the
-- PKCE verifier, which is the proof that the party redeeming the code is the party that
-- began the flow, and the `state`, which is what ties the callback back to a real request.
-- Both live here, encrypted and short-lived.
--
-- SINGLE USE IS ENFORCED IN SQL, NOT IN THE CALLER
--
-- `consume_tenant_mcp_oauth_state` marks the row consumed in the same statement that reads
-- it, so two simultaneous callbacks cannot both redeem one state. A check-then-update in
-- application code would leave exactly that race, and a replayed callback is the attack a
-- `state` exists to stop.
--
-- NO TOKEN PATH FROM A BROWSER. The token writers below are service-role only. A tenant
-- admin can start a flow and disconnect; they can never present a token to be stored,
-- because there is no grant under which that call would succeed.

-- ── 1. In-flight authorization requests ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_mcp_oauth_state (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  -- Unique, so a state can never be registered twice.
  state             text NOT NULL UNIQUE,
  -- The verifier is the proof of possession for the code. Never returned to a browser.
  code_verifier_ct  bytea NOT NULL,
  redirect_uri      text NOT NULL,
  issuer            text NOT NULL,
  resource          text NOT NULL,
  client_id         text NOT NULL,
  client_secret_ct  bytea,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Consent that takes longer than this is restarted rather than honoured. A long-lived
  -- authorization request is a long-lived opportunity to replay one.
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at       timestamptz,
  CONSTRAINT tenant_mcp_oauth_state_provider_chk CHECK (provider IN ('zapier', 'n8n'))
);

CREATE INDEX IF NOT EXISTS tenant_mcp_oauth_state_expiry_idx ON public.tenant_mcp_oauth_state (expires_at);
CREATE INDEX IF NOT EXISTS tenant_mcp_oauth_state_tenant_idx ON public.tenant_mcp_oauth_state (tenant_id, created_at DESC);

-- Unreadable by any browser session, whatever its role: it holds the verifier.
ALTER TABLE public.tenant_mcp_oauth_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_mcp_oauth_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_mcp_oauth_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_mcp_oauth_state TO service_role;

COMMENT ON TABLE public.tenant_mcp_oauth_state IS
  'One in-flight OAuth authorization request. Holds the PKCE verifier encrypted, expires '
  'in minutes, and is single-use — consumption is atomic in consume_tenant_mcp_oauth_state.';

-- ── 2. Begin a flow (service role: it is called after discovery and registration) ──
CREATE OR REPLACE FUNCTION public.begin_tenant_mcp_oauth(
  _tenant_id     uuid,
  _provider      text,
  _state         text,
  _verifier      text,
  _redirect_uri  text,
  _issuer        text,
  _resource      text,
  _client_id     text,
  _client_secret text DEFAULT NULL,
  _actor         uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _p text := public._mcp_check_provider(_provider);
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(_state), '') = '' OR COALESCE(btrim(_verifier), '') = '' THEN
    RAISE EXCEPTION 'MCP_OAUTH_BAD_REQUEST' USING ERRCODE = '22023';
  END IF;

  -- Only one flow at a time per tenant and provider. A second attempt replaces the first
  -- rather than leaving an older, still-redeemable state behind.
  DELETE FROM public.tenant_mcp_oauth_state
   WHERE tenant_id = _tenant_id AND provider = _p AND consumed_at IS NULL;

  -- Opportunistic cleanup of anything that has aged out anywhere. This table is small and
  -- write-rare, so it costs nothing and means an expired verifier does not sit at rest
  -- waiting for a retention job that does not exist yet.
  DELETE FROM public.tenant_mcp_oauth_state WHERE expires_at < now() - interval '1 hour';

  INSERT INTO public.tenant_mcp_oauth_state
    (tenant_id, provider, state, code_verifier_ct, redirect_uri, issuer, resource,
     client_id, client_secret_ct, created_by)
  VALUES
    (_tenant_id, _p, _state, public.platform_encrypt(_verifier), _redirect_uri, _issuer,
     _resource, _client_id,
     CASE WHEN _client_secret IS NULL OR _client_secret = '' THEN NULL
          ELSE public.platform_encrypt(_client_secret) END,
     _actor);
END;
$$;

-- ── 3. Redeem a state, exactly once ───────────────────────────────────────────
-- The UPDATE is the read. Two callbacks racing on one state: the first matches
-- `consumed_at IS NULL` and wins, the second matches nothing and gets `found=false`.
CREATE OR REPLACE FUNCTION public.consume_tenant_mcp_oauth_state(_state text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.tenant_mcp_oauth_state;
BEGIN
  UPDATE public.tenant_mcp_oauth_state
     SET consumed_at = now()
   WHERE state = _state
     AND consumed_at IS NULL
     AND expires_at > now()
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  RETURN jsonb_build_object(
    'found', true,
    'tenant_id', _row.tenant_id,
    'provider', _row.provider,
    'code_verifier', public.platform_decrypt(_row.code_verifier_ct),
    'redirect_uri', _row.redirect_uri,
    'issuer', _row.issuer,
    'resource', _row.resource,
    'client_id', _row.client_id,
    'client_secret', CASE WHEN _row.client_secret_ct IS NULL THEN NULL
                          ELSE public.platform_decrypt(_row.client_secret_ct) END
  );
END;
$$;

-- ── 4. Store a completed Zapier connection (service role only) ────────────────
-- Deliberately separate from the n8n setter: Zapier's credential is minted by an
-- authorization server, never pasted, and the registry's own CHECK refuses a Zapier row
-- whose auth_kind is anything but 'oauth'.
CREATE OR REPLACE FUNCTION public.set_tenant_zapier_mcp_connection(
  _tenant_id      uuid,
  _server_url     text,
  _access_token   text,
  _refresh_token  text,
  _expires_at     timestamptz,
  _issuer         text,
  _client_id      text,
  _client_secret  text DEFAULT NULL,
  _scopes         text[] DEFAULT NULL,
  _label          text DEFAULT NULL,
  _actor          uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(_server_url), '') = '' OR _server_url !~* '^https://' THEN
    RAISE EXCEPTION 'MCP_INSECURE_URL' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(_access_token), '') = '' THEN
    RAISE EXCEPTION 'MCP_NO_TOKEN' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_mcp_connections
    (tenant_id, provider, label, server_url_ct, auth_token_ct, auth_token_last4,
     refresh_token_ct, access_token_expires_at, oauth_issuer, oauth_client_id,
     oauth_client_secret_ct, oauth_scopes, transport, auth_kind, enabled, status,
     last_error, created_by, updated_by, updated_at)
  VALUES
    (_tenant_id, 'zapier', NULLIF(btrim(COALESCE(_label, '')), ''),
     public.platform_encrypt(_server_url), public.platform_encrypt(_access_token),
     right(_access_token, 4),
     CASE WHEN _refresh_token IS NULL OR _refresh_token = '' THEN NULL
          ELSE public.platform_encrypt(_refresh_token) END,
     _expires_at, _issuer, _client_id,
     CASE WHEN _client_secret IS NULL OR _client_secret = '' THEN NULL
          ELSE public.platform_encrypt(_client_secret) END,
     COALESCE(_scopes, ARRAY[]::text[]), 'http', 'oauth', true,
     -- A granted token is not a working connection. The probe still has to say so.
     'pending_verification', NULL, _actor, _actor, now())
  ON CONFLICT (tenant_id, provider) DO UPDATE SET
    label                  = COALESCE(NULLIF(btrim(COALESCE(_label, '')), ''), public.tenant_mcp_connections.label),
    server_url_ct          = EXCLUDED.server_url_ct,
    auth_token_ct          = EXCLUDED.auth_token_ct,
    auth_token_last4       = EXCLUDED.auth_token_last4,
    refresh_token_ct       = EXCLUDED.refresh_token_ct,
    access_token_expires_at= EXCLUDED.access_token_expires_at,
    oauth_issuer           = EXCLUDED.oauth_issuer,
    oauth_client_id        = EXCLUDED.oauth_client_id,
    oauth_client_secret_ct = EXCLUDED.oauth_client_secret_ct,
    oauth_scopes           = EXCLUDED.oauth_scopes,
    enabled                = true,
    status                 = 'pending_verification',
    last_error             = NULL,
    updated_by             = EXCLUDED.updated_by,
    updated_at             = now();

  RETURN jsonb_build_object('ok', true, 'provider', 'zapier', 'status', 'pending_verification');
END;
$$;

-- ── 5. Rotation (service role only) ───────────────────────────────────────────
-- A refresh that returns a new refresh token has killed the old one. Storing only the
-- access token would leave the connection working now and broken at the next refresh,
-- with nothing to point at when it happened.
CREATE OR REPLACE FUNCTION public.rotate_tenant_mcp_tokens(
  _tenant_id     uuid,
  _provider      text,
  _access_token  text,
  _refresh_token text DEFAULT NULL,
  _expires_at    timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _p text := public._mcp_check_provider(_provider);
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(_access_token), '') = '' THEN
    RAISE EXCEPTION 'MCP_NO_TOKEN' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tenant_mcp_connections SET
    auth_token_ct           = public.platform_encrypt(_access_token),
    auth_token_last4        = right(_access_token, 4),
    -- Only replaced when the server issued a new one; a server that does not rotate
    -- must not have its still-valid refresh token erased.
    refresh_token_ct        = CASE WHEN _refresh_token IS NULL OR _refresh_token = ''
                                   THEN refresh_token_ct
                                   ELSE public.platform_encrypt(_refresh_token) END,
    access_token_expires_at = COALESCE(_expires_at, access_token_expires_at),
    updated_at              = now()
  WHERE tenant_id = _tenant_id AND provider = _p;
END;
$$;

-- ── 6. Grants — anon never reaches any of these, and no browser writes a token ──
REVOKE ALL ON FUNCTION public.begin_tenant_mcp_oauth(uuid, text, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_tenant_mcp_oauth_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_tenant_zapier_mcp_connection(uuid, text, text, text, timestamptz, text, text, text, text[], text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_tenant_mcp_tokens(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_tenant_mcp_oauth(uuid, text, text, text, text, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_tenant_mcp_oauth_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_zapier_mcp_connection(uuid, text, text, text, timestamptz, text, text, text, text[], text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_tenant_mcp_tokens(uuid, text, text, text, timestamptz) TO service_role;
