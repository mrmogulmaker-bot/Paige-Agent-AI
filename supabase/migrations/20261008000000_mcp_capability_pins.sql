-- Schema pinning for approved capabilities.
--
-- WHY A NAME IS NOT ENOUGH
--
-- `approved_capabilities` records WHICH tools a workspace agreed Paige may run. It cannot
-- record WHAT it agreed to: a provider can change a tool's inputs at any time while
-- keeping its name. An approval granted to `send_email(to, subject, body)` is not an
-- approval of `send_email(to, subject, body, bcc, attachments)`, and nothing about the
-- name distinguishes them.
--
-- So each approved name is pinned to a fingerprint of the input schema it had when it was
-- approved. At call time the live schema is fingerprinted again and compared. A mismatch
-- is not a warning: the call does not happen.
--
-- WHY THE PIN IS SEPARATE FROM THE APPROVAL LIST
--
-- The approval list is the authorisation decision and stays a plain, auditable array of
-- names — readable at a glance, and impossible to misread. The pin is verification
-- material about those names. Keeping them apart means a pin can never silently widen
-- what was approved: a name absent from `approved_capabilities` is refused whatever the
-- pin says, and a name present with NO pin is refused too, because an unverified contract
-- is not a verified one.

ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS capability_pins jsonb NOT NULL DEFAULT '{}'::jsonb;

-- An object of name → hex digest. Enforced through a function because Postgres refuses a
-- subquery inside a CHECK and iterating the object needs one.
CREATE OR REPLACE FUNCTION public._mcp_is_capability_pin_map(_v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT jsonb_typeof(_v) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(_v) e
        WHERE jsonb_typeof(e.value) <> 'string'
           OR e.value #>> '{}' !~ '^[0-9a-f]{64}$'
           OR length(e.key) NOT BETWEEN 1 AND 200
     );
$$;

ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_capability_pins_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_capability_pins_chk
  CHECK (public._mcp_is_capability_pin_map(capability_pins));

COMMENT ON COLUMN public.tenant_mcp_connections.capability_pins IS
  'Approved capability name -> SHA-256 of the input schema it had at approval. A call '
  'whose live schema does not match its pin fails closed. A name with no pin is refused.';

-- ── Approve capabilities, with their pins, in one act ─────────────────────────
-- Approving a name and pinning its contract are the same decision and are written
-- together. Two calls would leave a window in which a name is approved with no pin —
-- which fails closed, so it is safe, but it is also a working integration that silently
-- stops, and that is a bug report nobody can explain.
CREATE OR REPLACE FUNCTION public.set_tenant_mcp_approved_capabilities(
  _provider     text,
  _capabilities text[],
  _tenant_id    uuid DEFAULT NULL,
  _pins         jsonb DEFAULT NULL
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
  _pinmap jsonb;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);

  SELECT COALESCE(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[]) INTO _clean
    FROM unnest(COALESCE(_capabilities, ARRAY[]::text[])) AS c
   WHERE btrim(c) <> '' AND length(c) <= 200;

  IF COALESCE(array_length(_clean, 1), 0) > 200 THEN
    RAISE EXCEPTION 'MCP_TOO_MANY_CAPABILITIES' USING ERRCODE = '22023';
  END IF;

  -- Only pins for names actually being approved are kept. A pin for anything else is
  -- dropped rather than stored, so the pin map can never describe a capability the
  -- workspace did not approve.
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO _pinmap
    FROM jsonb_each(COALESCE(_pins, '{}'::jsonb)) e
   WHERE e.key = ANY(_clean);

  UPDATE public.tenant_mcp_connections
     SET approved_capabilities = to_jsonb(_clean),
         capability_pins       = _pinmap,
         updated_at            = now(),
         updated_by            = auth.uid()
   WHERE tenant_id = _tenant AND provider = _p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP_NOT_CONNECTED: connect the provider before approving anything'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'provider', _p,
    'approved_count', COALESCE(array_length(_clean, 1), 0),
    -- Reported so a caller can see when it approved something it could not pin, rather
    -- than discovering it later as a capability that refuses to run.
    'pinned_count', (SELECT count(*) FROM jsonb_object_keys(_pinmap))
  );
END;
$$;

-- The old three-argument signature is replaced, not left beside the new one: two
-- overloads differing only in an optional argument is how a caller silently keeps using
-- the version that does not pin.
DROP FUNCTION IF EXISTS public.set_tenant_mcp_approved_capabilities(text, text[], uuid);

-- ── Both reads carry the pins ─────────────────────────────────────────────────
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
    'approved_capabilities', COALESCE(_row.approved_capabilities, '[]'::jsonb),
    'capability_pins', COALESCE(_row.capability_pins, '{}'::jsonb),
    'status', _row.status
  );
END;
$$;

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
           'approved_capabilities', COALESCE(c.approved_capabilities, '[]'::jsonb),
           -- The COUNT, not the digests. A workspace needs to know its approvals are
           -- pinned; the hashes themselves are verification material, not product state.
           'pinned_count', (SELECT count(*) FROM jsonb_object_keys(COALESCE(c.capability_pins, '{}'::jsonb)))
         )), '{}'::jsonb)
    INTO _out
    FROM public.tenant_mcp_connections c
   WHERE c.tenant_id = _tenant;
  RETURN _out;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.set_tenant_mcp_approved_capabilities(text, text[], uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_mcp_approved_capabilities(text, text[], uuid, jsonb) TO authenticated, service_role;
