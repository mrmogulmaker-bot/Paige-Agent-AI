-- Connected MCP Gateway — Slice ② foundation: OAuth-state store + two hardenings.
--
-- THREE things ride this ONE migration (Slice ② coordinator condition, 2026-09-23):
--
--   A. OAUTH-STATE STORE (connection_id-keyed) — the durable, single-use, short-lived home for an
--      in-flight authorization-code flow's PKCE verifier + `state`, mirroring the legacy
--      tenant_mcp_oauth_state (20261007000000) but keyed by the NEW model's `connection_id` (a
--      tenant may hold many connections to the same provider, so the legacy (tenant, provider) key
--      cannot address them). No provider CHECK — the new model is provider-agnostic. It references
--      NO storage bucket, so the coordinator's "create the bucket row in the migration" is N/A here.
--
--   B. INT-152 — probe TOCTOU config-generation compare-and-write. mcp_connection_probe is the ONLY
--      writer of status='connected'/health='healthy' + the tool catalog, and today it is keyed by
--      connection_id ALONE. If set_mcp_connection_endpoint rotates the endpoint OR the credential
--      while a tools/list is in flight, a STALE success can clobber the freshly-rotated config back
--      to connected/healthy and repopulate a catalog for an endpoint that no longer exists. We add a
--      monotonic `config_generation` that a BEFORE-UPDATE trigger bumps on EVERY config-identity
--      change (endpoint, ANY credential column, auth_kind/header, oauth-* , or a status reset to
--      pending_verification/unconfigured), and gate the probe write on the generation the verifier
--      LOADED. endpoint_hash alone (INT-078) could not do this: a SAME-URL credential rotation leaves
--      endpoint_hash unchanged, so only a generation that moves on the credential too closes it.
--
--   C. INT-153 — writer minimum credential length, the sound completion of verify.ts's credential-
--      reflection scanner floor. That scanner (MIN_SECRET_SCAN_LEN=12) only scans a bearer/header
--      token for reflection when it is >=12 chars — a shorter token could be echoed by a hostile
--      server into the plaintext catalog and slip UNDER the floor. Guaranteeing the WRITER never
--      stores a bearer/header credential shorter than that floor makes the floor complete. Scoped to
--      the exact kinds the scanner scans (bearer + header); oauth tokens are provider-minted and are
--      NOT scanned, url embeds its secret in the endpoint (no single "token" column), none has none.
--
-- Every credential is encrypted at rest via platform_encrypt/decrypt (never raw). Every new function
-- is service_role-only where it decrypts, and no browser role can write a token. §9/§59: the DEFINER
-- bodies re-enforce caller scope in-body; the EXECUTE grant is never the guard.

