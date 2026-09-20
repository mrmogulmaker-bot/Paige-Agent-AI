-- ============================================================================
-- Connected MCP Gateway — endpoint setter (INT-099 / MCP PR-2, DB proof).
--
-- Proves migration 20270329000000 at the DB layer:
--   • THE INVARIANT — changing the endpoint re-binds the secret from arguments (or NULL); the old
--     ciphertext is never inherited; the derived endpoint_hash follows; endpoint-bound approvals are
--     deleted by the 20270322000000 trigger THROUGH the setter; A→B→A does not resurrect them.
--   • A2 — authority is the `mcp.connections.manage` capability (owner/tenant-admin only); a platform
--     owner is REFUSED (capability gate when the tenant matches; scope guard on a foreign tenant); a
--     member, a cross-tenant owner, and a NULL actor (no service-role bypass) are all refused.
--   • D1 — a legacy-projected row is refused.
--   • A1 — a hashes-only audit row is written to paige_audit_log in the SAME transaction; if the audit
--     INSERT fails, the UPDATE does NOT commit.
--   • A3 — the return carries only connection_id/status/endpoint_hash/auth_token_last4 — no secret, no URL.
--   • A4 — the static URL validator rejects the unsafe shapes and accepts a public https endpoint.
--
-- Synthetic fixtures only; self-contained; ROLLS BACK. Seeds run as the superuser test role (RLS
-- bypassed); each setter call mocks the CALLER via request.jwt.claims so auth.uid() / the tenant
-- resolvers see a real actor. Any unexpected RAISE = fail (ON_ERROR_STOP); the terminal notice = pass.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/mcp_gateway_endpoint_setter.sql "$DB_URL"
-- ============================================================================
BEGIN;

