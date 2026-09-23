-- Connected MCP Gateway — Slice ②: the connection-keyed OAuth GRANT WRITER.
--
-- WHY A NEW WRITER (and why NOT set_mcp_connection_endpoint). The OAuth authorization-code flow
-- completes at a provider redirect — a top-level browser GET to mcp-oauth-callback carrying ?code=&state=
-- and NO Supabase JWT (exactly like zoom-oauth-callback / tenant-n8n-oauth / paige-social-callback). The
-- two existing writers refuse that caller BY DESIGN:
--   • create_mcp_connection / set_mcp_connection_endpoint derive authority from auth.uid() through
--     _mcp_caller_capabilities; a NULL actor (service-role, no JWT) resolves to {} → MCP_FORBIDDEN
--     (INT-089, "the absence of a grant is never the guard, and a service-role caller gets no bypass").
-- So the callback — which HAS no auth.uid() — cannot persist a completed grant through either. Widening
-- either to accept a NULL-actor service-role caller would relax an authority gate every other caller
-- depends on (a §37 blast radius, a §59 "grant is not the guard" risk). §18 says ADD a narrowly-scoped
-- writer, don't widen a shared one.
--
-- HOW AUTHORITY IS ESTABLISHED WITHOUT A JWT (§9/§59). The callback never trusts a body-supplied
-- connection or tenant. It resolves them from a CONSUMED, single-use OAuth state (consume_mcp_oauth_state,
-- 20270332000000) that only an authenticated tenant admin could mint (begin_mcp_oauth is reached only via
-- the JWT-gated, admin-gated mcp-gateway `oauth_begin` action, and itself re-verifies the connection is in
-- the caller's tenant). The state is PKCE-bound and replay-proof (atomic consume). This writer then
-- RE-ENFORCES, in-body, that the connection actually belongs to the passed tenant — the EXECUTE grant
-- (service_role only) is never the guard (§59). It is the connection-keyed twin of the legacy
-- set_tenant_zapier_mcp_connection, for the provider-agnostic mcp_connections model.
--
-- THE _actor SURFACE (§59). This writer is keyed on _connection_id with a caller-supplied _actor, so the
-- actor is the second thing a caller could try to abuse. It is NEVER trusted as tenant-legitimate: the
-- sole caller (mcp-oauth-callback) has no authenticated user and passes NULL; a non-null _actor must be an
-- active member of the passed tenant or it is refused with the same uniform MCP_FORBIDDEN. Neither a
-- foreign connection nor a foreign actor can complete a grant.
--
-- DEPENDENCIES (all already live): mcp_connections (+ config_generation + trg_mcp_bump_config_generation,
-- 20270332000000), _mcp_assert_credential_bundle (the §18 one home for per-kind credential validation,
-- 20270332000000 version), platform_encrypt/decrypt. This migration adds ONE function; it drops/alters
-- nothing, so it is reversible (DROP FUNCTION) and carries no data risk.

CREATE OR REPLACE FUNCTION public.complete_mcp_oauth_grant(
  _connection_id           uuid,
  _tenant_id               uuid,
  _access_token            text,
  _refresh_token           text        DEFAULT NULL,
  _oauth_issuer            text        DEFAULT NULL,
  _oauth_client_id         text        DEFAULT NULL,
  _oauth_client_secret     text        DEFAULT NULL,
  _oauth_scopes            text[]      DEFAULT NULL,
  _access_token_expires_at timestamptz DEFAULT NULL,
  _actor                   uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conn         public.mcp_connections;
  _account_type text;
  _account_num  bigint;
BEGIN
  IF _connection_id IS NULL OR _tenant_id IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023';
  END IF;

  -- §9/§59: the connection this grant lands on must actually be in the passed tenant. The tenant came
  -- from a consumed single-use OAuth state, but this writer never trusts that alone — it proves it here.
  -- FOR UPDATE serializes against a concurrent INT-152 probe (which also locks the row), so the re-key
  -- and a verify cannot interleave a stale write. A missing/foreign row is MCP_FORBIDDEN — the same
  -- closed refusal begin_mcp_oauth uses; no cross-tenant oracle.
  SELECT * INTO _conn FROM public.mcp_connections
   WHERE connection_id = _connection_id FOR UPDATE;
  IF _conn.connection_id IS NULL OR _conn.tenant_id IS DISTINCT FROM _tenant_id THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;

  -- §59: the caller-supplied _actor is NEVER trusted as tenant-legitimate. A provider redirect has no
  -- authenticated user, so the sole caller (mcp-oauth-callback) passes _actor = NULL and this is skipped.
  -- But because the parameter EXISTS and is caller-supplied, a mismatched actor must not be able to buy
  -- attribution: when non-null it MUST be an active member of the passed tenant, else the same uniform
  -- MCP_FORBIDDEN. This closes the "caller-supplied _actor" surface the way the tenant check closes the
  -- connection surface — proven now (a future authenticated re-auth path may pass a real member).
  IF _actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members
     WHERE tenant_id = _tenant_id AND user_id = _actor AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: actor not a member of the tenant' USING ERRCODE = '42501';
  END IF;

  -- §18: validate the oauth bundle through the ONE home (the exact check create/set use). It REQUIRES
  -- an access token + issuer + client_id (F3 — the runtime has no refresh step, so a refresh-only grant
  -- loads unusable), REJECTS a custom header name (that is the 'header' scheme), and REJECTS an already
  -- EXPIRED access token. A freshly-exchanged token passes; a broken exchange can never persist an
  -- unusable grant. RAISEs a closed code (MCP_BAD_CREDENTIAL_BUNDLE / MCP_OAUTH_TOKEN_EXPIRED), never a
  -- value. scopes are optional-additional for oauth, so passing the granted set here is accepted.
  PERFORM public._mcp_assert_credential_bundle(
    'oauth', _access_token, NULL, _refresh_token,
    _oauth_issuer, _oauth_client_id, _oauth_client_secret, _oauth_scopes, _access_token_expires_at
  );

  -- Persist the grant: re-key to oauth, store the tokens ENCRYPTED, clear the header-scheme field, and
  -- reset to pending_verification/unknown so the already-shipped verify action probes the live endpoint
  -- with the new token (a granted token is not yet a proven connection). trg_mcp_bump_config_generation
  -- fires on this UPDATE (auth_kind / credentials / oauth-* / status→pending_verification all change),
  -- so any probe still in flight against the OLD config no-ops (INT-152) instead of clobbering this grant.
  -- oauth_scopes AND granted_scopes both record the granted set: what the connection actually holds
  -- (granted_scopes is what refreshTokens re-asserts; oauth_scopes is the config-identity record).
  UPDATE public.mcp_connections SET
    auth_kind               = 'oauth',
    auth_token_ct           = public.platform_encrypt(_access_token),
    refresh_token_ct        = CASE WHEN _refresh_token IS NULL OR btrim(_refresh_token) = '' THEN NULL
                                   ELSE public.platform_encrypt(_refresh_token) END,
    oauth_issuer            = _oauth_issuer,
    oauth_client_id         = _oauth_client_id,
    oauth_client_secret_ct  = CASE WHEN _oauth_client_secret IS NULL OR btrim(_oauth_client_secret) = '' THEN NULL
                                   ELSE public.platform_encrypt(_oauth_client_secret) END,
    oauth_scopes            = _oauth_scopes,
    granted_scopes          = _oauth_scopes,
    access_token_expires_at = _access_token_expires_at,
    auth_header_name        = NULL,
    status                  = 'pending_verification',
    health                  = 'unknown',
    last_error_code         = NULL,
    updated_at              = now()
  WHERE connection_id = _connection_id;

  -- Non-secret ROUTING facts for the callback's landing redirect (the just-connected tenant's own
  -- Connections page, resolved by resolveCanonicalAppPath). Returned here so the JWT-less callback needs
  -- only this one rpc — no second .from() read — keeping the callback fully headless-provable (§32). An
  -- address, never a grant (§9/§65): the mounted shell still resolves session + tenant server-side.
  SELECT account_type, account_number INTO _account_type, _account_num
    FROM public.tenants WHERE id = _tenant_id;

  RETURN jsonb_build_object(
    'connection_id', _connection_id,
    'status', 'pending_verification',
    'account_type', _account_type,
    'account_number', _account_num
  );
END;
$$;

-- service_role ONLY: the sole caller is the mcp-oauth-callback edge fn (no JWT; §59 body re-check IS the
-- authority, not this grant). No browser role may re-key a connection to a provider-minted credential.
REVOKE ALL ON FUNCTION public.complete_mcp_oauth_grant(uuid, uuid, text, text, text, text, text, text[], timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mcp_oauth_grant(uuid, uuid, text, text, text, text, text, text[], timestamptz, uuid) TO service_role;

COMMENT ON FUNCTION public.complete_mcp_oauth_grant(uuid, uuid, text, text, text, text, text, text[], timestamptz, uuid) IS
  'Slice ②: persist a completed OAuth grant onto a Connected MCP Gateway connection (connection-keyed '
  'twin of set_tenant_zapier_mcp_connection). service_role only; the JWT-less mcp-oauth-callback is the '
  'sole caller. §9/§59: re-verifies in-body (FOR UPDATE) that the connection is in the passed tenant — '
  'the tenant is taken from a consumed single-use OAuth state, never a body the callback trusts, and the '
  'EXECUTE grant is not the guard. Re-keys auth_kind->oauth, stores access/refresh/client-secret '
  'ENCRYPTED via platform_encrypt, records the granted scopes, and resets status->pending_verification '
  '(config_generation bumps via the trigger, so an in-flight probe of the old config no-ops). Validates '
  'the bundle through the one _mcp_assert_credential_bundle home; RAISEs closed codes only, never a value. '
  'Returns connection id + new status + the tenant''s account_type/account_number (non-secret routing '
  'facts) so the JWT-less callback resolves its landing redirect from this one rpc (no second read).';
