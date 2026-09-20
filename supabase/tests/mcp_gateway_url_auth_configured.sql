-- ============================================================================
-- Connected MCP Gateway — a url-auth connection is CONFIGURED (INT-079, DB layer proof).
--
-- Proves migration 20270326000000 (MCP PR-1B-a) — get_mcp_connection_secret:
--   (1)  a url-auth row (credential-in-URL: server_url_ct present, BOTH token columns null,
--        auth_kind='url') resolves configured:true / enabled:true / auth_kind='url', with the
--        decrypted endpoint returned. LOAD-BEARING: under the prior `<> 'none'` guard this row
--        returned configured:false — reverting the predicate fails THIS case.
--   (2)  a DISABLED url-auth row resolves configured:true / enabled:false (the enabled gate is
--        unchanged; a url row is not special-cased there).
--   (3)  FAIL-CLOSED PRESERVED (the invariant INT-079 must NOT weaken): a bearer row with BOTH
--        token columns null still resolves configured:false. Reverting the fix leaves this passing,
--        so (3) alone cannot catch a regression — (1) is the load-bearing half, (3) guards over-reach.
--   (4)  a url-auth row with a NULL endpoint (server_url_ct null) still resolves configured:false —
--        url exempts the token guard, never the endpoint requirement.
--
-- Synthetic fixtures only; self-contained; ROLLS BACK. Runs as the superuser test role (auth.uid()
-- is NULL), so RLS is bypassed for seeding and the DEFINER RPC is exercised directly. Any RAISE =
-- fail (ON_ERROR_STOP); reaching the terminal notice = pass.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/mcp_gateway_url_auth_configured.sql "$DB_URL"
-- ============================================================================
BEGIN;

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('e9c00000-0000-0000-0000-0000000000f1','mcpgw-url-a','MCPGW Url A','active','standalone','MUA','{}'::jsonb);

-- A url-auth connection: credential lives IN the endpoint, so both token columns are null.
INSERT INTO public.mcp_connections (connection_id, tenant_id, provider_key, label, server_url_ct, auth_kind) VALUES
  ('e9c00000-0000-0000-0000-0000000000f2','e9c00000-0000-0000-0000-0000000000f1','generic-remote','url-target',
     public.platform_encrypt('https://hooks.zapier.example/mcp?key=SECRET'), 'url'),
  -- A DISABLED url-auth connection (enabled gate control).
  ('e9c00000-0000-0000-0000-0000000000f3','e9c00000-0000-0000-0000-0000000000f1','generic-remote','url-disabled',
     public.platform_encrypt('https://hooks.zapier.example/mcp?key=SECRET2'), 'url'),
  -- A bearer connection with NO tokens (fail-closed control — must stay configured:false).
  ('e9c00000-0000-0000-0000-0000000000f4','e9c00000-0000-0000-0000-0000000000f1','generic-remote','bearer-untokened',
     public.platform_encrypt('https://mcp-b.example/rpc'), 'bearer'),
  -- A url-auth connection with NO endpoint (endpoint requirement control — must stay configured:false).
  ('e9c00000-0000-0000-0000-0000000000f5','e9c00000-0000-0000-0000-0000000000f1','generic-remote','url-no-endpoint',
     NULL, 'url');

UPDATE public.mcp_connections SET enabled = false WHERE connection_id = 'e9c00000-0000-0000-0000-0000000000f3';

DO $$
DECLARE _r jsonb;
BEGIN
  -- ── (1) url-auth row → configured:true, enabled:true, auth_kind='url', endpoint decrypted ──────
  _r := public.get_mcp_connection_secret('e9c00000-0000-0000-0000-0000000000f2');
  IF (_r->>'configured') IS DISTINCT FROM 'true'
     OR (_r->>'enabled') IS DISTINCT FROM 'true'
     OR (_r->>'auth_kind') IS DISTINCT FROM 'url'
     OR (_r->>'server_url') IS DISTINCT FROM 'https://hooks.zapier.example/mcp?key=SECRET'
     OR (_r->>'auth_token') IS NOT NULL THEN
    RAISE EXCEPTION '(1) a configured url-auth row was not resolved configured:true/url: %', _r;
  END IF;

  -- ── (2) disabled url-auth row → configured:true, enabled:false ────────────────────────────────
  _r := public.get_mcp_connection_secret('e9c00000-0000-0000-0000-0000000000f3');
  IF (_r->>'configured') IS DISTINCT FROM 'true' OR (_r->>'enabled') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION '(2) a disabled url-auth row did not resolve configured:true/enabled:false: %', _r;
  END IF;

  -- ── (3) FAIL-CLOSED PRESERVED: bearer + both tokens null → configured:false ───────────────────
  _r := public.get_mcp_connection_secret('e9c00000-0000-0000-0000-0000000000f4');
  IF (_r->>'configured') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION '(3) a bearer row with no tokens must stay configured:false, got: %', _r;
  END IF;

  -- ── (4) url-auth row with NO endpoint → configured:false (endpoint requirement unchanged) ──────
  _r := public.get_mcp_connection_secret('e9c00000-0000-0000-0000-0000000000f5');
  IF (_r->>'configured') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION '(4) a url-auth row with a null endpoint must stay configured:false, got: %', _r;
  END IF;

  RAISE NOTICE 'MCP_GW_URL_AUTH_CONFIGURED_PROVEN';
END $$;

ROLLBACK;
