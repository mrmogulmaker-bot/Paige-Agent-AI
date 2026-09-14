-- ============================================================================
-- Connected MCP Gateway — durable, endpoint-bound consent (#1262 findings 2/3, DB layer proof).
--
-- Proves migration 20270323000000:
--   (W)  set_mcp_connection_approval records the endpoint identity the consent is bound to, and
--        refuses a connection with no endpoint.
--   (1)  verify_mcp_connection_approval AUTHORIZES only a stored approval whose pin + endpoint hash
--        (+ optional action shape, + unexpired) all still hold.
--   (2)  a wrong live pin → contract_changed.
--   (3)  an approval bound to a DIFFERENT endpoint than the connection now has → endpoint_changed
--        (the verify-time binding, independent of the 20270322000000 delete trigger).
--   (4)  a legacy approval with NULL endpoint_hash → approval_not_endpoint_bound (fail-closed).
--   (5)  an expired approval → approval_expired.
--   (6)  action-shape binding: enforced only when the approval carries one (matching → authorized;
--        differing → action_shape_changed; approval with NULL shape → not enforced).
--   (7)  §9 tenant isolation on the writer: approving a connection in tenant B while resolving
--        tenant A is refused; the same call for tenant B succeeds (positive control).
--
-- Synthetic fixtures only; self-contained; ROLLS BACK. Runs as the superuser test role (auth.uid()
-- is NULL → _mcp_resolve_tenant's trusted path), so RLS is bypassed for seeding and the DEFINER
-- RPCs are exercised directly. Any RAISE = fail (ON_ERROR_STOP); reaching the terminal notice = pass.
--
-- SCOPE NOTE (§13, §39 adversarial): case (7) proves the NEW code — the writer's in-body
-- `_conn.tenant_id <> _tenant` refusal. Because this runs on the trusted (auth.uid() NULL) path, it
-- does NOT exercise `_mcp_resolve_tenant`'s JWT `authenticated`-path admin/cross-tenant rejection —
-- that gate is pre-existing and unchanged (20261005000000), not this migration's code.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/mcp_gateway_durable_endpoint_bound_consent.sql "$DB_URL"
-- ============================================================================
BEGIN;

-- Two independent tenants; a target connection at endpoint #1 (tenant A) and a sibling (tenant B).
INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('e9c00000-0000-0000-0000-0000000000d1','mcpgw-consent-a','MCPGW Consent A','active','standalone','MCA','{}'::jsonb),
  ('e9c00000-0000-0000-0000-0000000000e1','mcpgw-consent-b','MCPGW Consent B','active','standalone','MCB','{}'::jsonb);

INSERT INTO public.mcp_connections (connection_id, tenant_id, provider_key, label, server_url_ct) VALUES
  ('e9c00000-0000-0000-0000-0000000000d2','e9c00000-0000-0000-0000-0000000000d1','generic-remote','target',
     public.platform_encrypt('https://mcp-a.example/rpc')),
  ('e9c00000-0000-0000-0000-0000000000e2','e9c00000-0000-0000-0000-0000000000e1','generic-remote','sibling',
     public.platform_encrypt('https://mcp-b.example/rpc'));

-- ── (W) The writer records the endpoint the consent is bound to ───────────────
-- The reviewed endpoint hash is REQUIRED and must match the connection's current endpoint (#1).
SELECT public.set_mcp_connection_approval(
  'e9c00000-0000-0000-0000-0000000000d2', 'send_message', repeat('a',64),
  'e9c00000-0000-0000-0000-0000000000d1', NULL, NULL,
  public._mcp_endpoint_hash('https://mcp-a.example/rpc'));
DO $$
DECLARE _bound text; _expected text;
BEGIN
  SELECT endpoint_hash INTO _bound FROM public.mcp_connection_approvals
   WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000d2' AND tool_name = 'send_message';
  _expected := public._mcp_endpoint_hash('https://mcp-a.example/rpc');
  IF _bound IS NULL OR _bound IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION '(W) writer did not bind the current endpoint: bound=% expected=%', _bound, _expected;
  END IF;
END $$;

-- ── (1) A matching approval (pin + current endpoint) AUTHORIZES ───────────────
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('a',64), NULL);
  IF (_r->>'authorized') <> 'true' THEN RAISE EXCEPTION '(1) matching approval was not authorized: %', _r; END IF;
END $$;

-- ── (2) A wrong live pin → contract_changed ───────────────────────────────────
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('c',64), NULL);
  IF (_r->>'authorized') <> 'false' OR (_r->>'reason') <> 'contract_changed' THEN
    RAISE EXCEPTION '(2) wrong pin should be contract_changed: %', _r;
  END IF;
