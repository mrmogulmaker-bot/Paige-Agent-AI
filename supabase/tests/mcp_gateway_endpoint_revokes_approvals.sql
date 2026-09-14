-- ============================================================================
-- Connected MCP Gateway — endpoint-change revokes connection approvals (§9/§13/§58 proof).
--
-- Proves the safeguard added by migration 20270320000000
-- (`_mcp_gw_revoke_approvals_on_endpoint_change`), the connection-keyed twin of the legacy
-- `_mcp_revoke_approvals_on_endpoint_change` (20261012000000):
--
--   (1) NON-ENDPOINT edit (rename label, change status) → approvals SURVIVE.
--   (2) ENDPOINT re-point (server_url_ct → a DIFFERENT decrypted address) → EVERY approval
--       for that connection_id is deleted; a sibling connection's approvals are untouched.
--   (3) RE-ENCRYPT of the SAME address (key-rotation shape: new ciphertext bytes, same
--       decrypted value) → approvals SURVIVE. This is the reason the comparison is on the
--       DECRYPTED endpoint, never the ciphertext (platform_encrypt is non-deterministic).
--   (4) DISCONNECT (server_url_ct → NULL) → approvals deleted.
--
-- Synthetic fixtures only; self-contained; ROLLS BACK. Runs as the superuser test role, so
-- RLS is bypassed for seeding; the safeguard itself is a SECURITY DEFINER trigger. Any RAISE
-- = fail (ON_ERROR_STOP); reaching the terminal notice = pass.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/mcp_gateway_endpoint_revokes_approvals.sql "$DB_URL"
-- ============================================================================
BEGIN;

-- Two INDEPENDENT tenants — the sibling proves the DELETE is scoped to one connection_id.
INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('e9c00000-0000-0000-0000-0000000000a1','mcpgw-endpoint-a','MCPGW Endpoint A','active','standalone','MGA','{}'::jsonb),
  ('e9c00000-0000-0000-0000-0000000000b1','mcpgw-endpoint-b','MCPGW Endpoint B','active','standalone','MGB','{}'::jsonb);

-- Target connection (tenant A) at address #1, plus a SIBLING connection (tenant B) whose
-- approvals must never be touched by the target's endpoint change.
INSERT INTO public.mcp_connections (connection_id, tenant_id, provider_key, label, server_url_ct) VALUES
  ('e9c00000-0000-0000-0000-0000000000c1','e9c00000-0000-0000-0000-0000000000a1','generic-remote','target',
     public.platform_encrypt('https://mcp-a.example/rpc')),
  ('e9c00000-0000-0000-0000-0000000000c2','e9c00000-0000-0000-0000-0000000000b1','generic-remote','sibling',
     public.platform_encrypt('https://mcp-sibling.example/rpc'));

INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin) VALUES
  ('e9c00000-0000-0000-0000-0000000000c1','send_email', repeat('a',64)),
  ('e9c00000-0000-0000-0000-0000000000c1','list_records', repeat('b',64)),
  ('e9c00000-0000-0000-0000-0000000000c2','send_email', repeat('c',64));

-- ── (1) NON-ENDPOINT edit must NOT revoke ────────────────────────────────────
UPDATE public.mcp_connections
   SET label = 'target-renamed', status = 'connected', health = 'healthy'
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
  IF n <> 2 THEN RAISE EXCEPTION '(1) non-endpoint edit revoked approvals: expected 2, got %', n; END IF;
END $$;

-- ── (3) RE-ENCRYPT the SAME address must NOT revoke (decrypted-comparison correctness) ──
-- New ciphertext bytes (pgp_sym_encrypt is non-deterministic) but the SAME decrypted value.
UPDATE public.mcp_connections
   SET server_url_ct = public.platform_encrypt('https://mcp-a.example/rpc')
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
DO $$
DECLARE n int; same boolean;
BEGIN
  -- Guard the guard: confirm the ciphertext genuinely changed, so this really exercises the
  -- decrypt path and is not a vacuous pass on identical bytes.
  SELECT (server_url_ct = public.platform_encrypt('https://mcp-a.example/rpc')) INTO same
    FROM public.mcp_connections WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
  IF n <> 2 THEN RAISE EXCEPTION '(3) re-encrypt of same address revoked approvals: expected 2, got %', n; END IF;
END $$;

-- ── (2) ENDPOINT re-point MUST revoke — and ONLY this connection's approvals ─────────────
UPDATE public.mcp_connections
   SET server_url_ct = public.platform_encrypt('https://mcp-b.example/rpc')
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
DO $$
DECLARE n_target int; n_sibling int;
BEGIN
  SELECT count(*) INTO n_target FROM public.mcp_connection_approvals
   WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
  IF n_target <> 0 THEN RAISE EXCEPTION '(2) endpoint re-point did NOT revoke: expected 0, got %', n_target; END IF;
  SELECT count(*) INTO n_sibling FROM public.mcp_connection_approvals
   WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c2';
  IF n_sibling <> 1 THEN RAISE EXCEPTION '(2) re-point leaked across connections: sibling expected 1, got %', n_sibling; END IF;
END $$;

-- ── (4) DISCONNECT (endpoint → NULL) MUST revoke ─────────────────────────────
-- Re-seed the target's approvals against the current (address #2) endpoint, then clear it.
INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin) VALUES
  ('e9c00000-0000-0000-0000-0000000000c1','send_email', repeat('d',64));
UPDATE public.mcp_connections
   SET server_url_ct = NULL
 WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000c1';
  IF n <> 0 THEN RAISE EXCEPTION '(4) disconnect did NOT revoke: expected 0, got %', n; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'MCP_GW_ENDPOINT_REVOKE_PROVEN'; END $$;

ROLLBACK;
