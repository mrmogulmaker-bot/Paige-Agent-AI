-- ============================================================================
-- Connected MCP Gateway — consent is bound to the LOADED endpoint (INT-078).
--
-- MCP PR-1B-b — one invariant only. Closes the load↔verify TOCTOU (#1262 Codex R1 P1): the runner
-- VERIFIES consent by `connection_id` (verify_mcp_connection_approval) but DISPATCHES to the endpoint
-- the loader resolved (get_mcp_connection_secret). Today verify re-derives the connection's CURRENT
-- endpoint and checks the approval against THAT — but the loader may have resolved a DIFFERENT endpoint
-- a moment earlier (an in-flight re-point). So a session that LOADED endpoint A could be authorized by
-- an approval that matches the row's endpoint at verify time (B), and then dispatch to A — consent for
-- one endpoint authorizing a call to another. The delete-on-endpoint-change trigger (20270322000000)
-- and the writer's FOR UPDATE serialize the common case, but a load performed BEFORE a re-point that
-- verify sees AFTER it is a window the current binding does not close.
--
-- THE FIX (one new required input, one new check):
--   • get_mcp_connection_secret now ALSO returns `endpoint_hash` — the domain-tagged SHA-256 of the
--     SAME decrypted endpoint it returns as `server_url` (reusing the existing `_mcp_endpoint_hash`).
--     The loader surfaces it; the runner passes it to verify as the endpoint it will actually dispatch
--     to. Additive to the returned object; every existing key is byte-identical.
--   • verify_mcp_connection_approval gains `_loaded_endpoint_hash` as a REQUIRED (non-defaulted)
--     parameter. A NULL/empty value is refused (`loaded_endpoint_hash_required`) — a required guard
--     that is skippable is not a guard. The approved endpoint hash must equal the LOADED hash, else
--     `endpoint_load_mismatch`: consent is bound to the endpoint the runner will contact, not merely
--     the one the row happens to hold at verify time. The pre-existing CURRENT-endpoint re-derive stays
--     as defense in depth (`endpoint_changed`), so a row that drifted after the load is still caught.
--   The 4-arg signature is DROPPED (its sole caller, consent.ts, moves to the new signature in this
--   same PR; §37 producer inventory found no other real caller — only the durable-consent pgTAP, also
--   updated here). `_args_shape_hash` moves to the 5th (still-defaulted) position so the new required
--   parameter is not preceded by a defaulted one.
--
-- get_mcp_connection_secret is CREATE OR REPLACE'd AGAIN here, so its body MUST carry PR-1B-a's url
-- exemption (INT-079, migration 20270326000000): `auth_kind NOT IN ('none','url')` in the null-token
-- guard, so a Zapier credential-in-URL row (both token columns null) stays `configured:true`. The
-- PR-1B-a pgTAP (mcp_gateway_url_auth_configured.sql) re-runs against THIS body and must stay green —
-- that is the proof the exemption survived the replace.
--
-- ROLLBACK (forward-only repo; the inverse for the record):
--   get_mcp_connection_secret: CREATE OR REPLACE with the `endpoint_hash` key removed (re-apply
--     20270326000000's body verbatim).
--   verify_mcp_connection_approval: DROP the 5-arg signature and CREATE OR REPLACE the 4-arg body
--     from 20270323000000 verbatim, re-issuing its REVOKE/GRANT; and revert consent.ts to the 4-arg
--     call. No data migration, no column change — this migration only replaces two function bodies.
--
-- §9: unchanged. get_mcp_connection_secret stays SECURITY DEFINER, service-role-reachable, tenant-
-- agnostic (the caller enforces tenant scope). verify_mcp_connection_approval stays service-role-only.
-- `_mcp_endpoint_hash` (20270323000000) is unchanged and reused. anon reaches NEITHER (satisfies
-- lint:definer-fns with no exempt escape). §58: nothing is removed — only a returned key and a
-- required parameter are added, and the endpoint binding is tightened, never loosened.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1. get_mcp_connection_secret — return the loaded endpoint's hash (INT-078), carrying PR-1B-a's url
--    exemption (INT-079). Body is byte-identical to 20270326000000 EXCEPT the added `endpoint_hash`
--    key on the fully-configured return. `server_url_ct` is guaranteed non-null on that path (the
--    guard returns configured:false when it is null), so the decrypt+hash is safe. The disabled
--    return ({configured:true, enabled:false}) carries no endpoint_hash — the loader refuses a
--    disabled connection before it needs one.
-- ─────────────────────────────────────────────────────────────────────────────────
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
    -- INT-078: the domain-tagged hash of the SAME decrypted endpoint returned above, so the runner can
    -- bind consent to the endpoint it will actually dispatch to (verify re-derives the identical hash).
    'endpoint_hash', public._mcp_endpoint_hash(public.platform_decrypt(_row.server_url_ct)),
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

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. verify_mcp_connection_approval — bind consent to the LOADED endpoint (INT-078). DROP the 4-arg
--    signature and CREATE the 5-arg one with `_loaded_endpoint_hash` required (4th position, before the
--    defaulted `_args_shape_hash`). §37: the only real callers of the old signature are consent.ts and
--    the durable-consent pgTAP — both move to the new signature in this PR; no view/trigger/function
--    depends on it, so the DROP is safe.
-- ─────────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.verify_mcp_connection_approval(uuid, text, text, text);
CREATE FUNCTION public.verify_mcp_connection_approval(
  _connection_id       uuid,
  _tool_name           text,
  _live_pin            text,
  _loaded_endpoint_hash text,
  _args_shape_hash     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conn public.mcp_connections;
  _appr public.mcp_connection_approvals;
  _current_endpoint_hash text;
BEGIN
  -- INT-078: the endpoint the runner LOADED (and will dispatch to) is REQUIRED. A NULL/empty value
  -- would make the load-binding guard below skippable, so refuse up front (a required parameter the
  -- body also enforces — Postgres cannot mark a middle parameter NOT NULL, and a defaulted-away guard
  -- is not a guard).
  IF _loaded_endpoint_hash IS NULL OR _loaded_endpoint_hash = '' THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'loaded_endpoint_hash_required');
  END IF;

  SELECT * INTO _conn FROM public.mcp_connections WHERE connection_id = _connection_id;
  IF _conn.connection_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'no_connection');
  END IF;
  IF _conn.server_url_ct IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'endpoint_missing');
  END IF;

  SELECT * INTO _appr FROM public.mcp_connection_approvals
   WHERE connection_id = _connection_id AND tool_name = _tool_name;
  IF _appr.connection_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'approval_required');
  END IF;
  -- The fingerprint the approval was recorded at must equal the tool's LIVE fingerprint.
  IF _appr.pin IS DISTINCT FROM _live_pin THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'contract_changed');
  END IF;
  -- A pre-Phase-C approval with no endpoint binding cannot authorize live execution (fail-closed).
  -- Checked BEFORE the load-binding compare so a NULL binding reports its own precise reason rather
  -- than a mismatch against the loaded hash.
  IF _appr.endpoint_hash IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'approval_not_endpoint_bound');
  END IF;
  -- INT-078 CORE: consent is bound to a specific endpoint identity; the endpoint the runner LOADED
  -- (what it will actually contact) must be THAT endpoint. This closes the load↔verify TOCTOU — even
  -- when the row's CURRENT endpoint still matches the approval, a session that loaded a different
  -- endpoint is refused rather than authorized against the endpoint it never resolved.
  IF _appr.endpoint_hash IS DISTINCT FROM _loaded_endpoint_hash THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'endpoint_load_mismatch');
  END IF;
  -- Defense in depth (retained from 20270323000000): the connection's endpoint AS IT IS NOW must also
  -- still match the approval. The 20270322000000 trigger normally deletes an approval on an endpoint
  -- change; this catches any that survived and any drift between load and verify.
  _current_endpoint_hash := public._mcp_endpoint_hash(public.platform_decrypt(_conn.server_url_ct));
  IF _appr.endpoint_hash IS DISTINCT FROM _current_endpoint_hash THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'endpoint_changed');
  END IF;
  IF _appr.expires_at IS NOT NULL AND _appr.expires_at <= now() THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'approval_expired');
  END IF;
  -- Action-shape binding is enforced ONLY when the approval carries one (optional, "as appropriate").
  IF _appr.args_shape_hash IS NOT NULL AND _appr.args_shape_hash IS DISTINCT FROM _args_shape_hash THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'action_shape_changed');
  END IF;

  RETURN jsonb_build_object('authorized', true, 'reason', 'authorized');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 3. Comments + grants for the new verify signature. get_mcp_connection_secret keeps its existing
--    grants (CREATE OR REPLACE preserves them). anon reaches neither function.
-- ─────────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.verify_mcp_connection_approval(uuid, text, text, text, text) IS
  'Phase C durable consent SPEND for the Connected MCP Gateway (INT-078: endpoint-load bound). Authorizes a tool run ONLY when a stored mcp_connection_approvals row still matches the tool''s live fingerprint (pin), the connection''s current DECRYPTED endpoint identity, AND the endpoint the runner actually LOADED (_loaded_endpoint_hash, required — closes the load/verify TOCTOU), the optional approved action shape, and is unexpired. The runner passes the loaded endpoint hash from get_mcp_connection_secret, so consent is bound to the endpoint it will dispatch to, not merely the one the row holds at verify time. service_role-only; returns a closed-vocabulary reason, never provider text.';

REVOKE ALL ON FUNCTION public.verify_mcp_connection_approval(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mcp_connection_approval(uuid, text, text, text, text) TO service_role;
