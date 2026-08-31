-- MCP capability policy + call evidence.
--
-- Two things the registry was missing, both of which the Chat boundary depends on.
--
-- 1. AN APPROVAL SET. A connection proves a workspace can reach a provider. It says
--    nothing about which of that provider's tools the workspace has agreed Paige may
--    run. Without that distinction, connecting a server silently grants every tool on
--    it. `approved_capabilities` is that decision, and it starts EMPTY — so connecting
--    a server grants nothing until someone approves something.
--
-- 2. AN EVIDENCE STORE. Provider output must not reach the model, but it must not be
--    thrown away either: an operator asking "what did it actually return?" deserves an
--    answer. The detail is written here, encrypted, tenant-scoped, and reachable only by
--    an opaque reference that encodes nothing.
--
-- Forward-only. Nothing here alters an existing row's meaning, and the default approval
-- set is empty, so every existing connection becomes deny-all rather than allow-all.

-- ── 1. The approval set ───────────────────────────────────────────────────────
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS approved_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;

-- An array of strings, and nothing else. A malformed value here would be read as an
-- authorisation decision, so the shape is enforced rather than assumed.
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_approved_caps_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_approved_caps_chk CHECK (
    jsonb_typeof(approved_capabilities) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(approved_capabilities) e
       WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') NOT BETWEEN 1 AND 200
    )
  );

COMMENT ON COLUMN public.tenant_mcp_connections.approved_capabilities IS
  'Tool names this workspace has approved for Paige to run. Empty means none: a '
  'connection is reachability, not authorisation. Read by the governed call path only.';

-- ── 2. The evidence store ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_mcp_call_evidence (
  -- The opaque reference itself. Random, and encodes nothing about the tenant, the
  -- provider or the capability, so holding one discloses nothing.
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  -- OUR approved identity for the capability, never the provider's echo of it.
  capability   text NOT NULL,
  status       text NOT NULL,
  -- The provider payload, encrypted at rest and credential-scrubbed before it arrives.
  payload_ct   bytea,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Provider output is not kept indefinitely. A retention job reads this; until one
  -- exists the column still bounds what any future reader should be willing to return.
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days',
  CONSTRAINT tenant_mcp_call_evidence_provider_chk CHECK (provider IN ('zapier', 'n8n')),
  CONSTRAINT tenant_mcp_call_evidence_status_chk CHECK (status IN ('ok', 'failed', 'denied', 'unavailable'))
);

