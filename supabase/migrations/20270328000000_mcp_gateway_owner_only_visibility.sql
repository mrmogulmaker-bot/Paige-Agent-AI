-- ============================================================================
-- Connected MCP Gateway — owner_only visibility is caller-authority enforced (INT-082 / INT-089).
--
-- MCP PR-1B-c — one invariant only. Closes the owner_only visibility bypass: `mcp_connections.visibility`
-- ('tenant' | 'owner_only', migration 20270319000000) lets an owner mark a connection restricted, and
-- `get_mcp_connections_v2` HIDES an owner_only connection from an ordinary tenant member's list (its
-- `_full := auth.uid() IS NULL OR is_tenant_admin(_tenant) OR is_platform_owner()` gate). But the generic
-- runner resolves a connection BY ID and carries no caller role, so a member who learned an owner_only
-- connection's id could `prepare`/`execute` it — bypassing exactly what the list hides.
--
-- THE FIX (one new returned key, one new mapping function; enforcement lives in the runner, TS side):
--   • get_mcp_connection_secret now ALSO returns `visibility` — the row's owner-set visibility — so the
--     loader (connection.ts) can surface it and the runner can enforce it against the caller's authority.
--     Additive to the returned object; every existing key is byte-identical.
--   • _mcp_caller_capabilities(_tenant_id, _actor_user_id) → text[] — the ONE server-side mapping from a
--     caller to the MCP capabilities they hold (§18 one home). TODAY it grants
--     'mcp.connections.use_restricted' to owner + tenant-admin + platform owner (mirroring
--     get_mcp_connections_v2's `_full`). INT-089 (owner ruling 2026-09-20, "owners hire technical help"):
--     a future owner-granted DELEGATED role becomes able to use restricted connections by RE-POINTING
--     THIS FUNCTION alone — the runner and its enforcement point (which check for the CAPABILITY, never
--     a role literal) never change. No silent service-role bypass: a NULL actor holds NOTHING here (this
--     mapping deliberately DROPS get_mcp_connections_v2's `auth.uid() IS NULL → full` branch); the
--     headless/system path is an EXPLICIT authority carrying a reason, enforced in the runner.
--
-- get_mcp_connection_secret is CREATE OR REPLACE'd AGAIN here (4th time), so its body MUST carry BOTH
-- earlier changes: PR-1B-a's url exemption (INT-079, `auth_kind NOT IN ('none','url')` in the null-token
-- guard) AND PR-1B-b's `endpoint_hash` key (INT-078). The body below is byte-identical to
-- 20270327000000 EXCEPT the added `visibility` key. The existing pgTAPs prove both survived the replace:
-- mcp_gateway_url_auth_configured.sql (url exemption) and mcp_gateway_endpoint_load_binding.sql
-- (endpoint_hash) re-run against THIS body and must stay green.
--
-- NOTE: verify_mcp_connection_approval is UNCHANGED (INT-082 is visibility + caller authority, not
-- consent). visibility is NOT a consent facet — an owner_only connection is fully usable BY AN
-- AUTHORIZED CALLER, so it never gates configured/enabled/usable; the caller-authority check is the
-- runner's, on the returned `visibility`.
--
-- ROLLBACK (forward-only repo; the inverse for the record):
--   get_mcp_connection_secret: CREATE OR REPLACE with the `visibility` key removed (re-apply
--     20270327000000's body verbatim). _mcp_caller_capabilities: DROP FUNCTION. And revert the runner's
--     owner_only enforcement + connection.ts visibility surfacing. No data migration, no column change —
--     this migration replaces one function body and adds one function.
--
-- §9: get_mcp_connection_secret stays SECURITY DEFINER, service-role-reachable, tenant-agnostic (the
-- caller enforces tenant scope). _mcp_caller_capabilities is SECURITY DEFINER, service-role-only (the
-- resolver is called by trusted server code with a SERVER-RESOLVED actor — never a caller-supplied
-- identity from a request body, §588/§59), and takes an explicit `_actor_user_id` exactly like
-- is_tenant_admin_as / is_platform_owner(uuid). anon reaches NEITHER (satisfies lint:definer-fns with no
-- exempt escape). §58: nothing is removed — only a returned key and a mapping function are added, and the
-- owner_only gate is tightened, never loosened.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1. get_mcp_connection_secret — return the row's `visibility` (INT-082), carrying PR-1B-a's url
--    exemption (INT-079) AND PR-1B-b's `endpoint_hash` (INT-078). Body is byte-identical to
--    20270327000000 EXCEPT the added `visibility` key on the fully-configured return. The disabled /
--    unconfigured returns carry no `visibility` — the loader refuses those before it needs it, exactly
--    as with `endpoint_hash`.
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
    'granted_scopes', _row.granted_scopes,
    -- INT-082: the owner-set visibility ('tenant' | 'owner_only'). The runner enforces owner_only
    -- against the caller's authority; the loader normalizes anything but 'tenant' to owner_only (fail
    -- closed). NOT NULL column (20270319000000), so this is always one of the two values here.
    'visibility', _row.visibility
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. _mcp_caller_capabilities — the ONE server-side mapping from a caller to the MCP capabilities they
--    hold (§18). Owner + tenant-admin + platform owner hold 'mcp.connections.use_restricted' today,
--    mirroring get_mcp_connections_v2's `_full`. A delegated grant is added HERE (INT-089), not at the
--    runner. Explicit `_actor_user_id` (never auth.uid() / a request body) so the trusted server caller
--    passes a SERVER-RESOLVED actor — the is_tenant_admin_as / is_platform_owner(uuid) pattern.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_caller_capabilities(
  _tenant_id      uuid,
  _actor_user_id  uuid
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caps text[] := ARRAY[]::text[];
BEGIN
  -- No actor ⇒ no capability. INT-089: NO silent service-role bypass. get_mcp_connections_v2 grants
  -- `_full` when auth.uid() IS NULL (a trusted read); this mapping deliberately does NOT — a headless /
  -- system caller does not become "restricted-capable" merely by being service-role. The runner grants
  -- system use only via an EXPLICIT authority carrying a reason. So a NULL actor (and an ordinary
  -- member) holds nothing here.
  IF _actor_user_id IS NULL THEN
    RETURN _caps;
  END IF;
  -- Today's mapping = get_mcp_connections_v2's `_full` (minus the null-actor bypass): owner / admin of
  -- THIS tenant, or a platform owner (super_admin). THIS is the single re-pointable seam — add a
  -- delegated grant's predicate here and the runner honors it unchanged.
  IF public.is_tenant_admin_as(_actor_user_id, _tenant_id)
     OR public.is_platform_owner(_actor_user_id) THEN
    _caps := array_append(_caps, 'mcp.connections.use_restricted');
  END IF;
  RETURN _caps;
END;
$$;

COMMENT ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) IS
  'INT-082/INT-089: the single server-side mapping from a SERVER-RESOLVED caller (tenant + actor user id) to the MCP capabilities they hold. Today owner + tenant-admin + platform owner hold mcp.connections.use_restricted (mirrors get_mcp_connections_v2 _full, minus the null-actor bypass — no silent service-role grant). A future delegated grant is added HERE alone; the runner checks for the capability, never a role, so it needs no change. service_role-only; explicit _actor_user_id, never auth.uid() or a request body.';

REVOKE ALL ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) TO service_role;
