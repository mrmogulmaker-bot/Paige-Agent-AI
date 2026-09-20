-- ============================================================================
-- Connected MCP Gateway — consent is bound to the LOADED endpoint (INT-078, DB layer proof).
--
-- Proves migration 20270327000000 (MCP PR-1B-b): the load↔verify TOCTOU is closed. The runner
-- VERIFIES consent by connection_id but DISPATCHES to the endpoint the LOADER resolved; consent must
-- therefore be bound to the endpoint the runner will actually contact, not merely the one the row holds
-- at verify time.
--
--   (0)  get_mcp_connection_secret returns endpoint_hash = _mcp_endpoint_hash(the decrypted endpoint it
--        also returns as server_url) — the loader input the runner passes to verify.
--   (1)  verify AUTHORIZES when the LOADED endpoint equals the approved endpoint (and the row is still
--        there): loaded = approved = current.
--   (2)  verify refuses endpoint_load_mismatch when the LOADED endpoint differs from the approved one
--        EVEN THOUGH the row's CURRENT endpoint still matches the approval. LOAD-BEARING: under the
--        pre-INT-078 verify (which compared the approval only to the CURRENT endpoint) this returned
--        authorized — the exact TOCTOU a session that loaded a since-repointed endpoint could exploit.
--   (3)  verify refuses endpoint_changed when the row MOVED (loaded = approved, but current ≠ approved)
--        — the retained defense-in-depth check, proven independently of (2).
--   (4)  verify refuses loaded_endpoint_hash_required when the loaded hash is NULL or empty (the
--        required parameter is enforced in-body, never skippable).
--
-- Synthetic fixtures only; self-contained; ROLLS BACK. Runs as the superuser test role (auth.uid() is
-- NULL → _mcp_resolve_tenant's trusted path), so RLS is bypassed for seeding and the DEFINER RPCs are
-- exercised directly. Any RAISE = fail (ON_ERROR_STOP); reaching the terminal notice = pass.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/mcp_gateway_endpoint_load_binding.sql "$DB_URL"
-- ============================================================================
BEGIN;

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('e9c00000-0000-0000-0000-0000000000c1','mcpgw-load-a','MCPGW Load A','active','standalone','MLA','{}'::jsonb);

-- A target connection at endpoint A. auth_kind='none' (a public tokenless MCP server) so
-- get_mcp_connection_secret resolves it configured:true — the column DEFAULTs to 'bearer', which the
-- null-token guard would (correctly) refuse configured:false, and case (0) needs a configured row to
-- read endpoint_hash back. The endpoint binding under test is independent of the auth kind.
INSERT INTO public.mcp_connections (connection_id, tenant_id, provider_key, label, server_url_ct, auth_kind) VALUES
  ('e9c00000-0000-0000-0000-0000000000c2','e9c00000-0000-0000-0000-0000000000c1','generic-remote','load-target',
     public.platform_encrypt('https://mcp-load-a.example/rpc'), 'none');

-- Approve tool `send_message` bound to endpoint A (the writer requires the reviewed endpoint hash = A).
SELECT public.set_mcp_connection_approval(
  'e9c00000-0000-0000-0000-0000000000c2', 'send_message', repeat('a',64),
  'e9c00000-0000-0000-0000-0000000000c1', NULL, NULL,
  public._mcp_endpoint_hash('https://mcp-load-a.example/rpc'));

-- ── (0) get_mcp_connection_secret returns the loaded endpoint's hash ───────────
DO $$
DECLARE _s jsonb; _expected text;
BEGIN
  _s := public.get_mcp_connection_secret('e9c00000-0000-0000-0000-0000000000c2');
  _expected := public._mcp_endpoint_hash('https://mcp-load-a.example/rpc');
  IF (_s->>'configured') IS DISTINCT FROM 'true' OR (_s->>'enabled') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '(0) target connection should be configured+enabled: %', _s;
  END IF;
  IF (_s->>'endpoint_hash') IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION '(0) get_mcp_connection_secret must return endpoint_hash = hash(server_url): got=% expected=%', _s->>'endpoint_hash', _expected;
  END IF;
  IF (_s->>'server_url') IS DISTINCT FROM 'https://mcp-load-a.example/rpc' THEN
    RAISE EXCEPTION '(0) server_url should be the decrypted endpoint A: %', _s;
  END IF;
END $$;

-- ── (1) loaded = approved = current → AUTHORIZED ──────────────────────────────
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval(
    'e9c00000-0000-0000-0000-0000000000c2','send_message', repeat('a',64),
    public._mcp_endpoint_hash('https://mcp-load-a.example/rpc'), NULL);
  IF (_r->>'authorized') <> 'true' THEN RAISE EXCEPTION '(1) loaded=approved=current should authorize: %', _r; END IF;
END $$;

-- ── (2) loaded ≠ approved, current = approved → endpoint_load_mismatch (LOAD-BEARING) ──
-- The connection is still at endpoint A (current = approved = A), but the runner LOADED endpoint B — so
-- it would dispatch to B under consent granted for A. The pre-INT-078 verify (approval-vs-current only)
-- returned authorized here; the load-binding check is what refuses it.
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval(
    'e9c00000-0000-0000-0000-0000000000c2','send_message', repeat('a',64),
    public._mcp_endpoint_hash('https://mcp-load-b.example/rpc'), NULL);
  IF (_r->>'authorized') <> 'false' OR (_r->>'reason') <> 'endpoint_load_mismatch' THEN
    RAISE EXCEPTION '(2) a loaded endpoint that differs from the approved one must be endpoint_load_mismatch: %', _r;
  END IF;
END $$;

-- ── (3) row MOVED (loaded = approved, current ≠ approved) → endpoint_changed ───
-- Directly re-bind the approval to endpoint OTHER while the connection stays at A (a stale binding that
-- bypasses the 20270322000000 delete trigger). The runner LOADED OTHER (loaded = approved = OTHER, so the
-- load-binding check passes), but the connection's CURRENT endpoint is A — so the retained current-endpoint
-- check fires endpoint_changed, proven independently of (2).
UPDATE public.mcp_connection_approvals
   SET endpoint_hash = public._mcp_endpoint_hash('https://mcp-load-other.example/rpc')
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c2' AND tool_name = 'send_message';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval(
    'e9c00000-0000-0000-0000-0000000000c2','send_message', repeat('a',64),
    public._mcp_endpoint_hash('https://mcp-load-other.example/rpc'), NULL);
  IF (_r->>'authorized') <> 'false' OR (_r->>'reason') <> 'endpoint_changed' THEN
    RAISE EXCEPTION '(3) a since-moved row should be endpoint_changed: %', _r;
  END IF;