-- Actors: owner / admin / member of tenant T; a platform super_admin (NOT a member of T); the owner of
-- a DIFFERENT tenant. A global 'coach' staff role on the member proves the §59 trap survives here too.
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('0e900000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mcpgw-es-owner@tests.invalid'),
  ('0e900000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mcpgw-es-admin@tests.invalid'),
  ('0e900000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mcpgw-es-member@tests.invalid'),
  ('0e900000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'mcpgw-es-super@tests.invalid'),
  ('0e900000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'mcpgw-es-otherowner@tests.invalid');

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('0e900000-0000-0000-0000-0000000000a1', 'mcpgw-es-t',     'MCPGW ES T',     'active', 'standalone', 'PXA', '{}'::jsonb),
  ('0e900000-0000-0000-0000-0000000000a2', 'mcpgw-es-other', 'MCPGW ES Other', 'active', 'standalone', 'PXB', '{}'::jsonb);

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('0e900000-0000-0000-0000-0000000000a1', '0e900000-0000-0000-0000-000000000001', 'owner',  'active', true,  now()),
  ('0e900000-0000-0000-0000-0000000000a1', '0e900000-0000-0000-0000-000000000002', 'admin',  'active', false, now()),
  ('0e900000-0000-0000-0000-0000000000a1', '0e900000-0000-0000-0000-000000000003', 'member', 'active', false, now()),
  ('0e900000-0000-0000-0000-0000000000a2', '0e900000-0000-0000-0000-000000000005', 'owner',  'active', true,  now());

INSERT INTO public.user_roles (user_id, role) VALUES
  ('0e900000-0000-0000-0000-000000000004', 'super_admin'),
  ('0e900000-0000-0000-0000-000000000003', 'coach')
ON CONFLICT DO NOTHING;

-- A NATIVE connection (legacy_source IS NULL) on T with an initial endpoint, a real secret, a granted
-- scope ceiling, and an endpoint-bound approval — everything the setter must re-bind / revoke.
INSERT INTO public.mcp_connections
  (connection_id, tenant_id, provider_key, label, server_url_ct, auth_kind, auth_token_ct, auth_token_last4, granted_scopes, status, health)
VALUES
  ('0e900000-0000-0000-0000-0000000000c1', '0e900000-0000-0000-0000-0000000000a1', 'generic-remote', 'es-native',
     public.platform_encrypt('https://mcp-init.example.com/rpc'), 'bearer',
     public.platform_encrypt('tok-initial-1234'), '1234', '{read,write}', 'connected', 'healthy');

-- A LEGACY-projected connection on T — the setter must refuse it (D1).
INSERT INTO public.mcp_connections
  (connection_id, tenant_id, provider_key, label, server_url_ct, auth_kind, legacy_source, legacy_provider)
VALUES
  ('0e900000-0000-0000-0000-0000000000c2', '0e900000-0000-0000-0000-0000000000a1', 'generic-remote', 'es-legacy',
     public.platform_encrypt('https://mcp-legacy.example.com/rpc'), 'bearer', 'tenant_mcp_connections', 'generic-remote');

-- An endpoint-bound approval on the native connection (proves revoke-on-change through the setter).
INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash)
VALUES ('0e900000-0000-0000-0000-0000000000c1', 'demo.tool', repeat('a',64),
        '0e900000-0000-0000-0000-000000000001',
        public._mcp_endpoint_hash('https://mcp-init.example.com/rpc'));

-- ── (A4) static URL validator matrix ─────────────────────────────────────────────────────────
DO $$
BEGIN
  -- ACCEPT: public https, with port, bracketed public IPv6.
  IF NOT public._mcp_endpoint_write_safe('https://api.example.com/mcp')        THEN RAISE EXCEPTION '(A4) public https must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://api.example.com:8443/mcp')   THEN RAISE EXCEPTION '(A4) public https:port must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://[2606:4700:4700::1111]/rpc') THEN RAISE EXCEPTION '(A4) public bracketed IPv6 must pass'; END IF;
  -- REJECT: scheme / userinfo.
  IF public._mcp_endpoint_write_safe('http://api.example.com/mcp')             THEN RAISE EXCEPTION '(A4) http must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://user:pass@api.example.com/mcp')  THEN RAISE EXCEPTION '(A4) userinfo must be rejected'; END IF;
  -- REJECT: names.
  IF public._mcp_endpoint_write_safe('https://localhost/mcp')                  THEN RAISE EXCEPTION '(A4) localhost must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://svc.local/mcp')                  THEN RAISE EXCEPTION '(A4) *.local must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://svc.internal/mcp')               THEN RAISE EXCEPTION '(A4) *.internal must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://svc.localhost/mcp')              THEN RAISE EXCEPTION '(A4) *.localhost must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://api.example.com./mcp')           THEN RAISE EXCEPTION '(A4) trailing-dot host must be rejected'; END IF;
  -- REJECT: private / loopback / link-local IPv4 literals.
  IF public._mcp_endpoint_write_safe('https://127.0.0.1/mcp')                  THEN RAISE EXCEPTION '(A4) 127/8 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://10.0.0.5/mcp')                   THEN RAISE EXCEPTION '(A4) 10/8 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://172.16.0.1/mcp')                 THEN RAISE EXCEPTION '(A4) 172.16/12 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://192.168.1.1/mcp')                THEN RAISE EXCEPTION '(A4) 192.168/16 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://169.254.169.254/latest')         THEN RAISE EXCEPTION '(A4) 169.254 metadata must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://0.0.0.0/mcp')                    THEN RAISE EXCEPTION '(A4) 0.0.0.0 must be rejected'; END IF;
  -- REJECT: encoded IPv4 (decimal / hex / octal).
  IF public._mcp_endpoint_write_safe('https://2130706433/mcp')                 THEN RAISE EXCEPTION '(A4) decimal-encoded IPv4 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://0x7f000001/mcp')                 THEN RAISE EXCEPTION '(A4) hex-encoded IPv4 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://0177.0.0.1/mcp')                 THEN RAISE EXCEPTION '(A4) octal-encoded IPv4 must be rejected'; END IF;
  -- REJECT: IPv6 loopback / mapped / ULA / link-local.
  IF public._mcp_endpoint_write_safe('https://[::1]/mcp')                      THEN RAISE EXCEPTION '(A4) ::1 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[::ffff:127.0.0.1]/mcp')         THEN RAISE EXCEPTION '(A4) IPv4-mapped IPv6 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[fc00::1]/mcp')                  THEN RAISE EXCEPTION '(A4) fc00::/7 must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[fd12::1]/mcp')                  THEN RAISE EXCEPTION '(A4) fd (ULA) must be rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[fe80::1]/mcp')                  THEN RAISE EXCEPTION '(A4) fe80::/10 must be rejected'; END IF;