END $$;

-- ── (3) An approval bound to a DIFFERENT endpoint than the connection now has → endpoint_changed.
-- Directly bind the approval to endpoint #2's hash while the connection stays at #1 (a stale binding
-- that bypasses the delete trigger), so the VERIFY-time endpoint check is proven on its own.
UPDATE public.mcp_connection_approvals
   SET endpoint_hash = public._mcp_endpoint_hash('https://mcp-OTHER.example/rpc')
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000d2' AND tool_name = 'send_message';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('a',64), NULL);
  IF (_r->>'authorized') <> 'false' OR (_r->>'reason') <> 'endpoint_changed' THEN
    RAISE EXCEPTION '(3) stale endpoint should be endpoint_changed: %', _r;
  END IF;
END $$;

-- ── (4) A legacy approval with NULL endpoint_hash → approval_not_endpoint_bound (fail-closed) ──
UPDATE public.mcp_connection_approvals
   SET endpoint_hash = NULL
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000d2' AND tool_name = 'send_message';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('a',64), NULL);
  IF (_r->>'authorized') <> 'false' OR (_r->>'reason') <> 'approval_not_endpoint_bound' THEN
    RAISE EXCEPTION '(4) NULL endpoint binding should be approval_not_endpoint_bound: %', _r;
  END IF;
END $$;

-- ── (5) An expired approval → approval_expired ────────────────────────────────
UPDATE public.mcp_connection_approvals
   SET endpoint_hash = public._mcp_endpoint_hash('https://mcp-a.example/rpc'),
       expires_at    = now() - interval '1 hour'
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000d2' AND tool_name = 'send_message';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('a',64), NULL);
  IF (_r->>'authorized') <> 'false' OR (_r->>'reason') <> 'approval_expired' THEN
    RAISE EXCEPTION '(5) expired approval should be approval_expired: %', _r;
  END IF;
END $$;

-- ── (6) Action-shape binding — enforced only when the approval carries one ────
UPDATE public.mcp_connection_approvals
   SET expires_at = NULL,
       args_shape_hash = repeat('1',64)
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000d2' AND tool_name = 'send_message';
DO $$
DECLARE _match jsonb; _diff jsonb;
BEGIN
  _match := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('a',64), repeat('1',64));
  IF (_match->>'authorized') <> 'true' THEN RAISE EXCEPTION '(6a) matching action shape should authorize: %', _match; END IF;
  _diff := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('a',64), repeat('2',64));
  IF (_diff->>'authorized') <> 'false' OR (_diff->>'reason') <> 'action_shape_changed' THEN
    RAISE EXCEPTION '(6b) differing action shape should be action_shape_changed: %', _diff;
  END IF;
END $$;
-- With NO bound shape, any provided shape is accepted (not enforced).
UPDATE public.mcp_connection_approvals SET args_shape_hash = NULL
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000d2' AND tool_name = 'send_message';
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.verify_mcp_connection_approval('e9c00000-0000-0000-0000-0000000000d2','send_message', repeat('a',64), repeat('9',64));
  IF (_r->>'authorized') <> 'true' THEN RAISE EXCEPTION '(6c) unbound action shape must not be enforced: %', _r; END IF;
END $$;