END $$;

-- ── (4) loaded hash NULL / empty → loaded_endpoint_hash_required ──────────────
-- Restore the approval to endpoint A first so the ONLY reason to refuse is the missing loaded hash.
UPDATE public.mcp_connection_approvals
   SET endpoint_hash = public._mcp_endpoint_hash('https://mcp-load-a.example/rpc')
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c2' AND tool_name = 'send_message';
DO $$
DECLARE _rnull jsonb; _rempty jsonb;
BEGIN
  _rnull := public.verify_mcp_connection_approval(
    'e9c00000-0000-0000-0000-0000000000c2','send_message', repeat('a',64), NULL, NULL);
  IF (_rnull->>'authorized') <> 'false' OR (_rnull->>'reason') <> 'loaded_endpoint_hash_required' THEN
    RAISE EXCEPTION '(4a) a NULL loaded hash must be loaded_endpoint_hash_required: %', _rnull;
  END IF;
  _rempty := public.verify_mcp_connection_approval(
    'e9c00000-0000-0000-0000-0000000000c2','send_message', repeat('a',64), '', NULL);
  IF (_rempty->>'authorized') <> 'false' OR (_rempty->>'reason') <> 'loaded_endpoint_hash_required' THEN
    RAISE EXCEPTION '(4b) an empty loaded hash must be loaded_endpoint_hash_required: %', _rempty;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'MCP_GW_ENDPOINT_LOAD_BINDING_PROVEN'; END $$;

ROLLBACK;