END $$;

-- ── (INVARIANT + A3) admin changes the endpoint WITHOUT a new token: the old secret must NOT survive ──
DO $$
DECLARE _r jsonb; _row public.mcp_connections%ROWTYPE; _appr int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  _r := public.set_mcp_connection_endpoint(
          '0e900000-0000-0000-0000-0000000000c1', 'https://mcp-new1.example.com/rpc', 'none');

  -- A3: the return carries EXACTLY the write-only keys and NO secret / URL.
  IF (_r->>'connection_id') IS DISTINCT FROM '0e900000-0000-0000-0000-0000000000c1'
     OR (_r->>'status') IS DISTINCT FROM 'pending_verification'
     OR (_r->>'endpoint_hash') IS DISTINCT FROM public._mcp_endpoint_hash('https://mcp-new1.example.com/rpc')
     OR (_r ? 'auth_token_last4') IS NOT TRUE
     OR (_r->>'auth_token_last4') IS NOT NULL THEN
    RAISE EXCEPTION '(A3) unexpected return: %', _r;
  END IF;
  IF (_r ? 'server_url') OR (_r ? 'auth_token') OR (_r ? 'refresh_token') OR (_r ? 'oauth_client_secret') THEN
    RAISE EXCEPTION '(A3) return leaked secret/url material: %', _r;
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(_r)) <> 4 THEN
    RAISE EXCEPTION '(A3) return must have exactly 4 keys: %', _r;
  END IF;

  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  -- INVARIANT: the new endpoint did NOT inherit the old secret.
  IF _row.auth_token_ct IS NOT NULL          THEN RAISE EXCEPTION 'invariant: old auth_token_ct survived a re-bind'; END IF;
  IF _row.auth_token_last4 IS NOT NULL        THEN RAISE EXCEPTION 'invariant: old auth_token_last4 survived'; END IF;
  IF _row.refresh_token_ct IS NOT NULL        THEN RAISE EXCEPTION 'invariant: old refresh_token_ct survived'; END IF;
  IF _row.oauth_client_secret_ct IS NOT NULL  THEN RAISE EXCEPTION 'invariant: old oauth_client_secret_ct survived'; END IF;
  IF _row.granted_scopes <> '{}'              THEN RAISE EXCEPTION 'invariant: granted scope ceiling not reset'; END IF;
  IF _row.auth_kind <> 'none'                 THEN RAISE EXCEPTION 'invariant: auth_kind not updated'; END IF;
  IF _row.status <> 'pending_verification' OR _row.health <> 'unknown' THEN RAISE EXCEPTION 'invariant: status/health not reset'; END IF;
  IF public.platform_decrypt(_row.server_url_ct) <> 'https://mcp-new1.example.com/rpc' THEN RAISE EXCEPTION 'invariant: endpoint not updated'; END IF;

  -- the endpoint-bound approval was revoked by the trigger THROUGH the setter.
  SELECT count(*) INTO _appr FROM public.mcp_connection_approvals WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  IF _appr <> 0 THEN RAISE EXCEPTION 'consent not revoked on endpoint change: % approvals remain', _appr; END IF;
