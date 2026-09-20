-- ============================================================================
-- Connected MCP Gateway — the endpoint setter (INT-099, MCP PR-2).
--
-- THE INVARIANT (one, this PR). A connection's endpoint and its credential are written in ONE
-- atomic UPDATE whose credential-bearing columns are ALWAYS sourced from the call arguments (a new
-- value, or NULL) and NEVER carried forward from the prior row. So a changed endpoint can never
-- inherit the old endpoint's secret: to keep a secret on a new endpoint the caller must re-supply it
-- (a deliberate re-attestation). `endpoint_hash` is DERIVED (public._mcp_endpoint_hash of the
-- DECRYPTED endpoint), so it recomputes automatically; the shipped AFTER-UPDATE trigger
-- `trg_mcp_gw_revoke_approvals_on_endpoint_change` (20270322000000) deletes the endpoint-bound
-- consent in the SAME transaction when the decrypted endpoint changes — this setter relies on it and
-- does not re-implement it. (A→B→A cannot resurrect A's approvals: A→B already deleted them.)
--
-- WHAT THIS PR IS NOT. It does NOT wire the gateway (still library-only, zero deployed importer), does
-- NOT probe/verify the endpoint (no outbound call — see below), does NOT register a paige_action_kind
-- or an autonomy lane (deferred to the wiring lane, INT-083), and does NOT create the native-connection
-- CREATE path — that is a separate, coordinator-numbered future PR. Until that PR lands there are NO
-- native (legacy_source IS NULL) rows, so this setter has no operable row on prod: it is
-- deployment-live but functionally inert, exactly like the rest of the PR-1B series. The RPC IS
-- directly JWT-invokable, which is why its authority gate + URL validation + tenant scope must be
-- correct on merge, not deferred to activation.
--
-- D1 — REFUSES a legacy-projected row (legacy_source IS NOT NULL). tenant_mcp_connections /
--      tenant_n8n_connections remain the sole LIVE write path (20270319000000 header); writing an
--      endpoint onto a projection would diverge it from its source of truth (§57). No cutover here.
--
-- A2 — Authority is the CAPABILITY `mcp.connections.manage`, resolved SERVER-SIDE for the connection's
--      own tenant via the single re-pointable mapping public._mcp_caller_capabilities (INT-089:
--      capability keys, never role literals; a delegated grant is added THERE alone). `manage` is held
--      by the OWNER / TENANT-ADMIN of THIS tenant ONLY — a platform owner is EXCLUDED from `manage`
--      (they keep `use_restricted` only). NOTE: public._mcp_resolve_tenant(_tenant, false) does NOT by
--      itself refuse a platform owner — it lets a platform owner target ANY _tenant_id and requires
--      only membership-or-platform-owner — so it SCOPES the tenant but is NOT the authority; the
--      capability gate is what refuses a platform owner who is not a tenant admin. Fail closed: a NULL
--      actor (service-role) holds `{}` and is refused (no silent service-role bypass, INT-089/A5).
--
-- A1 — Every successful change is durably recorded in the SAME transaction into the existing
--      public.paige_audit_log (the established config-change audit home — direct in-transaction INSERT,
--      as delete_conversation / grant_tenant_member_role do; there is no writer RPC). HASHES/ENUMS
--      ONLY: old + new endpoint_hash and auth_kind before + after — NEVER the URL, a token, or
--      ciphertext. If the audit INSERT fails, the whole function transaction aborts and the UPDATE does
--      NOT commit (plain in-transaction INSERT; no autonomous-transaction anywhere in the audit path).
--      (Honesty §13: paige_audit_log is not trigger-immutable and service_role retains UPDATE/DELETE —
--      A1 requires a durable RECORD, not DB-enforced immutability; none of the candidate homes provides
--      the latter today, and it would be a separate trigger on the existing table if ever required.)
--
-- A3 — Write-only. The RPC returns NO secret material and NO decrypted URL — only connection_id,
--      status, the new endpoint_hash, and auth_token_last4.
--
-- A4 — URL validation is STATIC (pure SQL, no network call): https only; rejects userinfo, localhost,
--      *.local / *.internal / *.localhost, trailing-dot hosts, loopback/private/link-local IPv4 and
--      IPv6 literals, IPv4-mapped IPv6 (::ffff:), and decimal / octal / hex-encoded IPv4 hosts.
--      HOSTNAME-TO-PRIVATE-IP RESOLUTION IS NOT COVERED AT WRITE TIME (SQL cannot resolve DNS) and
--      remains the job of _shared/mcp-client.ts's SSRF-guarded egress at DISPATCH. This validation is
--      an additional write-time layer, never a replacement for that runtime guard.
--
-- A5 — Grants: EXECUTE to `authenticated` ONLY (revoked from PUBLIC + anon). _mcp_caller_capabilities
--      stays service_role-only and is called from inside this SECURITY DEFINER function.
--
-- D2 — `mcp.connections.manage` scope: it authorizes CREATE, CONFIGURE and ROTATE of a connection
--      (this setter is its first consumer — configure/rotate the endpoint + credential). It EXCLUDES
--      DELETE, which gets its own capability key in a later PR.
--
-- D4 — HARD GATE (recorded here and in the decision-log): durable persistence of the runner's EXPLICIT
--      system-authority REASON on the canonical Rail (its own PR, not authorized yet) MUST land BEFORE
--      any system/headless authority path is wired. This setter has NO system path (D5): its authority
--      is the capability held by a real tenant-admin actor (auth.uid()), so no system reason arises here.
--
-- Carries INT-079's url exemption, INT-078's endpoint_hash and INT-082's visibility UNTOUCHED (this
-- migration does not redefine get_mcp_connection_secret). anon reaches none of the new surface.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public._mcp_endpoint_write_safe(text);
--   -- and restore public._mcp_caller_capabilities(uuid, uuid) to its 20270328000000 body (drop the
--   -- `mcp.connections.manage` branch; the mapping is additive, so removing that one append reverts it).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1. Static, write-time endpoint safety (A4). IMMUTABLE, pure — no auth, no I/O, no DNS. Defense in
--    depth ONLY; the authoritative runtime egress SSRF guard is _shared/mcp-client.ts at dispatch.
--    Returns TRUE only for an https endpoint whose host is not a known-unsafe literal/name.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_endpoint_write_safe(_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _hostport text;
  _host     text;
  _is_v6    boolean := false;
  _a int; _b int;
BEGIN
  -- https only (D6).
  IF _url IS NULL OR _url !~ '^https://' THEN RETURN false; END IF;
  -- No userinfo (https://user:pass@host…) — a common SSRF/credential smuggling shape.
  IF _url ~ '^https://[^/?#]*@' THEN RETURN false; END IF;

  -- host[:port] is everything after the scheme up to the first /, ? or #.
  _hostport := substring(_url from '^https://([^/?#]+)');
  IF _hostport IS NULL OR _hostport = '' THEN RETURN false; END IF;

  IF left(_hostport, 1) = '[' THEN
    -- bracketed IPv6 literal.
    _is_v6 := true;
    _host := substring(_hostport from '^\[([0-9A-Fa-f:.]+)\]');
    IF _host IS NULL OR _host = '' THEN RETURN false; END IF;
  ELSE
    -- A raw (unbracketed) IPv6 in a URL is malformed; more than one colon and not bracketed ⇒ reject.
    IF _hostport ~ ':.*:' THEN RETURN false; END IF;
    _host := split_part(_hostport, ':', 1);   -- strip :port
  END IF;
  _host := lower(_host);
  IF _host = '' THEN RETURN false; END IF;

  -- Name-based blocks.
  IF _host = 'localhost' THEN RETURN false; END IF;
  IF _host ~ '\.$' THEN RETURN false; END IF;                       -- trailing-dot host
  IF _host ~ '\.(local|internal|localhost)$' THEN RETURN false; END IF;

  IF _is_v6 THEN
    IF _host = '::1' OR _host = '::' THEN RETURN false; END IF;      -- loopback / unspecified
    IF _host ~ '^::ffff:' THEN RETURN false; END IF;                -- IPv4-mapped IPv6
    IF _host ~ '^f[cd]' THEN RETURN false; END IF;                  -- fc00::/7 unique-local
    IF _host ~ '^fe[89ab]' THEN RETURN false; END IF;               -- fe80::/10 link-local
    RETURN true;
  END IF;

  -- Encoded-IPv4 shapes (decimal / hex / octal) — reject rather than try to decode.
  IF _host ~ '^[0-9]+$' THEN RETURN false; END IF;                  -- bare decimal integer host
  IF _host ~ '0[xX]' THEN RETURN false; END IF;                     -- hex-encoded octet(s)
  IF _host ~ '(^|\.)0[0-9]' THEN RETURN false; END IF;             -- octal (leading-zero) octet

  -- Dotted-quad IPv4 literal: block loopback / private / link-local / unspecified.
  IF _host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN
    _a := split_part(_host, '.', 1)::int;
    _b := split_part(_host, '.', 2)::int;
    IF _a = 127 OR _a = 10 OR _a = 0 THEN RETURN false; END IF;     -- loopback / private / 0.0.0.0/8
    IF _a = 169 AND _b = 254 THEN RETURN false; END IF;            -- link-local incl. 169.254.169.254 metadata
    IF _a = 172 AND _b BETWEEN 16 AND 31 THEN RETURN false; END IF; -- 172.16/12
    IF _a = 192 AND _b = 168 THEN RETURN false; END IF;            -- 192.168/16
    RETURN true;
  END IF;

  -- A normal public https hostname.
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._mcp_endpoint_write_safe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mcp_endpoint_write_safe(text) TO authenticated, service_role;

COMMENT ON FUNCTION public._mcp_endpoint_write_safe(text) IS
  'INT-099/A4: static write-time SSRF/endpoint validation for the MCP gateway endpoint setter. https only; rejects userinfo, localhost, *.local/*.internal/*.localhost, trailing-dot hosts, loopback/private/link-local IPv4 and IPv6 literals, IPv4-mapped IPv6 (::ffff:), and decimal/octal/hex-encoded IPv4. IMMUTABLE, pure, NO DNS — defense in depth ONLY; the authoritative runtime egress guard is _shared/mcp-client.ts at dispatch (hostname→private-IP resolution is not covered here).';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. Extend the ONE capability mapping with `mcp.connections.manage` (A2/D2/INT-089). Same signature,
--    CREATE OR REPLACE. `use_restricted` is UNCHANGED (owner/admin/platform-owner). `manage` is added
--    for the OWNER / TENANT-ADMIN of THIS tenant ONLY — a platform owner is EXCLUDED. Append order is
--    fixed: use_restricted first, then manage (the pgTAP exact-equality assertions depend on it, D8).
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
  -- No actor ⇒ no capability. INT-089: NO silent service-role bypass (a NULL / headless actor holds
  -- nothing; system use is an EXPLICIT authority carrying a reason at the runner, never this mapping).
  IF _actor_user_id IS NULL THEN
    RETURN _caps;
  END IF;
  -- use_restricted (USE an owner_only connection) — owner / admin of THIS tenant, or a platform owner.
  -- UNCHANGED from INT-082. Appended FIRST.
  IF public.is_tenant_admin_as(_actor_user_id, _tenant_id)
     OR public.is_platform_owner(_actor_user_id) THEN
    _caps := array_append(_caps, 'mcp.connections.use_restricted');
  END IF;
  -- manage (CREATE / CONFIGURE / ROTATE a connection — NOT delete, which gets its own key later, D2) —
  -- owner / tenant-admin of THIS tenant ONLY. A platform owner is EXCLUDED (A2): platform authority is
  -- not tenant-management authority. A delegated grant is added HERE alone (INT-089). Appended SECOND.
  IF public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    _caps := array_append(_caps, 'mcp.connections.manage');
  END IF;
  RETURN _caps;
END;
$$;

COMMENT ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) IS
  'INT-082/INT-089/INT-099: the single server-side mapping from a SERVER-RESOLVED caller (tenant + actor user id) to the MCP capabilities they hold. mcp.connections.use_restricted (USE an owner_only connection) = owner + tenant-admin + platform owner (mirrors get_mcp_connections_v2 _full, minus the null-actor bypass). mcp.connections.manage (CREATE/CONFIGURE/ROTATE a connection; NOT delete) = owner + tenant-admin of THIS tenant ONLY — a platform owner is EXCLUDED (platform authority is not tenant-management authority, INT-099/A2). A future delegated grant is added HERE alone; consumers check for the capability, never a role. service_role-only; explicit _actor_user_id, never auth.uid() or a request body.';

REVOKE ALL ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 3. The endpoint setter. SECURITY DEFINER; the endpoint + FULL credential bundle are written in one
--    atomic UPDATE (the invariant), the change is audited in the SAME transaction (A1), and the return
--    is write-only (A3).
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_mcp_connection_endpoint(
  _connection_id           uuid,
  _server_url              text,
  _auth_kind               text,
  _auth_token              text        DEFAULT NULL,
  _auth_header_name        text        DEFAULT NULL,
  _refresh_token           text        DEFAULT NULL,
  _oauth_issuer            text        DEFAULT NULL,
  _oauth_client_id         text        DEFAULT NULL,
  _oauth_client_secret     text        DEFAULT NULL,
  _oauth_scopes            text[]      DEFAULT NULL,
  _access_token_expires_at timestamptz DEFAULT NULL,
  _tenant_id               uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conn      public.mcp_connections%ROWTYPE;
  _tenant    uuid;
  _old_hash  text;
  _new_hash  text;
  _new_last4 text;
BEGIN
  IF _connection_id IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023';
  END IF;

  -- Serialize on the connection and read its current state (for the old hash + old auth_kind audit).
  SELECT * INTO _conn FROM public.mcp_connections WHERE connection_id = _connection_id FOR UPDATE;
  IF _conn.connection_id IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023';
  END IF;

  -- D1: a legacy-projected row is owned by the legacy live path; never write its endpoint here (§57).
  IF _conn.legacy_source IS NOT NULL THEN
    RAISE EXCEPTION 'MCP_LEGACY_CONNECTION_READONLY: managed by the legacy connection path' USING ERRCODE = '42501';
  END IF;

  -- Tenant scope (server-side). _mcp_resolve_tenant(_tenant_id, false) resolves the caller's tenant and
  -- raises on a foreign tenant for a non-owner; the connection must live in the resolved tenant. NOTE
  -- (A2): a platform owner passes this scope for any tenant — it is NOT the authority; the capability
  -- gate below is.
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  IF _conn.tenant_id <> _tenant THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;

  -- Authority (A2/INT-089, fail closed): the manage capability for the connection's own tenant, actor =
  -- auth.uid() (server-derived, never a request body). A NULL actor (service-role) holds {} ⇒ refused
  -- (no service-role bypass); a platform owner who is not a tenant admin holds no `manage` ⇒ refused.
  IF NOT ('mcp.connections.manage' = ANY(public._mcp_caller_capabilities(_conn.tenant_id, auth.uid()))) THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: mcp.connections.manage capability required' USING ERRCODE = '42501';
  END IF;

  -- Shape validation.
  IF _auth_kind IS NULL OR _auth_kind NOT IN ('oauth','bearer','header','api_key','url','none') THEN
    RAISE EXCEPTION 'MCP_BAD_AUTH_KIND' USING ERRCODE = '22023';
  END IF;
  IF NOT public._mcp_endpoint_write_safe(_server_url) THEN
    RAISE EXCEPTION 'MCP_BAD_ENDPOINT' USING ERRCODE = '22023';   -- closed code; never echoes the URL
  END IF;

  -- Hashes (derived) for the audit + return. Old may be NULL for a never-configured native row.
  _old_hash  := CASE WHEN _conn.server_url_ct IS NULL THEN NULL
                     ELSE public._mcp_endpoint_hash(public.platform_decrypt(_conn.server_url_ct)) END;
  _new_hash  := public._mcp_endpoint_hash(_server_url);
  _new_last4 := CASE WHEN _auth_token IS NULL THEN NULL ELSE right(_auth_token, 4) END;

  -- THE INVARIANT: one atomic UPDATE; every credential-bearing column is set from the arguments (new
  -- value or NULL), NONE carried forward. A changed endpoint therefore cannot inherit the old secret.
  -- The AFTER-UPDATE trigger (20270322000000) deletes endpoint-bound approvals when the DECRYPTED
  -- endpoint changes. status/health reset because the new endpoint is unverified until a probe.
  UPDATE public.mcp_connections SET
    server_url_ct           = public.platform_encrypt(_server_url),
    auth_kind               = _auth_kind,
    auth_header_name        = _auth_header_name,
    auth_token_ct           = CASE WHEN _auth_token IS NULL THEN NULL ELSE public.platform_encrypt(_auth_token) END,
    auth_token_last4        = _new_last4,
    refresh_token_ct        = CASE WHEN _refresh_token IS NULL THEN NULL ELSE public.platform_encrypt(_refresh_token) END,
    oauth_issuer            = _oauth_issuer,
    oauth_client_id         = _oauth_client_id,
    oauth_client_secret_ct  = CASE WHEN _oauth_client_secret IS NULL THEN NULL ELSE public.platform_encrypt(_oauth_client_secret) END,
    oauth_scopes            = _oauth_scopes,
    granted_scopes          = '{}',                       -- the old grant ceiling is void on re-bind
    access_token_expires_at = _access_token_expires_at,
    status                  = 'pending_verification',
    health                  = 'unknown',
    last_error_code         = NULL,
    updated_by              = auth.uid(),
    updated_at              = now()
  WHERE connection_id = _connection_id;

  -- A1: durable audit in the SAME transaction — HASHES/ENUMS ONLY. A failure here aborts the txn, so
  -- the UPDATE above does not commit. actor_user_id = auth.uid() (a real tenant-admin: the capability
  -- gate refused a NULL actor), which also satisfies paige_audit_log's INSERT RLS as belt-and-suspenders.
  INSERT INTO public.paige_audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    auth.uid(), _conn.tenant_id, 'mcp_connection.endpoint_changed', 'mcp_connections', _connection_id,
    jsonb_build_object(
      'old_endpoint_hash', _old_hash,
      'new_endpoint_hash', _new_hash,
      'auth_kind_before',  _conn.auth_kind,
      'auth_kind_after',   _auth_kind
    )
  );

  -- A3: write-only return — no secret material, no decrypted URL.
  RETURN jsonb_build_object(
    'connection_id',    _connection_id,
    'status',           'pending_verification',
    'endpoint_hash',    _new_hash,
    'auth_token_last4', _new_last4
  );
END;
$$;

COMMENT ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) IS
  'INT-099 (MCP PR-2): the endpoint setter for the Connected MCP Gateway. Writes a connection''s endpoint + FULL credential bundle in one atomic UPDATE, sourcing every credential column from the arguments (never carrying the old ciphertext forward) so a changed endpoint can never inherit the old secret; the derived endpoint_hash recomputes and the 20270322000000 trigger revokes endpoint-bound consent on a real change. REFUSES a legacy-projected row (D1). Authority = the mcp.connections.manage capability for the connection''s tenant via _mcp_caller_capabilities (owner/tenant-admin only; platform owner EXCLUDED, A2), server-derived actor auth.uid(), fail closed, no service-role bypass. Records a hashes-only audit into paige_audit_log in the same transaction (A1). Returns only connection_id/status/endpoint_hash/auth_token_last4 (A3). Static https/SSRF URL validation only — runtime egress SSRF stays in mcp-client.ts (A4). EXECUTE to authenticated only (A5).';

REVOKE ALL ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) TO authenticated;
