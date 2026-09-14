-- Connected MCP Capability Gateway — Phase S (server/schema-first), ADDITIVE ONLY.
--
-- WHAT THIS IS (owner-approved 2026-09-14, review doc:
--   docs/architecture/paige-connected-mcp-capability-gateway-review.md §14):
-- The general, tenant-scoped, connection-keyed MCP registry that lets Paige hold MANY
-- simultaneous MCP connections per tenant — including multiple named connections to the
-- SAME provider/account class (two GHL locations, three Meta accounts, two n8n servers) —
-- with an IMMUTABLE connection_id identity, a provider descriptor that is DATA not an enum,
-- and per-connection child state (tools, approvals) namespaced by connection_id.
--
-- NON-DESTRUCTIVE / DUAL-READ (owner ruling):
--   * The legacy singleton stores — public.tenant_mcp_connections (PK tenant_id,provider)
--     and public.tenant_n8n_connections (PK tenant_id) — are NOT altered, cut over, retired,
--     overwritten, or deleted here. They remain the SOLE live read/write path.
--   * This migration ADDS new tables + read RPCs and BACKFILLS a 1:1 projection (one new
--     connection_id per existing legacy row). New read RPCs read the new model; old RPCs are
--     untouched and keep serving every existing caller. Live write-through / cutover is a
--     later phase (Phase C), gated separately.
--   * Backfill is idempotent (keyed on legacy lineage) and preserves connection, OAuth,
--     workflow, approval, pin, lease, generation, and status records 1:1.
--
-- SECURITY (mirrors the audited tenant_mcp_connections seam EXACTLY, 20261005000000):
--   RLS owner-ALL via is_platform_owner(); NO tenant-member SELECT on secret-bearing tables;
--   all tenant access through dual-caller SECURITY DEFINER RPCs gated by _mcp_resolve_tenant
--   (subject is always auth.uid(); a mismatched tenant raises; service_role/trusted path when
--   auth.uid() is NULL). Credentials are encrypted with platform_encrypt; only a service-role
--   decrypt RPC returns a usable credential; only a probe may write status='connected'.
--   EXECUTE is never granted to anon (satisfies lint:definer-fns without an exempt escape).
--
-- forget_paige_workflow is DELIBERATELY NOT defined or touched here — it is a separately
-- proven compatibility decision (see docs/delivery/phase-s-forget-paige-workflow-decision.md
-- and review doc §15). This migration does not hide that undefined dependency.

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1. Provider descriptor — DATA, not an enum. Optional per connection (§2.3): a curated
--    row improves UX and pre-fills quirks, but 'generic-remote' is a seeded no-op so Paige
--    can connect to ANY compatible MCP without a curated descriptor.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcp_providers (
  provider_key    text PRIMARY KEY
                    CHECK (provider_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  display_name    text NOT NULL,
  is_generic      boolean NOT NULL DEFAULT false,   -- true only for the no-op 'generic-remote'
  auth_kinds      text[] NOT NULL DEFAULT '{}',      -- allowed auth kinds; empty = accept any known kind
  transports      text[] NOT NULL DEFAULT '{http}',  -- represented transports (client implements http today)
  account_class   text NOT NULL DEFAULT 'multi'
                    CHECK (account_class IN ('single', 'multi')),
  oauth_discovery jsonb,                             -- issuer/endpoint hints; NULL = pure DCR discovery
  resource_url_shape text,                           -- optional validator hint (e.g. n8n '/mcp-server/http')
  default_scopes  text[] NOT NULL DEFAULT '{}',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_providers ENABLE ROW LEVEL SECURITY;

-- Descriptor catalogue carries NO tenant data and NO secrets — it is coaching-generic
-- platform metadata. Signed-in callers may read it; only the platform owner may write. Scoped
-- to `authenticated` (not anon): with RLS enabled and no anon policy, anon reads return nothing.
DROP POLICY IF EXISTS mcp_providers_read ON public.mcp_providers;
CREATE POLICY mcp_providers_read ON public.mcp_providers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS mcp_providers_owner_write ON public.mcp_providers;
CREATE POLICY mcp_providers_owner_write ON public.mcp_providers
  FOR ALL USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- Seed the known shapes. 'generic-remote' is the no-op that makes a descriptor OPTIONAL.
INSERT INTO public.mcp_providers
  (provider_key, display_name, is_generic, auth_kinds, transports, account_class, resource_url_shape, default_scopes, notes)
VALUES
  ('generic-remote', 'Generic remote MCP', true,  '{}',                    '{http,sse}', 'multi', NULL, '{}',
   'No-op descriptor. A connection needs no curated provider row to work; it carries its own endpoint/transport/auth/discovery.'),
  ('n8n',            'n8n',                false, '{oauth,bearer,header,api_key}', '{http,sse}', 'multi', '/mcp-server/http', '{workflow:read,workflow:write}',
   'n8n instance: OAuth (MCP) or bearer/header/API-key (REST). Owner-bound OAuth flow is a descriptor quirk, not the model.'),
  ('zapier',         'Zapier',             false, '{oauth,url}',           '{http}',     'multi', NULL, '{}',
   'Zapier MCP over OAuth 2.1 (DCR + PKCE) against mcp.zapier.com.')
ON CONFLICT (provider_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. The connection registry — IMMUTABLE connection_id identity; many per tenant, many
--    per provider. label is a MUTABLE human name, never the identity/join/authority key.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcp_connections (
  connection_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_key     text NOT NULL DEFAULT 'generic-remote'
                     REFERENCES public.mcp_providers(provider_key),
  label            text NOT NULL,                     -- MUTABLE human name; rename ≠ re-identify
  server_url_ct    bytea,                              -- encrypted endpoint
  transport        text NOT NULL DEFAULT 'http'
                     CHECK (transport IN ('http', 'sse', 'stdio')),
  auth_kind        text NOT NULL DEFAULT 'bearer'
                     CHECK (auth_kind IN ('oauth', 'bearer', 'header', 'api_key', 'url', 'none')),
  auth_header_name text,
  auth_token_ct    bytea,
  auth_token_last4 text,
  refresh_token_ct bytea,
  access_token_expires_at timestamptz,
  oauth_issuer     text,
  oauth_client_id  text,
  oauth_client_secret_ct  bytea,
  oauth_scopes     text[],
  granted_scopes   text[] NOT NULL DEFAULT '{}',       -- the ceiling (max provider authority) for THIS connection
  status           text NOT NULL DEFAULT 'unconfigured'
                     CHECK (status IN ('unconfigured', 'pending_verification', 'connected', 'error')),
  health           text NOT NULL DEFAULT 'unknown'
                     CHECK (health IN ('unknown', 'checking', 'healthy', 'needs_attention')),
  last_checked_at  timestamptz,                        -- observed_at (per provider-result-contract R3); never "verified now"
  last_error_code  text,                               -- closed code; provider error text is NEVER stored raw here
  visibility       text NOT NULL DEFAULT 'tenant'
                     CHECK (visibility IN ('tenant', 'owner_only')),
  owner_policy     jsonb NOT NULL DEFAULT '{}'::jsonb, -- optional owner-set autonomy preference; NEVER a capability allowlist
  provider_state   jsonb NOT NULL DEFAULT '{}'::jsonb, -- preserved provider-specific state (n8n workflow approvals/marks/pin/leases, zapier gens)
  enabled          boolean NOT NULL DEFAULT true,
  -- Backfill lineage — makes the 1:1 backfill idempotent and lets a dual-read resolver map a
  -- legacy (tenant, provider) to its connection_id. NULL for connections born in the new model.
  legacy_source    text CHECK (legacy_source IN ('tenant_mcp_connections', 'tenant_n8n_connections')),
  legacy_provider  text,
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Human addressing, NOT identity: at most one connection per (tenant, provider, label).
  CONSTRAINT mcp_connections_tenant_provider_label_uq UNIQUE (tenant_id, provider_key, label)
);

-- One backfilled connection per legacy row — the idempotency + dual-read mapping key.
CREATE UNIQUE INDEX IF NOT EXISTS mcp_connections_legacy_lineage_uq
  ON public.mcp_connections (legacy_source, tenant_id, legacy_provider)
  WHERE legacy_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS mcp_connections_tenant_idx
  ON public.mcp_connections (tenant_id) WHERE enabled;

ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;

-- Same posture as tenant_mcp_connections: owner operates directly; everyone else goes through
-- the DEFINER RPCs. No tenant-member SELECT — ciphertext must never be exposed to a row read.
DROP POLICY IF EXISTS mcp_connections_owner_all ON public.mcp_connections;
CREATE POLICY mcp_connections_owner_all ON public.mcp_connections
  FOR ALL USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- ─────────────────────────────────────────────────────────────────────────────────
-- 3. Per-connection child state — the runtime tool catalog + approvals, namespaced by
--    connection_id so two connections to the same provider/account cannot collide.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcp_connection_tools (
  connection_id  uuid NOT NULL REFERENCES public.mcp_connections(connection_id) ON DELETE CASCADE,
  tool_name      text NOT NULL,
  schema_hash    text,                 -- SHA-256 of the tool input schema (from mcp-client fingerprint)
  authority_hash text,                 -- SHA-256 of app + action_type + effects
  pin            text,                 -- schema+authority pin the approval binds to
  app            text,
  action_type    text,
  effects        text[] NOT NULL DEFAULT '{}',
  discovered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, tool_name)
);
ALTER TABLE public.mcp_connection_tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_connection_tools_owner_all ON public.mcp_connection_tools;
CREATE POLICY mcp_connection_tools_owner_all ON public.mcp_connection_tools
  FOR ALL USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE TABLE IF NOT EXISTS public.mcp_connection_approvals (
  connection_id  uuid NOT NULL REFERENCES public.mcp_connections(connection_id) ON DELETE CASCADE,
  tool_name      text NOT NULL CHECK (tool_name ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  pin            text NOT NULL CHECK (pin ~ '^[0-9a-f]{64}$'),
  approved_by    uuid,
  approved_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, tool_name)
);
ALTER TABLE public.mcp_connection_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_connection_approvals_owner_all ON public.mcp_connection_approvals;
CREATE POLICY mcp_connection_approvals_owner_all ON public.mcp_connection_approvals
  FOR ALL USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- Connection-scoped receipts for the generic runner (Phase S records here; the shared
-- paige_workspace_events receipt store gains a nullable connection_id below so the live
-- chat-driven path can carry the reference when it is wired in Phase C).
CREATE TABLE IF NOT EXISTS public.mcp_connection_receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  uuid NOT NULL REFERENCES public.mcp_connections(connection_id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL,
  tool_name      text NOT NULL,
  outcome        text NOT NULL
                   CHECK (outcome IN ('read_observed','prepared','executed','refused','provider_unavailable','outcome_unknown')),
  run_id         uuid NOT NULL,
  actor_id       uuid,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- redacted; NEVER raw provider payload/schema
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_connection_receipts_conn_idx
  ON public.mcp_connection_receipts (connection_id, occurred_at DESC);
ALTER TABLE public.mcp_connection_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_connection_receipts_owner_all ON public.mcp_connection_receipts;
CREATE POLICY mcp_connection_receipts_owner_all ON public.mcp_connection_receipts
  FOR ALL USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- ─────────────────────────────────────────────────────────────────────────────────
-- 4. Shared receipt store: ADDITIVE nullable connection reference. Historical receipts stay
--    NULL (unlinked, per owner ruling); the future connection-keyed runner sets it. No
--    existing insert is changed; ON DELETE SET NULL keeps history when a connection is removed.
-- ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_workspace_events
  ADD COLUMN IF NOT EXISTS connection_id uuid
    REFERENCES public.mcp_connections(connection_id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 5. Dual-read RPCs (NEW; the legacy RPCs are untouched). All gated by _mcp_resolve_tenant.
-- ─────────────────────────────────────────────────────────────────────────────────

-- 5a. Safe status read for the whole tenant — array of connections, secrets never returned.
CREATE OR REPLACE FUNCTION public.get_mcp_connections_v2(
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _out jsonb; _full boolean;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  -- owner_only connections are visible only to a tenant admin / platform owner (or a trusted
  -- service-role caller, where auth.uid() is NULL); an ordinary member does not see them.
  _full := auth.uid() IS NULL OR public.is_tenant_admin(_tenant) OR public.is_platform_owner();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'connection_id', c.connection_id,
           'provider_key', c.provider_key,
           'label', c.label,
           'transport', c.transport,
           'auth_kind', c.auth_kind,
           'configured', c.auth_token_ct IS NOT NULL OR c.refresh_token_ct IS NOT NULL,
           'enabled', c.enabled,
           'status', c.status,
           'health', c.health,
           -- observed_at, never presented as "verified now" (truth-boundary; the reader labels freshness).
           'last_checked_at', c.last_checked_at,
           'granted_scopes', c.granted_scopes,
           'visibility', c.visibility,
           -- Host only, never the secret-bearing full URL/path.
           'server_url_host', CASE WHEN c.server_url_ct IS NOT NULL
             THEN split_part(split_part(public.platform_decrypt(c.server_url_ct), '://', 2), '/', 1)
             ELSE NULL END,
           'tool_count', (SELECT count(*) FROM public.mcp_connection_tools t WHERE t.connection_id = c.connection_id),
           'approved_count', (SELECT count(*) FROM public.mcp_connection_approvals a WHERE a.connection_id = c.connection_id)
         ) ORDER BY c.created_at), '[]'::jsonb)
    INTO _out
    FROM public.mcp_connections c
   WHERE c.tenant_id = _tenant
     AND (_full OR c.visibility <> 'owner_only');
  RETURN _out;
END;
$$;

-- 5b. Dual-read resolver: map a legacy (tenant, provider) to its backfilled connection_id,
--     so a caller can move from the singleton model to the connection-keyed model.
CREATE OR REPLACE FUNCTION public.resolve_mcp_connection_id(
  _tenant_id     uuid,
  _legacy_source text,
  _legacy_provider text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _cid uuid;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  IF _legacy_source NOT IN ('tenant_mcp_connections', 'tenant_n8n_connections') THEN
    RAISE EXCEPTION 'MCP_BAD_LEGACY_SOURCE' USING ERRCODE = '22023';
  END IF;
  SELECT c.connection_id INTO _cid
    FROM public.mcp_connections c
   WHERE c.tenant_id = _tenant
     AND c.legacy_source = _legacy_source
     AND c.legacy_provider IS NOT DISTINCT FROM _legacy_provider
   LIMIT 1;
  RETURN _cid;
END;
$$;

-- 5c. SERVICE-ROLE ONLY decrypted read, keyed by connection_id. The only path to a usable
--     credential in the new model (mirror of get_tenant_mcp_secret).
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
  IF _row.connection_id IS NULL OR _row.server_url_ct IS NULL
     OR (_row.auth_token_ct IS NULL AND _row.refresh_token_ct IS NULL AND _row.auth_kind <> 'none') THEN
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

-- 5d. SERVICE-ROLE ONLY probe writer — the ONLY writer of status='connected'/health='healthy'.
--     Persists the read-only intake result (discovered tools) into the namespaced child table.
CREATE OR REPLACE FUNCTION public.mcp_connection_probe(
  _connection_id uuid,
  _status        text,
  _health        text  DEFAULT NULL,
  _last_error_code text DEFAULT NULL,
  _tools         jsonb DEFAULT NULL           -- array of {tool_name,schema_hash,authority_hash,pin,app,action_type,effects[]}
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _t jsonb;
BEGIN
  IF _status IS NOT NULL AND _status NOT IN ('unconfigured','pending_verification','connected','error') THEN
    RAISE EXCEPTION 'MCP_BAD_STATUS' USING ERRCODE = '22023';
  END IF;
  IF _health IS NOT NULL AND _health NOT IN ('unknown','checking','healthy','needs_attention') THEN
    RAISE EXCEPTION 'MCP_BAD_HEALTH' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mcp_connections SET
    status = COALESCE(_status, status),
    health = COALESCE(_health, health),
    last_error_code = _last_error_code,
    last_checked_at = now(),
    updated_at = now()
  WHERE connection_id = _connection_id;

  IF _tools IS NOT NULL AND jsonb_typeof(_tools) = 'array' THEN
    -- Discovery is authoritative for the catalog: replace this connection's tools with the
    -- freshly-probed set (a tool that vanished from the provider is no longer offered).
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
END;
$$;

-- 5e. Admin-gated approval writer — pins a capability to a connection (per connection).
CREATE OR REPLACE FUNCTION public.set_mcp_connection_approval(
  _connection_id uuid,
  _tool_name     text,
  _pin           text,
  _tenant_id     uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _owner uuid := auth.uid(); _conn_tenant uuid;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);
  SELECT tenant_id INTO _conn_tenant FROM public.mcp_connections WHERE connection_id = _connection_id;
  IF _conn_tenant IS NULL OR _conn_tenant <> _tenant THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;
  IF _tool_name !~ '^[A-Za-z0-9_.:-]{1,64}$' THEN
    RAISE EXCEPTION 'MCP_BAD_TOOL_NAME' USING ERRCODE = '22023';
  END IF;
  IF _pin !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'MCP_BAD_PIN' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by)
  VALUES (_connection_id, _tool_name, _pin, _owner)
  ON CONFLICT (connection_id, tool_name) DO UPDATE SET
    pin = EXCLUDED.pin, approved_by = EXCLUDED.approved_by, approved_at = now();
END;
$$;

-- 5f. Connection-scoped receipt writer (service-role) for the generic runner.
CREATE OR REPLACE FUNCTION public.record_mcp_connection_receipt(
  _connection_id uuid,
  _tool_name     text,
  _outcome       text,
  _run_id        uuid,
  _actor_id      uuid DEFAULT NULL,
  _detail        jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid;
BEGIN
  IF _outcome NOT IN ('read_observed','prepared','executed','refused','provider_unavailable','outcome_unknown') THEN
    RAISE EXCEPTION 'MCP_BAD_OUTCOME' USING ERRCODE = '22023';
  END IF;
  SELECT tenant_id INTO _tenant FROM public.mcp_connections WHERE connection_id = _connection_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.mcp_connection_receipts
    (connection_id, tenant_id, tool_name, outcome, run_id, actor_id, detail)
  VALUES (_connection_id, _tenant, left(_tool_name, 200), _outcome, _run_id, _actor_id, COALESCE(_detail, '{}'::jsonb));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 6. One-to-one, idempotent, NON-DESTRUCTIVE backfill from BOTH legacy stores.
--    Legacy rows are only READ; nothing there is modified or deleted.
-- ─────────────────────────────────────────────────────────────────────────────────
-- Deterministic collision-free label picker for the backfill. `label` is human addressing, NOT
-- identity, and UNIQUE(tenant_id, provider_key, label) must hold — a tenant with BOTH an n8n
-- MCP-OAuth row (from tenant_mcp_connections) AND an n8n API-key row (from tenant_n8n_connections)
-- maps both to provider_key='n8n', and their operator-set labels could coincide. This returns the
-- base label, or base + ' (2)', ' (3)', … for the first free slot — never raising a unique
-- violation and never dropping a legacy connection (§58: the 1:1 projection is preserved).
CREATE OR REPLACE FUNCTION public._mcp_gw_free_label(_tenant uuid, _provider text, _base text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE _label text := _base; _n int := 1;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM public.mcp_connections
     WHERE tenant_id = _tenant AND provider_key = _provider AND label = _label
  ) LOOP
    _n := _n + 1;
    _label := left(_base, 90) || ' (' || _n || ')';
  END LOOP;
  RETURN _label;
END;
$$;

DO $backfill$
DECLARE r record;
BEGIN
  -- 6a. tenant_mcp_connections (Zapier + n8n-OAuth). One connection per (tenant, provider).
  FOR r IN SELECT * FROM public.tenant_mcp_connections LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.mcp_connections
       WHERE legacy_source = 'tenant_mcp_connections'
         AND tenant_id = r.tenant_id AND legacy_provider IS NOT DISTINCT FROM r.provider
    ) THEN
      INSERT INTO public.mcp_connections (
        tenant_id, provider_key, label,
        server_url_ct, transport, auth_kind, auth_header_name,
        auth_token_ct, auth_token_last4, refresh_token_ct, access_token_expires_at,
        oauth_issuer, oauth_client_id, oauth_client_secret_ct, oauth_scopes,
        granted_scopes, status,
        health,
        enabled, provider_state, legacy_source, legacy_provider, created_by, updated_by, created_at, updated_at
      ) VALUES (
        r.tenant_id, r.provider,
        public._mcp_gw_free_label(r.tenant_id, r.provider, COALESCE(NULLIF(btrim(COALESCE(r.label, '')), ''), r.provider || ' (MCP)')),
        r.server_url_ct, r.transport, r.auth_kind, r.auth_header_name,
        r.auth_token_ct, r.auth_token_last4, r.refresh_token_ct, r.access_token_expires_at,
        r.oauth_issuer, r.oauth_client_id, r.oauth_client_secret_ct, r.oauth_scopes,
        COALESCE(r.oauth_scopes, '{}'), r.status,
        CASE r.status WHEN 'connected' THEN 'healthy' WHEN 'error' THEN 'needs_attention' ELSE 'unknown' END,
        r.enabled,
        -- Preserve provider-specific state 1:1 (n8n workflow approvals/marks/pin/leases/gens, zapier gens).
        jsonb_strip_nulls(jsonb_build_object(
          'n8n_approved_workflow_ids', to_jsonb(r.n8n_approved_workflow_ids),
          'n8n_approved_workflow_marks', r.n8n_approved_workflow_marks,
          'n8n_discovery_pin', r.n8n_discovery_pin,
          'n8n_generation', r.n8n_generation,
          'n8n_refresh_lease', r.n8n_refresh_lease,
          'n8n_refresh_until', r.n8n_refresh_until,
          'n8n_last_success_at', r.n8n_last_success_at,
          'n8n_lease_actor_id', r.n8n_lease_actor_id,
          'n8n_lease_session_id', r.n8n_lease_session_id,
          'n8n_rail_revision', r.n8n_rail_revision,
          'zapier_generation', r.zapier_generation,
          'zapier_rail_revision', r.zapier_rail_revision
        )),
        'tenant_mcp_connections', r.provider, r.created_by, r.updated_by, r.created_at, now()
      );
    END IF;

    -- 6a.ii Preserve Zapier capability approvals + pins 1:1 into the namespaced child table.
    -- Only an approval that carries a REAL stored pin is migrated as executable (the normal
    -- 4-arg approval path always stores one). A pin-less legacy approval — if any exist from
    -- the dropped 3-arg overload — is NOT silently migrated as executable (§58: never silently
    -- grant): it stays visible only in the preserved legacy row and must be re-approved. No
    -- placeholder/fake pin is ever written.
    IF r.approved_capabilities IS NOT NULL AND jsonb_typeof(r.approved_capabilities) = 'array' THEN
      INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, approved_at)
      SELECT c.connection_id, cap.value #>> '{}',
             r.capability_pins ->> (cap.value #>> '{}'),
             r.updated_by, COALESCE(r.updated_at, now())
        FROM public.mcp_connections c
        CROSS JOIN LATERAL jsonb_array_elements(r.approved_capabilities) AS cap(value)
       WHERE c.legacy_source = 'tenant_mcp_connections'
         AND c.tenant_id = r.tenant_id AND c.legacy_provider IS NOT DISTINCT FROM r.provider
         AND (cap.value #>> '{}') ~ '^[A-Za-z0-9_.:-]{1,64}$'
         AND (r.capability_pins ->> (cap.value #>> '{}')) ~ '^[0-9a-f]{64}$'
      ON CONFLICT (connection_id, tool_name) DO NOTHING;
    END IF;
  END LOOP;

  -- 6b. tenant_n8n_connections (n8n API-key facet). Its OWN connection_id, distinct label.
  FOR r IN SELECT * FROM public.tenant_n8n_connections LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.mcp_connections
       WHERE legacy_source = 'tenant_n8n_connections'
         AND tenant_id = r.tenant_id AND legacy_provider IS NULL
    ) THEN
      INSERT INTO public.mcp_connections (
        tenant_id, provider_key, label,
        server_url_ct, transport, auth_kind,
        auth_token_ct, auth_token_last4,
        status, health, enabled, provider_state,
        legacy_source, legacy_provider, created_by, updated_by, created_at, updated_at
      ) VALUES (
        r.tenant_id, 'n8n',
        public._mcp_gw_free_label(r.tenant_id, 'n8n', COALESCE(NULLIF(btrim(COALESCE(r.label, '')), ''), 'n8n (API)')),
        r.base_url_ct, 'http', 'api_key',
        r.api_key_ct, r.api_key_last4,
        CASE r.status WHEN 'connected' THEN 'connected' WHEN 'error' THEN 'error' ELSE 'unconfigured' END,
        CASE COALESCE(r.api_health, 'saved_unverified')
          WHEN 'connected' THEN 'healthy' WHEN 'needs_attention' THEN 'needs_attention'
          WHEN 'checking' THEN 'checking' ELSE 'unknown' END,
        (r.status IS DISTINCT FROM 'unconfigured'),
        jsonb_strip_nulls(jsonb_build_object(
          'workflow_count', r.workflow_count,
          'api_health', r.api_health,
          'api_failure_code', r.api_failure_code,
          'api_workflow_count', r.api_workflow_count,
          'api_checked_at', r.api_checked_at,
          'api_last_success_at', r.api_last_success_at,
          'api_credential_revision', r.api_credential_revision
        )),
        'tenant_n8n_connections', NULL, r.created_by, r.updated_by, r.created_at, now()
      );
    END IF;
  END LOOP;
END;
$backfill$;

-- The backfill helper is single-use; remove it so it leaves no ungoverned surface behind.
DROP FUNCTION IF EXISTS public._mcp_gw_free_label(uuid, text, text);

-- ─────────────────────────────────────────────────────────────────────────────────
-- 7. Grants — anon reaches NONE of these (satisfies lint:definer-fns without an exempt escape).
-- ─────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_mcp_connections_v2(uuid)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_mcp_connection_id(uuid, text, text)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_mcp_connection_secret(uuid)                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_connection_probe(uuid, text, text, text, jsonb)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_mcp_connection_approval(uuid, text, text, uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_mcp_connection_receipt(uuid, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_mcp_connections_v2(uuid)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_mcp_connection_id(uuid, text, text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mcp_connection_secret(uuid)                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_connection_probe(uuid, text, text, text, jsonb)             TO service_role;
GRANT EXECUTE ON FUNCTION public.set_mcp_connection_approval(uuid, text, text, uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_mcp_connection_receipt(uuid, text, text, uuid, uuid, jsonb) TO service_role;

COMMENT ON TABLE public.mcp_connections IS
  'Connected MCP Capability Gateway registry (Phase S). Immutable connection_id identity; many per tenant, many per provider; label is a mutable human name. Backfilled 1:1 (non-destructive) from tenant_mcp_connections + tenant_n8n_connections, which remain the sole live path until a later cutover. Credentials encrypted; only get_mcp_connection_secret (service_role) decrypts; only a probe writes connected/healthy.';
COMMENT ON TABLE public.mcp_providers IS
  'Provider descriptor catalogue (DATA, not an enum). A curated row enriches UX; the seeded generic-remote no-op makes a descriptor OPTIONAL so Paige can connect to any compatible MCP.';