END $$;

-- ── (A1) the audit row exists, hashes/enums only, no URL/token ──────────────────────────────────
DO $$
DECLARE _p jsonb;
BEGIN
  SELECT payload INTO _p FROM public.paige_audit_log
    WHERE action = 'mcp_connection.endpoint_changed'
      AND target_type = 'mcp_connections'
      AND target_id = '0e900000-0000-0000-0000-0000000000c1'
      AND actor_user_id = '0e900000-0000-0000-0000-000000000002'
    ORDER BY created_at DESC LIMIT 1;
  IF _p IS NULL THEN RAISE EXCEPTION '(A1) no audit row was written'; END IF;
  IF (_p->>'old_endpoint_hash') IS DISTINCT FROM public._mcp_endpoint_hash('https://mcp-init.example.com/rpc') THEN
    RAISE EXCEPTION '(A1) old_endpoint_hash wrong: %', _p; END IF;
  IF (_p->>'new_endpoint_hash') IS DISTINCT FROM public._mcp_endpoint_hash('https://mcp-new1.example.com/rpc') THEN
    RAISE EXCEPTION '(A1) new_endpoint_hash wrong: %', _p; END IF;
  IF (_p->>'auth_kind_before') IS DISTINCT FROM 'bearer' OR (_p->>'auth_kind_after') IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION '(A1) auth_kind before/after wrong: %', _p; END IF;
  -- hashes/enums ONLY — no endpoint URL, no token substring anywhere in the payload.
  IF _p::text ~* 'mcp-init\.example|mcp-new1\.example|https://|tok-initial' THEN
    RAISE EXCEPTION '(A1) audit payload leaked a URL/token: %', _p; END IF;
END $$;

-- ── (INVARIANT: A→B→A no resurrection) re-seed an approval on the current endpoint, change back to the
--    original endpoint, and prove NEITHER the new approval NOR the original is present ────────────────
DO $$
DECLARE _appr int;
BEGIN
  INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash)
  VALUES ('0e900000-0000-0000-0000-0000000000c1', 'demo.tool', repeat('b',64),
          '0e900000-0000-0000-0000-000000000001',
          public._mcp_endpoint_hash('https://mcp-new1.example.com/rpc'));

  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  PERFORM public.set_mcp_connection_endpoint(
            '0e900000-0000-0000-0000-0000000000c1', 'https://mcp-init.example.com/rpc', 'none');  -- back to the ORIGINAL

  SELECT count(*) INTO _appr FROM public.mcp_connection_approvals WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  IF _appr <> 0 THEN RAISE EXCEPTION 'A→B→A resurrected an approval: % remain', _appr; END IF;
END $$;

-- ── (ROTATE) supplying a new token stores it (last4 updated); endpoint_hash follows ────────────────
DO $$
DECLARE _r jsonb; _row public.mcp_connections%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  _r := public.set_mcp_connection_endpoint(
          '0e900000-0000-0000-0000-0000000000c1', 'https://mcp-new2.example.com/rpc', 'bearer', 'rot-token-9999');
  IF (_r->>'auth_token_last4') IS DISTINCT FROM '9999' THEN RAISE EXCEPTION '(rotate) last4 not updated: %', _r; END IF;
  IF (_r->>'endpoint_hash') IS DISTINCT FROM public._mcp_endpoint_hash('https://mcp-new2.example.com/rpc') THEN
    RAISE EXCEPTION '(rotate) endpoint_hash wrong: %', _r; END IF;
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  IF _row.auth_token_ct IS NULL THEN RAISE EXCEPTION '(rotate) new token not stored'; END IF;
  IF public.platform_decrypt(_row.auth_token_ct) <> 'rot-token-9999' THEN RAISE EXCEPTION '(rotate) wrong token stored'; END IF;
END $$;