-- ── (7) §9 tenant isolation on the writer ─────────────────────────────────────
-- Approving the tenant-B connection while resolving tenant A is refused (connection not in tenant);
-- the same call resolving tenant B succeeds (positive control — proves the refusal was the tenant
-- mismatch, not an incidental failure).
DO $$
DECLARE _refused boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_mcp_connection_approval(
      'e9c00000-0000-0000-0000-0000000000e2','send_message', repeat('a',64),
      'e9c00000-0000-0000-0000-0000000000d1');   -- tenant A resolving a tenant-B connection
  EXCEPTION WHEN OTHERS THEN _refused := true;
  END;
  IF NOT _refused THEN RAISE EXCEPTION '(7) cross-tenant approval was NOT refused'; END IF;
END $$;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000e2';
  IF n <> 0 THEN RAISE EXCEPTION '(7) cross-tenant approval leaked a row onto the sibling: %', n; END IF;
END $$;
SELECT public.set_mcp_connection_approval(
  'e9c00000-0000-0000-0000-0000000000e2','send_message', repeat('b',64),
  'e9c00000-0000-0000-0000-0000000000e1', NULL, NULL,
  public._mcp_endpoint_hash('https://mcp-b.example/rpc'));   -- tenant B resolving its own connection
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000e2';
  IF n <> 1 THEN RAISE EXCEPTION '(7) same-tenant approval should have succeeded: %', n; END IF;
END $$;

-- ── (8) The writer refuses a connection with NO endpoint ──────────────────────
INSERT INTO public.mcp_connections (connection_id, tenant_id, provider_key, label, server_url_ct)
VALUES ('e9c00000-0000-0000-0000-0000000000d3','e9c00000-0000-0000-0000-0000000000d1','generic-remote','no-endpoint', NULL);
DO $$
DECLARE _refused boolean := false;
BEGIN
  BEGIN
    -- A dummy (well-formed) reviewed hash so the call reaches the no-endpoint check rather than the
    -- required-hash check; a NULL-endpoint connection has nothing to bind to and is refused.
    PERFORM public.set_mcp_connection_approval(
      'e9c00000-0000-0000-0000-0000000000d3','send_message', repeat('a',64),
      'e9c00000-0000-0000-0000-0000000000d1', NULL, NULL, repeat('0',64));
  EXCEPTION WHEN OTHERS THEN _refused := true;
  END;
  IF NOT _refused THEN RAISE EXCEPTION '(8) approving a tool on an endpoint-less connection was NOT refused'; END IF;
END $$;

-- ── (9) REVIEWED-ENDPOINT GUARD (Codex P1) — consent is never rebound to an endpoint the owner
-- did not review. The target connection is at address #1; approving with the reviewed hash of a
-- DIFFERENT address is refused, while the CURRENT address's hash is accepted (positive control).
DO $$
DECLARE _refused boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_mcp_connection_approval(
      'e9c00000-0000-0000-0000-0000000000d2','reviewed_stale', repeat('a',64),
      'e9c00000-0000-0000-0000-0000000000d1', NULL, NULL,
      public._mcp_endpoint_hash('https://mcp-STALE.example/rpc'));   -- reviewed a different endpoint
  EXCEPTION WHEN OTHERS THEN _refused := true;
  END;
  IF NOT _refused THEN RAISE EXCEPTION '(9) approval against a since-changed reviewed endpoint was NOT refused'; END IF;
END $$;
SELECT public.set_mcp_connection_approval(
  'e9c00000-0000-0000-0000-0000000000d2','reviewed_ok', repeat('a',64),
  'e9c00000-0000-0000-0000-0000000000d1', NULL, NULL,
  public._mcp_endpoint_hash('https://mcp-a.example/rpc'));           -- reviewed the current endpoint
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000d2' AND tool_name = 'reviewed_ok';
  IF n <> 1 THEN RAISE EXCEPTION '(9) approval with the correct reviewed endpoint should have succeeded: %', n; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'MCP_GW_DURABLE_CONSENT_PROVEN'; END $$;

ROLLBACK;