CREATE INDEX IF NOT EXISTS tenant_mcp_call_evidence_tenant_idx
  ON public.tenant_mcp_call_evidence (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_mcp_call_evidence_expiry_idx
  ON public.tenant_mcp_call_evidence (expires_at);

-- RLS with NO permissive policy for `authenticated`: this table is unreadable by any
-- browser session, whatever its role. The only ways in are the service-role writer and
-- the admin-gated reader below, both of which re-enforce the tenant themselves.
ALTER TABLE public.tenant_mcp_call_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_mcp_call_evidence FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_mcp_call_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.tenant_mcp_call_evidence TO service_role;

COMMENT ON TABLE public.tenant_mcp_call_evidence IS
  'Detail of a governed MCP call, encrypted and tenant-scoped. Written by the call path, '
  'never returned to a model. Reachable only by its opaque id, through an admin-gated RPC.';

-- ── 3. Set the approval set (tenant admin) ────────────────────────────────────
-- Approving a capability is an authorisation decision, so it needs the same authority as
-- connecting the provider, and it is deliberately a separate act from connecting.
CREATE OR REPLACE FUNCTION public.set_tenant_mcp_approved_capabilities(
  _provider     text,
  _capabilities text[],
  _tenant_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _p      text := public._mcp_check_provider(_provider);
  _tenant uuid;
  _clean  text[];
BEGIN
  -- Admin required, tenant resolved from the caller. Same gate as connecting.
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);

  SELECT COALESCE(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[]) INTO _clean
    FROM unnest(COALESCE(_capabilities, ARRAY[]::text[])) AS c
   WHERE btrim(c) <> '' AND length(c) <= 200;

  IF array_length(_clean, 1) > 200 THEN
    RAISE EXCEPTION 'MCP_TOO_MANY_CAPABILITIES' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tenant_mcp_connections
     SET approved_capabilities = to_jsonb(_clean), updated_at = now(), updated_by = auth.uid()
   WHERE tenant_id = _tenant AND provider = _p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP_NOT_CONNECTED: connect the provider before approving anything'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('ok', true, 'provider', _p, 'approved_count', COALESCE(array_length(_clean, 1), 0));
END;
$$;

-- ── 4. Record one call's evidence (service role only) ─────────────────────────
CREATE OR REPLACE FUNCTION public.record_tenant_mcp_evidence(
  _tenant_id  uuid,
  _provider   text,
  _capability text,
  _status     text,
  _payload    text,
  _ref        uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _p text := public._mcp_check_provider(_provider); _id uuid;
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'MCP_NO_TENANT' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.tenant_mcp_call_evidence (id, tenant_id, provider, capability, status, payload_ct)
  VALUES (COALESCE(_ref, gen_random_uuid()), _tenant_id, _p, left(COALESCE(_capability, ''), 200), _status,
          CASE WHEN _payload IS NULL OR _payload = '' THEN NULL
               ELSE public.platform_encrypt(left(_payload, 16000)) END)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- ── 5. Read one evidence record (tenant admin, by reference) ──────────────────
-- The reference alone is not authority: the row's own tenant must still match the
-- caller's, so a reference that leaked to another workspace resolves to nothing.
CREATE OR REPLACE FUNCTION public.get_tenant_mcp_evidence(
  _ref       uuid,
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _row public.tenant_mcp_call_evidence;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);
  SELECT * INTO _row FROM public.tenant_mcp_call_evidence
   WHERE id = _ref AND tenant_id = _tenant;
  IF _row.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  IF _row.expires_at <= now() THEN
    -- Expired detail is not served, whether or not a retention job has removed it yet.
    RETURN jsonb_build_object('found', false, 'expired', true);
  END IF;
  RETURN jsonb_build_object(
    'found', true, 'provider', _row.provider, 'capability', _row.capability,
    'status', _row.status, 'created_at', _row.created_at,
    'payload', CASE WHEN _row.payload_ct IS NULL THEN NULL ELSE public.platform_decrypt(_row.payload_ct) END
  );
END;
$$;

-- ── 6. The secret read carries the approval set ───────────────────────────────
-- The governed call path needs the approval decision and the credential together, and
-- reading them in one place means the two can never be resolved for different tenants.
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
    'transport', _row.transport,
    -- Empty for every connection that predates this migration, which is the safe default.
    'approved_capabilities', COALESCE(_row.approved_capabilities, '[]'::jsonb),
    'status', _row.status
  );
END;
$$;

-- ── 7. The tenant's own status read shows what it has approved ────────────────
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
           'auth_token_last4', c.auth_token_last4,
           'enabled', c.enabled,
           'status', c.status,
           'expires_at', c.access_token_expires_at,
           'last_probed_at', c.last_probed_at,
           'server_url_host', CASE WHEN c.server_url_ct IS NOT NULL
             THEN split_part(split_part(public.platform_decrypt(c.server_url_ct), '://', 2), '/', 1)
             ELSE NULL END,
           'tool_count', CASE WHEN c.tools_cache IS NULL THEN NULL
                              ELSE jsonb_array_length(COALESCE(c.tools_cache -> 'tools', '[]'::jsonb)) END,
           -- These are the workspace's OWN approved names, so showing them back is
           -- showing it its own decision, not the provider's catalogue.
           'approved_capabilities', COALESCE(c.approved_capabilities, '[]'::jsonb)
         )), '{}'::jsonb)
    INTO _out
    FROM public.tenant_mcp_connections c
   WHERE c.tenant_id = _tenant;
  RETURN _out;
END;
$$;

-- ── 8. Grants — anon never reaches any of these ───────────────────────────────
REVOKE ALL ON FUNCTION public.set_tenant_mcp_approved_capabilities(text, text[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_tenant_mcp_evidence(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_mcp_evidence(uuid, uuid)                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_mcp_approved_capabilities(text, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_tenant_mcp_evidence(uuid, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_mcp_evidence(uuid, uuid)                TO authenticated, service_role;