-- ═══════════════════════════════════════════════════════════════════════════════════
-- A. OAUTH-STATE STORE (connection_id-keyed) — mirrors 20261007000000, provider-agnostic.
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mcp_connection_oauth_state (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The connection this flow is completing. CASCADE so a deleted connection cannot leave an
  -- orphaned, still-redeemable verifier at rest.
  connection_id     uuid NOT NULL REFERENCES public.mcp_connections(connection_id) ON DELETE CASCADE,
  -- Carried explicitly for the §9 tenant scope of begin/consume and the one-flow-per-connection
  -- replace. CASCADE mirrors the registry.
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Unique, so a state can never be registered twice (replay defense the `state` exists for).
  state             text NOT NULL UNIQUE,
  -- The PKCE verifier — proof of possession for the code. Encrypted; NEVER returned to a browser.
  code_verifier_ct  bytea NOT NULL,
  redirect_uri      text NOT NULL,
  -- From authorization-server discovery — always present when OAuth is used.
  issuer            text NOT NULL,
  -- From protected-resource discovery (RFC 9728 / the RFC 8707 resource indicator). A generic MCP
  -- server that advertises only an authorization server and no separate protected-resource document
  -- is a REACHABLE state, so this is nullable (audited: the CHECK-reachability condition).
  resource          text,
  -- After dynamic client registration (or a pre-registered client) — always present.
  client_id         text NOT NULL,
  -- Public clients (token_endpoint_auth_method=none, the DCR default) have no secret → nullable.
  client_secret_ct  bytea,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Consent slower than this is restarted, not honoured: a long-lived request is a long-lived
  -- replay opportunity.
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS mcp_connection_oauth_state_expiry_idx
  ON public.mcp_connection_oauth_state (expires_at);
CREATE INDEX IF NOT EXISTS mcp_connection_oauth_state_conn_idx
  ON public.mcp_connection_oauth_state (connection_id, created_at DESC);

-- Unreadable by any browser session, whatever its role — it holds the verifier.
ALTER TABLE public.mcp_connection_oauth_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_connection_oauth_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mcp_connection_oauth_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mcp_connection_oauth_state TO service_role;

COMMENT ON TABLE public.mcp_connection_oauth_state IS
  'Slice ②: one in-flight OAuth authorization request for a Connected MCP Gateway connection '
  '(connection_id-keyed twin of tenant_mcp_oauth_state). Holds the PKCE verifier encrypted, expires '
  'in minutes, single-use (consumption is atomic in consume_mcp_oauth_state). service_role only; no '
  'browser role reads the verifier. No provider CHECK — the model is provider-agnostic.';

-- Begin a flow. service_role only (called by the gateway edge fn AFTER discovery + registration).
-- §9/§59: re-verifies in-body that the connection belongs to the passed tenant; the EXECUTE grant is
-- not the guard.
CREATE OR REPLACE FUNCTION public.begin_mcp_oauth(
  _connection_id uuid,
  _tenant_id     uuid,
  _state         text,
  _verifier      text,
  _redirect_uri  text,
  _issuer        text,
  _resource      text DEFAULT NULL,
  _client_id     text DEFAULT NULL,
  _client_secret text DEFAULT NULL,
  _actor         uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _conn_tenant uuid;
BEGIN
  IF _connection_id IS NULL OR _tenant_id IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(_state), '') = '' OR COALESCE(btrim(_verifier), '') = ''
     OR COALESCE(btrim(_redirect_uri), '') = '' OR COALESCE(btrim(_issuer), '') = ''
     OR COALESCE(btrim(_client_id), '') = '' THEN
    RAISE EXCEPTION 'MCP_OAUTH_BAD_REQUEST' USING ERRCODE = '22023';
  END IF;

  -- §9/§59: the flow may only be started for a connection that is actually in the passed tenant.
  SELECT tenant_id INTO _conn_tenant FROM public.mcp_connections WHERE connection_id = _connection_id;
  IF _conn_tenant IS NULL OR _conn_tenant <> _tenant_id THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;

  -- Only one un-consumed flow at a time per connection. A second attempt replaces the first rather
  -- than leaving an older, still-redeemable state behind.
  DELETE FROM public.mcp_connection_oauth_state
   WHERE connection_id = _connection_id AND consumed_at IS NULL;

  -- Opportunistic cleanup of anything aged out anywhere. This table is small and write-rare, so an
  -- expired verifier does not sit at rest waiting for a retention job that does not exist yet.
  DELETE FROM public.mcp_connection_oauth_state WHERE expires_at < now() - interval '1 hour';

  INSERT INTO public.mcp_connection_oauth_state
    (connection_id, tenant_id, state, code_verifier_ct, redirect_uri, issuer, resource,
     client_id, client_secret_ct, created_by)
  VALUES
    (_connection_id, _tenant_id, _state, public.platform_encrypt(_verifier), _redirect_uri, _issuer,
     NULLIF(btrim(COALESCE(_resource, '')), ''), _client_id,
     CASE WHEN _client_secret IS NULL OR _client_secret = '' THEN NULL
          ELSE public.platform_encrypt(_client_secret) END,
     _actor);
END;
$$;

-- Redeem a state, exactly once. The UPDATE is the read: two callbacks racing on one state — the
-- first matches consumed_at IS NULL and wins, the second matches nothing and gets found=false. A
-- check-then-update in application code would leave exactly that race, and a replayed callback is the
-- attack a `state` exists to stop.
CREATE OR REPLACE FUNCTION public.consume_mcp_oauth_state(_state text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.mcp_connection_oauth_state;
BEGIN
  UPDATE public.mcp_connection_oauth_state
     SET consumed_at = now()
   WHERE state = _state
     AND consumed_at IS NULL
     AND expires_at > now()
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  RETURN jsonb_build_object(
    'found', true,
    -- Returned so the caller compares it in constant time rather than trusting that a lookup keyed on
    -- it is the same guarantee. It is the value the caller already sent.
    'state', _row.state,
    'connection_id', _row.connection_id,
    'tenant_id', _row.tenant_id,
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

REVOKE ALL ON FUNCTION public.begin_mcp_oauth(uuid, uuid, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_mcp_oauth_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_mcp_oauth(uuid, uuid, text, text, text, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_mcp_oauth_state(text) TO service_role;

COMMENT ON FUNCTION public.begin_mcp_oauth(uuid, uuid, text, text, text, text, text, text, text, uuid) IS
  'Slice ②: start an OAuth authorization-code flow for a Connected MCP Gateway connection. service_role '
  'only; §9/§59 re-verifies in-body that the connection is in the passed tenant (EXECUTE grant is not '
  'the guard). Replaces any prior un-consumed flow for the connection, opportunistically prunes aged-out '
  'rows, and stores the PKCE verifier + optional client secret ENCRYPTED. Closed codes only.';
COMMENT ON FUNCTION public.consume_mcp_oauth_state(text) IS
  'Slice ②: redeem an OAuth state exactly once (atomic consume in the same UPDATE that reads it — the '
  'replay guard). Returns found:false for an unknown/expired/already-consumed state; otherwise the '
  'decrypted verifier + flow context for the token exchange. service_role only.';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- B. INT-152 — config_generation compare-and-write (probe TOCTOU).
-- ═══════════════════════════════════════════════════════════════════════════════════

-- 1. The monotonic generation. Existing rows all become generation 1 (their current config is the
--    first). New rows start at 1 by DEFAULT.
ALTER TABLE public.mcp_connections
  ADD COLUMN IF NOT EXISTS config_generation bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.mcp_connections.config_generation IS
  'INT-152: monotonic counter bumped by trg_mcp_bump_config_generation on any config-IDENTITY change '
  '(endpoint, any credential column, auth_kind/header, oauth-*, or a status reset to '
  'pending_verification/unconfigured). mcp_connection_probe writes status=connected/tools ONLY when '
  'the generation the verifier loaded still matches — a stale in-flight success cannot clobber a '
  'config that was rotated mid-verify (a same-URL credential rotation endpoint_hash alone would miss).';

-- 2. The bump trigger — the ONE home (§18) for the "generation moves on config change" invariant, so
--    no writer body has to be reproduced to add a bump line. Fires BEFORE UPDATE; sets NEW only when a
--    config-identity column actually changed (IS DISTINCT FROM handles NULLs) or the status was reset
--    to a re-verification-required state. Deliberately EXCLUDED: a probe result write (status ->
--    connected/error/checking, health, last_checked_at, last_error_code) — those are OUTCOMES of a
--    verify, not config changes, so they never bump (verified in the proof). `enabled`/`label` edits
--    do not bump either; a real disable goes through disconnect_mcp_connection which sets
--    status='unconfigured' (which DOES bump).
CREATE OR REPLACE FUNCTION public._mcp_bump_config_generation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.server_url_ct           IS DISTINCT FROM OLD.server_url_ct
     OR NEW.auth_token_ct        IS DISTINCT FROM OLD.auth_token_ct
     OR NEW.refresh_token_ct     IS DISTINCT FROM OLD.refresh_token_ct
     OR NEW.oauth_client_secret_ct IS DISTINCT FROM OLD.oauth_client_secret_ct
     OR NEW.auth_kind            IS DISTINCT FROM OLD.auth_kind
     OR NEW.auth_header_name     IS DISTINCT FROM OLD.auth_header_name
     OR NEW.oauth_issuer         IS DISTINCT FROM OLD.oauth_issuer
     OR NEW.oauth_client_id      IS DISTINCT FROM OLD.oauth_client_id
     OR NEW.oauth_scopes         IS DISTINCT FROM OLD.oauth_scopes
     OR NEW.access_token_expires_at IS DISTINCT FROM OLD.access_token_expires_at
     OR (NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status IN ('pending_verification', 'unconfigured'))
  THEN
    NEW.config_generation := OLD.config_generation + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcp_bump_config_generation ON public.mcp_connections;
CREATE TRIGGER trg_mcp_bump_config_generation
  BEFORE UPDATE ON public.mcp_connections
  FOR EACH ROW EXECUTE FUNCTION public._mcp_bump_config_generation();

COMMENT ON FUNCTION public._mcp_bump_config_generation() IS
  'INT-152: BEFORE-UPDATE trigger fn on mcp_connections. Bumps config_generation on any config-IDENTITY '
  'change (endpoint / any credential / auth_kind / header name / oauth-* / scopes / access-token expiry) '
  'or a status reset to pending_verification/unconfigured. Probe result writes (connected/error/health) '
  'and label/enabled edits do NOT bump. The §18 one home for the generation invariant — no writer body '
  'is edited to maintain it.';

-- 3. get_mcp_connection_secret — body IDENTICAL to the LIVE 20270328000000 (INT-082 owner_only, the 4th
--    replace — carries INT-079 url-exemption + INT-078 endpoint_hash + INT-082 `visibility`) EXCEPT it
--    ALSO returns config_generation, so the runtime loader carries the generation it read for the probe
--    compare. §58: every prior return key (endpoint_hash, visibility) is preserved byte-for-byte — the
--    peer-gate caught an earlier draft based on 20270327 that would have dropped `visibility`.
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
    'visibility', _row.visibility,
    -- INT-152: the generation the loader read — the runner passes it to mcp_connection_probe so a
    -- write is refused if the config was rotated after this load. NOT NULL column, always present here.
    'config_generation', _row.config_generation
  );
END;
$$;

-- 4. mcp_connection_probe — DROP the 5-arg signature and re-create with a 6th `_expected_generation`
--    (DEFAULT NULL) AND a jsonb return (was void). Both existing call shapes still bind to the one
--    remaining function with _expected_generation defaulted NULL: verify.ts's 5 NAMED args and the
--    pgTAP's 5 POSITIONAL args (PERFORM discards the jsonb). It is COMPARE-AND-WRITE: the current
--    generation is read under FOR UPDATE (serializing against a concurrent re-key, which also locks the
--    row), and when the caller carries the generation it LOADED, the write applies ONLY if the row
--    still bears it. A stale probe (endpoint/credential rotated out from under it while tools/list was
--    in flight) is a NO-OP returning {applied:false, reason:'stale_generation'} — it NEVER clobbers the
--    fresh config or catalog. A NULL _expected_generation keeps the legacy unconditional write (the
--    loader-failure error write, which has no loaded generation). Returns jsonb rather than RAISE-ing on
--    stale, because a stale skip is an EXPECTED concurrent-rekey outcome, not an error — verify.ts maps
--    an rpc error to a 500, so a raise would misreport a benign race.
--    §37: mcp_connection_probe has no view/trigger/function dependents; its only callers are verify.ts
--    (edge, updated this slice) and the pgTAP files (5-arg PERFORM — compatible), so the DROP is safe.
DROP FUNCTION IF EXISTS public.mcp_connection_probe(uuid, text, text, text, jsonb);
CREATE FUNCTION public.mcp_connection_probe(
  _connection_id uuid,
  _status        text,
  _health        text  DEFAULT NULL,
  _last_error_code text DEFAULT NULL,
  _tools         jsonb DEFAULT NULL,          -- array of {tool_name,schema_hash,authority_hash,pin,app,action_type,effects[]}
  _expected_generation bigint DEFAULT NULL    -- INT-152: the generation the caller loaded; NULL = ungated (legacy)
)
RETURNS jsonb                                  -- INT-152: {applied, reason?, config_generation}; was void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _t jsonb; _cur_gen bigint;
BEGIN
  IF _status IS NOT NULL AND _status NOT IN ('unconfigured','pending_verification','connected','error') THEN
    RAISE EXCEPTION 'MCP_BAD_STATUS' USING ERRCODE = '22023';
  END IF;
  IF _health IS NOT NULL AND _health NOT IN ('unknown','checking','healthy','needs_attention') THEN
    RAISE EXCEPTION 'MCP_BAD_HEALTH' USING ERRCODE = '22023';
  END IF;

  -- INT-152: read the CURRENT generation under a row lock, so a concurrent re-key (which also takes
  -- FOR UPDATE on this row) cannot slip between the compare and the write. A missing row is a no-op
  -- (applied:false) — preserving the prior silent-no-op-on-missing-row behaviour, and never reaching
  -- the tool write for a row that does not exist (which would FK-fault).
  SELECT config_generation INTO _cur_gen
    FROM public.mcp_connections WHERE connection_id = _connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_connection');
  END IF;

  -- Compare-and-write: when the caller carries the generation it LOADED, only apply if the row still
  -- bears it. A stale probe is a NO-OP and NEVER clobbers the fresh config or catalog.
  IF _expected_generation IS NOT NULL AND _cur_gen IS DISTINCT FROM _expected_generation THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'stale_generation', 'config_generation', _cur_gen);
  END IF;

  UPDATE public.mcp_connections SET
    status = COALESCE(_status, status),
    health = COALESCE(_health, health),
    last_error_code = _last_error_code,
    last_checked_at = now(),
    updated_at = now()
  WHERE connection_id = _connection_id;
  -- NB: the probe does NOT touch config_generation (verification is not a config change) and does NOT
  -- write status pending_verification/unconfigured, so trg_mcp_bump_config_generation no-ops here.

  IF _tools IS NOT NULL AND jsonb_typeof(_tools) = 'array' THEN
    -- Discovery is authoritative for the catalog: replace this connection's tools with the
    -- freshly-probed set (a tool that vanished from the provider is no longer offered). A failed probe
    -- passing _tools=null leaves the catalog intact.
    DELETE FROM public.mcp_connection_tools WHERE connection_id = _connection_id;
    FOR _t IN SELECT * FROM jsonb_array_elements(_tools) LOOP
      IF _t ? 'tool_name' THEN
        INSERT INTO public.mcp_connection_tools
          (connection_id, tool_name, schema_hash, authority_hash, pin, app, action_type, effects)
        VALUES (
          _connection_id,
          left(_t->>'tool_name', 200),
          _t->>'schema_hash', _t->>'authority_hash', _t->>'pin',
          left(COALESCE(_t->>'app',''), 100), left(COALESCE(_t->>'action_type',''), 80),
          COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(COALESCE(_t->'effects','[]'::jsonb)) v), '{}')
        )
        ON CONFLICT (connection_id, tool_name) DO UPDATE SET
          schema_hash = EXCLUDED.schema_hash, authority_hash = EXCLUDED.authority_hash,
          pin = EXCLUDED.pin, app = EXCLUDED.app, action_type = EXCLUDED.action_type,
          effects = EXCLUDED.effects, discovered_at = now();
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('applied', true, 'config_generation', _cur_gen);
END;
$$;

-- The 5-arg probe was service_role-only (the sole writer of connected/healthy). Re-apply the same
-- posture to the new 6-arg signature: no browser role marks a connection healthy.
REVOKE ALL ON FUNCTION public.mcp_connection_probe(uuid, text, text, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_connection_probe(uuid, text, text, text, jsonb, bigint) TO service_role;

COMMENT ON FUNCTION public.mcp_connection_probe(uuid, text, text, text, jsonb, bigint) IS
  'INT-152: service_role-only probe writer (the ONLY writer of status=connected/health=healthy + the '
  'tool catalog), now compare-and-write. _expected_generation (the generation the caller LOADED via '
  'get_mcp_connection_secret) is matched under FOR UPDATE against the row''s current config_generation; '
  'a mismatch is a no-op (applied:false, reason stale_generation) so an in-flight probe of a '
  'since-rotated endpoint/credential cannot clobber the fresh config or catalog. A NULL '
  '_expected_generation is an unconditional write (legacy). Returns {applied, reason?, '
  'config_generation}; a failed probe passing _tools=null still does not wipe the catalog; a missing '
  'row is applied:false (no FK-fault). Closed codes only; never echoes provider text.';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- C. INT-153 — writer minimum credential length (the scanner-floor completion).
-- ═══════════════════════════════════════════════════════════════════════════════════

-- _mcp_assert_credential_bundle — body IDENTICAL to 20270331000000 EXCEPT a minimum-length assertion
-- is appended to the bearer and header branches (the EXACT kinds verify.ts's reflection scanner scans,
-- MIN_SECRET_SCAN_LEN=12). Placed AFTER the existing non-empty + shape + stray-field checks so every
-- pre-existing rejection reason (empty token, bad/reserved header name, stray oauth fields) fires
-- first and UNCHANGED — the length check only fires for an otherwise-valid bundle whose token is too
-- short. oauth is out of scope (provider-minted, NOT scanned); url/none carry no token column.
-- §37 producers: create_mcp_connection + set_mcp_connection_endpoint (the only callers) — both keep
-- working for every realistic credential; the pgTAP accept-cases that used <12-char placeholder tokens
-- are updated to realistic values in the same commit (mcp_gateway_connection_create.sql).
CREATE OR REPLACE FUNCTION public._mcp_assert_credential_bundle(
  _auth_kind               text,
  _auth_token              text,
  _auth_header_name        text,
  _refresh_token           text,
  _oauth_issuer            text,
  _oauth_client_id         text,
  _oauth_client_secret     text,
  _oauth_scopes            text[],
  _access_token_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  IF _auth_kind = 'header' THEN
    -- runtime: authFromSecret needs auth_token + auth_header_name; authUsable needs a presentable name
    -- (F1). Reject a missing token, a missing name, or a name the transport cannot present.
    IF btrim(COALESCE(_auth_token, '')) = ''
       OR btrim(COALESCE(_auth_header_name, '')) = ''
       OR NOT public._mcp_header_name_usable(_auth_header_name) THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- F2: header's scheme is {token, header_name}; refresh/oauth-* belong to another scheme.
    IF btrim(COALESCE(_refresh_token, '')) <> '' OR btrim(COALESCE(_oauth_issuer, '')) <> ''
       OR btrim(COALESCE(_oauth_client_id, '')) <> '' OR btrim(COALESCE(_oauth_client_secret, '')) <> ''
       OR _oauth_scopes IS NOT NULL OR _access_token_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- INT-153: the writer floor that makes verify.ts's reflection scanner (MIN_SECRET_SCAN_LEN=12,
    -- header kind) complete — a stored header credential shorter than the floor could be echoed into
    -- the catalog and slip under it. Last, so the checks above keep their exact reasons.
    IF length(btrim(_auth_token)) < 12 THEN
      RAISE EXCEPTION 'MCP_CREDENTIAL_TOO_SHORT' USING ERRCODE = '22023';   -- closed code; never echoes the value
    END IF;
  ELSIF _auth_kind = 'bearer' THEN
    -- runtime: authFromSecret needs auth_token (maps to bearer). Its scheme is {token} only.
    -- (api_key was already rejected inline by the caller, so it never reaches here.)
    IF btrim(COALESCE(_auth_token, '')) = '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- F2: a header name, a refresh token, or any oauth-* field is not this scheme's.
    IF btrim(COALESCE(_auth_header_name, '')) <> '' OR btrim(COALESCE(_refresh_token, '')) <> ''
       OR btrim(COALESCE(_oauth_issuer, '')) <> '' OR btrim(COALESCE(_oauth_client_id, '')) <> ''
       OR btrim(COALESCE(_oauth_client_secret, '')) <> '' OR _oauth_scopes IS NOT NULL
       OR _access_token_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- INT-153: writer floor for the bearer kind (verify.ts scans bearer at MIN_SECRET_SCAN_LEN=12).
    IF length(btrim(_auth_token)) < 12 THEN
      RAISE EXCEPTION 'MCP_CREDENTIAL_TOO_SHORT' USING ERRCODE = '22023';
    END IF;
  ELSIF _auth_kind = 'oauth' THEN
    -- F3: the runtime's authFromSecret has NO refresh step — a refresh-only bundle loads unusable.
    -- REQUIRE _auth_token + issuer + client_id; refresh/secret/scopes/expiry are optional-additional.
    IF btrim(COALESCE(_auth_token, '')) = '' OR btrim(COALESCE(_oauth_issuer, '')) = ''
       OR btrim(COALESCE(_oauth_client_id, '')) = '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- F2: a custom header name belongs to the 'header' scheme, not oauth.
    IF btrim(COALESCE(_auth_header_name, '')) <> '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- round-4 / round-5 F2: reject an already-EXPIRED access token, mirroring the loader's oauthExpired
    -- (connection.ts:118) EXACTLY — clock_timestamp() (live wall clock) is the faithful mirror of
    -- Date.now(); exact <=, no skew/grace; a NULL/absent expiry is live.
    IF _access_token_expires_at IS NOT NULL AND _access_token_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'MCP_OAUTH_TOKEN_EXPIRED' USING ERRCODE = '22023';   -- closed code; never echoes a value
    END IF;
    -- INT-153 scope note: oauth access tokens are provider-minted and are NOT scanned by verify.ts
    -- (MIN_SECRET_SCAN_LEN gates only bearer/header), so no writer floor is applied here — adding one
    -- would gate a provider's token shape without closing any scanner gap.
  ELSE
    -- url / none: no credential material at all may accompany a credential-less kind (F2).
    IF btrim(COALESCE(_auth_token, '')) <> ''
       OR btrim(COALESCE(_auth_header_name, '')) <> ''
       OR btrim(COALESCE(_refresh_token, '')) <> ''
       OR btrim(COALESCE(_oauth_issuer, '')) <> ''
       OR btrim(COALESCE(_oauth_client_id, '')) <> ''
       OR btrim(COALESCE(_oauth_client_secret, '')) <> ''
       OR _oauth_scopes IS NOT NULL
       OR _access_token_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public._mcp_assert_credential_bundle(text, text, text, text, text, text, text, text[], timestamptz) IS
  'G1a-1 + INT-153: the ONE home for per-kind MCP credential-bundle validation. Body is the '
  '20270331000000 version PLUS a minimum-length floor (>=12, = verify.ts MIN_SECRET_SCAN_LEN) appended '
  'to the bearer and header branches — the exact kinds the reflection scanner scans — so a stored '
  'credential can never be short enough to slip under that floor if a hostile server echoes it into the '
  'catalog. The floor is placed AFTER the existing checks so every prior rejection reason is unchanged. '
  'oauth (provider-minted, unscanned) and url/none (no token column) are deliberately out of scope. '
  'RAISEs MCP_BAD_CREDENTIAL_BUNDLE / MCP_OAUTH_TOKEN_EXPIRED / MCP_CREDENTIAL_TOO_SHORT (closed codes, '
  'never echoing a value). VOLATILE (reads clock_timestamp()). Callers: set_mcp_connection_endpoint, '
  'create_mcp_connection.';