-- ── (A2 + §9 + no-bypass) refusals; each must RAISE and leave the endpoint unchanged ───────────────
DO $$
DECLARE _before text; _after text; _raised boolean;
BEGIN
  -- capture the endpoint before the refusal battery
  SELECT public._mcp_endpoint_hash(public.platform_decrypt(server_url_ct)) INTO _before
    FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';

  -- (a) ordinary member (with a global staff role, §59) — no `manage`.
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000003","role":"authenticated"}', true);
  _raised := false;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  IF NOT _raised THEN RAISE EXCEPTION '(A2a) a member must be refused'; END IF;

  -- (b) platform owner, tenant MATCHES the connection → refused at the CAPABILITY gate (manage excludes platform owner).
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000004","role":"authenticated"}', true);
  _raised := false;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none',
                                                   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'0e900000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  IF NOT _raised THEN RAISE EXCEPTION '(A2b) a platform owner (not tenant admin) must be refused for manage'; END IF;

  -- (c) platform owner, no tenant given → resolves to no tenant → refused at the SCOPE guard (foreign tenant).
  _raised := false;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  IF NOT _raised THEN RAISE EXCEPTION '(A2c) a platform owner resolving a foreign tenant must be refused'; END IF;

  -- (d) owner of a DIFFERENT tenant → cross-tenant scope refusal (§9).
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000005","role":"authenticated"}', true);
  _raised := false;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  IF NOT _raised THEN RAISE EXCEPTION '(A2d) a cross-tenant owner must be refused'; END IF;

  -- (e) NULL actor (service-role / no JWT) even naming the tenant → {} caps → refused (no service-role bypass).
  PERFORM set_config('request.jwt.claims', '', true);
  _raised := false;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none',
                                                   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'0e900000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  IF NOT _raised THEN RAISE EXCEPTION '(A2e) a NULL actor must be refused (no service-role bypass)'; END IF;

  -- none of the refusals may have changed the endpoint.
  SELECT public._mcp_endpoint_hash(public.platform_decrypt(server_url_ct)) INTO _after
    FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  IF _before IS DISTINCT FROM _after THEN RAISE EXCEPTION 'a refused call changed the endpoint'; END IF;
END $$;

-- ── (D1) a legacy-projected row is refused even for a legitimate admin ─────────────────────────────
DO $$
DECLARE _raised boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c2','https://mcp-x.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  IF NOT _raised THEN RAISE EXCEPTION '(D1) a legacy-projected connection must be refused'; END IF;
END $$;

-- ── (A1) audit-fails ⇒ UPDATE-does-not-commit ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._es_test_fail_audit() RETURNS trigger
  LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'FORCED_AUDIT_FAIL'; END $fn$;
CREATE TRIGGER _es_test_force_audit_fail
  BEFORE INSERT ON public.paige_audit_log
  FOR EACH ROW WHEN (NEW.action = 'mcp_connection.endpoint_changed')
  EXECUTE FUNCTION public._es_test_fail_audit();

DO $$
DECLARE _before text; _after text; _raised boolean := false;
BEGIN
  SELECT public._mcp_endpoint_hash(public.platform_decrypt(server_url_ct)) INTO _before
    FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://mcp-should-not-stick.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  IF NOT _raised THEN RAISE EXCEPTION '(A1-abort) a failing audit must abort the setter'; END IF;
  SELECT public._mcp_endpoint_hash(public.platform_decrypt(server_url_ct)) INTO _after
    FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  IF _before IS DISTINCT FROM _after THEN RAISE EXCEPTION '(A1-abort) the UPDATE committed despite a failed audit'; END IF;
END $$;

DROP TRIGGER _es_test_force_audit_fail ON public.paige_audit_log;
DROP FUNCTION public._es_test_fail_audit();

DO $$ BEGIN RAISE NOTICE 'MCP_GW_ENDPOINT_SETTER_PROVEN'; END $$;

ROLLBACK;
