-- ============================================================================
-- Connected MCP Gateway — endpoint setter (INT-099 / MCP PR-2, DB proof).
--
-- Proves migration 20270329000000 at the DB layer:
--   • THE INVARIANT — changing the endpoint re-binds the secret from arguments (or NULL); the old
--     ciphertext is never inherited; the derived endpoint_hash follows; endpoint-bound approvals are
--     deleted THROUGH the setter; A→B→A does not resurrect them; and provider_state + the
--     discovered-tool catalog are reset (nothing operational carries over).
--   • item 1 (UNCONDITIONAL revocation) — a SAME-URL credential rotation (which the 20270322000000
--     URL-change trigger does NOT catch) STILL revokes the endpoint-bound approval + clears the tool
--     catalog, and a REJECTED rebind deletes NOTHING.
--   • credential bundle (round-3 F1/F2/F3 + round-4) — the bundle must match auth_kind AND be
--     LOADER-usable (makeRpcConnectionLoader). PARITY MATRIX (accept_*/reject_* case names identical to
--     the loader-driven parity proof in scripts/mcp-gateway-smoke.mjs): accept header/bearer/oauth/url/
--     none; reject a reserved/bad-grammar header name + header-no-name (F1), a refresh-ONLY oauth bundle
--     (F3), an EXPIRED oauth token (round-4, MCP_OAUTH_TOKEN_EXPIRED), api_key (round-4, NOT in the
--     loader's MCP_EXECUTABLE_AUTH_KINDS → MCP_AUTH_KIND_NOT_EXECUTABLE), and stray cross-scheme fields
--     per kind (F2). api_key is NO LONGER accepted.
--   • credential_changed (round-3 F4) — a same-URL rebind that changes only the header NAME (token
--     unchanged) audits credential_changed=true (round-2 compared only the token).
--   • A2 — authority is the `mcp.connections.manage` capability (owner/tenant-admin only); a platform
--     owner is REFUSED; a member, a cross-tenant owner, and a NULL actor (no service-role bypass) are
--     all refused — each with the EXPECTED refusal reason pinned (not merely "some error").
--   • §9 — authority is resolved BEFORE the connection is read: a member is refused at the capability
--     gate; a cross-tenant owner at the uniform connection-in-tenant guard.
--   • D1 — a legacy-projected row is refused (for a legitimate admin, with the distinct legacy code).
--   • A1 — an audit row (hashes/enums/booleans/COUNTS only: old/new endpoint_hash, endpoint_changed,
--     credential_changed, auth_kind + auth_token_last4 before/after, approvals_revoked, tools_cleared)
--     is written to paige_audit_log in the SAME transaction; if the audit INSERT fails, the UPDATE does
--     NOT commit; no URL/token substring appears in the payload.
--   • A3 — the return carries only connection_id/status/endpoint_hash/auth_token_last4 — no secret, no URL.
--   • A4 — the static URL validator classifies IP literals by VALUE (inet), catching expanded IPv6,
--     shorthand/encoded IPv4, and the full private/reserved ranges — not just canonical spellings —
--     (P2b) enforces DNS-name syntax so whitespace/control/percent-encoding/over-length hosts reject,
--     and (round-4) rejects a bracketed IPv4 authority ([8.8.8.8]) since brackets are IPv6-only.
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
-- scope ceiling, provider_state, and an endpoint-bound approval + a discovered tool — everything the
-- setter must re-bind / reset / revoke.
INSERT INTO public.mcp_connections
  (connection_id, tenant_id, provider_key, label, server_url_ct, auth_kind, auth_token_ct, auth_token_last4,
   granted_scopes, provider_state, status, health, last_checked_at)
VALUES
  ('0e900000-0000-0000-0000-0000000000c1', '0e900000-0000-0000-0000-0000000000a1', 'generic-remote', 'es-native',
     public.platform_encrypt('https://mcp-init.example.com/rpc'), 'bearer',
     public.platform_encrypt('tok-initial-1234'), '1234', '{read,write}',
     '{"n8n_generation": 5}'::jsonb, 'connected', 'healthy', now());

-- A LEGACY-projected connection on T — the setter must refuse it (D1).
INSERT INTO public.mcp_connections
  (connection_id, tenant_id, provider_key, label, server_url_ct, auth_kind, legacy_source, legacy_provider)
VALUES
  ('0e900000-0000-0000-0000-0000000000c2', '0e900000-0000-0000-0000-0000000000a1', 'generic-remote', 'es-legacy',
     public.platform_encrypt('https://mcp-legacy.example.com/rpc'), 'bearer', 'tenant_mcp_connections', 'generic-remote');

-- An endpoint-bound approval + a discovered tool on the native connection (proves revoke + catalog
-- reset through the setter).
INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash)
VALUES ('0e900000-0000-0000-0000-0000000000c1', 'demo.tool', repeat('a',64),
        '0e900000-0000-0000-0000-000000000001',
        public._mcp_endpoint_hash('https://mcp-init.example.com/rpc'));
INSERT INTO public.mcp_connection_tools (connection_id, tool_name, schema_hash)
VALUES ('0e900000-0000-0000-0000-0000000000c1', 'demo.tool', repeat('a',64));

-- ── (A4) static URL validator matrix — value-based, notation-agnostic ──────────────────────────
DO $$
BEGIN
  -- ACCEPT: public https, with port, bracketed public IPv6, public dotted-quad, host with digits,
  -- and a dotted-quad just OUTSIDE a private block (172.32/16 is public; 172.16/12 is not).
  IF NOT public._mcp_endpoint_write_safe('https://api.example.com/mcp')        THEN RAISE EXCEPTION '(A4) public https must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://api.example.com:8443/mcp')   THEN RAISE EXCEPTION '(A4) public https:port must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://[2606:4700:4700::1111]/rpc') THEN RAISE EXCEPTION '(A4) public bracketed IPv6 must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://[2606:4700:4700::1111]:8443/rpc') THEN RAISE EXCEPTION '(A4) public bracketed IPv6 with port must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://8.8.8.8/mcp')                THEN RAISE EXCEPTION '(A4) public dotted-quad must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://172.32.0.1/mcp')             THEN RAISE EXCEPTION '(A4) 172.32/16 is public and must pass'; END IF;
  IF NOT public._mcp_endpoint_write_safe('https://api2.example.com/mcp')       THEN RAISE EXCEPTION '(A4) host with a digit must pass'; END IF;
  -- REJECT: scheme / userinfo.
  IF public._mcp_endpoint_write_safe('http://api.example.com/mcp')             THEN RAISE EXCEPTION '(A4) http rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://user:pass@api.example.com/mcp')  THEN RAISE EXCEPTION '(A4) userinfo rejected'; END IF;
  -- REJECT: malformed / out-of-range ports (must not be silently dropped before the destructive reset).
  IF public._mcp_endpoint_write_safe('https://api.example.com:notaport/mcp')   THEN RAISE EXCEPTION '(A4) non-numeric port rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://api.example.com:99999/mcp')      THEN RAISE EXCEPTION '(A4) out-of-range port rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://api.example.com:0/mcp')          THEN RAISE EXCEPTION '(A4) port 0 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[2606:4700:4700::1111]:bad/rpc') THEN RAISE EXCEPTION '(A4) bracketed non-numeric port rejected'; END IF;
  -- REJECT: names.
  IF public._mcp_endpoint_write_safe('https://localhost/mcp')                  THEN RAISE EXCEPTION '(A4) localhost rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://svc.local/mcp')                  THEN RAISE EXCEPTION '(A4) *.local rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://svc.internal/mcp')               THEN RAISE EXCEPTION '(A4) *.internal rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://svc.localhost/mcp')              THEN RAISE EXCEPTION '(A4) *.localhost rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://api.example.com./mcp')           THEN RAISE EXCEPTION '(A4) trailing-dot rejected'; END IF;
  -- REJECT: private / loopback / link-local / CGNAT / benchmark / 6to4 / protocol / multicast / reserved IPv4.
  IF public._mcp_endpoint_write_safe('https://127.0.0.1/mcp')                  THEN RAISE EXCEPTION '(A4) 127/8 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://10.0.0.5/mcp')                   THEN RAISE EXCEPTION '(A4) 10/8 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://172.16.0.1/mcp')                 THEN RAISE EXCEPTION '(A4) 172.16/12 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://192.168.1.1/mcp')                THEN RAISE EXCEPTION '(A4) 192.168/16 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://169.254.169.254/latest')         THEN RAISE EXCEPTION '(A4) 169.254 metadata rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://0.0.0.0/mcp')                    THEN RAISE EXCEPTION '(A4) 0.0.0.0 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://100.64.0.1/mcp')                 THEN RAISE EXCEPTION '(A4) CGNAT 100.64/10 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://198.18.0.1/mcp')                 THEN RAISE EXCEPTION '(A4) benchmark 198.18/15 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://192.0.0.1/mcp')                  THEN RAISE EXCEPTION '(A4) 192.0.0/24 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://192.88.99.1/mcp')                THEN RAISE EXCEPTION '(A4) 6to4 192.88.99/24 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://255.255.255.255/mcp')            THEN RAISE EXCEPTION '(A4) broadcast rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://224.0.0.1/mcp')                  THEN RAISE EXCEPTION '(A4) multicast 224/4 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://240.0.0.1/mcp')                  THEN RAISE EXCEPTION '(A4) reserved 240/4 rejected'; END IF;
  -- REJECT: encoded / shorthand IPv4 (decimal / hex / octal / 2-/3-part).
  IF public._mcp_endpoint_write_safe('https://2130706433/mcp')                 THEN RAISE EXCEPTION '(A4) decimal-encoded IPv4 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://0x7f000001/mcp')                 THEN RAISE EXCEPTION '(A4) hex-encoded IPv4 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://0177.0.0.1/mcp')                 THEN RAISE EXCEPTION '(A4) octal-encoded IPv4 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://127.1/mcp')                      THEN RAISE EXCEPTION '(A4) 2-part shorthand rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://10.1/mcp')                       THEN RAISE EXCEPTION '(A4) 2-part shorthand rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://192.168.1/mcp')                  THEN RAISE EXCEPTION '(A4) 3-part shorthand rejected'; END IF;
  -- REJECT (round-4): a bracketed IPv4 authority — brackets are IPv6-only; WHATWG new URL() rejects it,
  -- so the setter must too (family(_ip)=6). A public-looking IPv4 inside brackets must NOT slip through.
  IF public._mcp_endpoint_write_safe('https://[8.8.8.8]/mcp')                  THEN RAISE EXCEPTION '(A4) bracketed IPv4 [8.8.8.8] rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[8.8.8.8]:443/mcp')              THEN RAISE EXCEPTION '(A4) bracketed IPv4 with port rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[8.8.8.8.8]/mcp')                THEN RAISE EXCEPTION '(A4) malformed bracketed literal rejected'; END IF;
  -- REJECT: IPv6 loopback / mapped / ULA / link-local / multicast — canonical AND expanded spellings.
  IF public._mcp_endpoint_write_safe('https://[::1]/mcp')                      THEN RAISE EXCEPTION '(A4) ::1 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[0:0:0:0:0:0:0:1]/mcp')          THEN RAISE EXCEPTION '(A4) expanded ::1 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[::ffff:127.0.0.1]/mcp')         THEN RAISE EXCEPTION '(A4) IPv4-mapped rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[0:0:0:0:0:ffff:127.0.0.1]/mcp') THEN RAISE EXCEPTION '(A4) expanded IPv4-mapped rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[fc00::1]/mcp')                  THEN RAISE EXCEPTION '(A4) fc00::/7 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[fd12::1]/mcp')                  THEN RAISE EXCEPTION '(A4) fd (ULA) rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[fe80::1]/mcp')                  THEN RAISE EXCEPTION '(A4) fe80::/10 rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://[ff02::1]/mcp')                  THEN RAISE EXCEPTION '(A4) IPv6 multicast rejected'; END IF;
  -- ACCEPT: a hyphenated multi-label public hostname (proves the DNS-syntax gate does not over-reject).
  IF NOT public._mcp_endpoint_write_safe('https://api-v2.example.co.uk/mcp')   THEN RAISE EXCEPTION '(A4/P2b) hyphenated multi-label host must pass'; END IF;
  -- REJECT (P2b): host syntax a runtime new URL(...) would refuse — whitespace, control char, percent-
  -- encoding, and an over-length (>253) host — none may reach the destructive reset.
  IF public._mcp_endpoint_write_safe('https://api example.com/mcp')            THEN RAISE EXCEPTION '(A4/P2b) whitespace in host rejected'; END IF;
  IF public._mcp_endpoint_write_safe(E'https://api\tsvc.example.com/mcp')       THEN RAISE EXCEPTION '(A4/P2b) control char in host rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://api%2Eexample.com/mcp')          THEN RAISE EXCEPTION '(A4/P2b) percent-encoding in host rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://' || repeat('a.', 130) || 'example.com/mcp') THEN RAISE EXCEPTION '(A4/P2b) over-length host rejected'; END IF;
  IF public._mcp_endpoint_write_safe('https://exa_mple.example.com/mcp')       THEN RAISE EXCEPTION '(A4/P2b) underscore (outside DNS label charset) rejected'; END IF;
END $$;

-- ── (INVARIANT + A3 + reset) admin changes the endpoint WITHOUT a new token: the old secret must NOT
--    survive; provider_state + tool catalog reset; approval revoked; return write-only ────────────────
DO $$
DECLARE _r jsonb; _row public.mcp_connections%ROWTYPE; _appr int; _tools int;
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
  IF _row.provider_state <> '{}'::jsonb       THEN RAISE EXCEPTION 'invariant: provider_state not reset'; END IF;
  IF _row.last_checked_at IS NOT NULL          THEN RAISE EXCEPTION 'invariant: last_checked_at (old observation time) not reset'; END IF;
  IF _row.auth_kind <> 'none'                 THEN RAISE EXCEPTION 'invariant: auth_kind not updated'; END IF;
  IF _row.status <> 'pending_verification' OR _row.health <> 'unknown' THEN RAISE EXCEPTION 'invariant: status/health not reset'; END IF;
  IF public.platform_decrypt(_row.server_url_ct) <> 'https://mcp-new1.example.com/rpc' THEN RAISE EXCEPTION 'invariant: endpoint not updated'; END IF;

  -- the endpoint-bound approval was revoked by the trigger THROUGH the setter, and the stale tool
  -- catalog was cleared.
  SELECT count(*) INTO _appr  FROM public.mcp_connection_approvals WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  SELECT count(*) INTO _tools FROM public.mcp_connection_tools     WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  IF _appr  <> 0 THEN RAISE EXCEPTION 'consent not revoked on endpoint change: % approvals remain', _appr; END IF;
  IF _tools <> 0 THEN RAISE EXCEPTION 'stale tool catalog not cleared on endpoint change: % tools remain', _tools; END IF;
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
  -- round-2 item 4: expanded payload — change flags, last4 before/after, and the pre-UPDATE row counts.
  -- The init→new1 change: endpoint changed (init≠new1), credential changed (tok-initial → NULL),
  -- last4 1234 → null, and the one seeded approval + one seeded tool were revoked/cleared.
  IF (_p->>'endpoint_changed') IS DISTINCT FROM 'true'      THEN RAISE EXCEPTION '(A1) endpoint_changed wrong: %', _p; END IF;
  IF (_p->>'credential_changed') IS DISTINCT FROM 'true'    THEN RAISE EXCEPTION '(A1) credential_changed wrong: %', _p; END IF;
  IF (_p->>'auth_token_last4_before') IS DISTINCT FROM '1234' THEN RAISE EXCEPTION '(A1) last4_before wrong: %', _p; END IF;
  IF (_p ? 'auth_token_last4_after') IS NOT TRUE OR (_p->>'auth_token_last4_after') IS NOT NULL THEN
    RAISE EXCEPTION '(A1) last4_after must be present and null: %', _p; END IF;
  IF (_p->>'approvals_revoked') IS DISTINCT FROM '1'        THEN RAISE EXCEPTION '(A1) approvals_revoked wrong: %', _p; END IF;
  IF (_p->>'tools_cleared') IS DISTINCT FROM '1'            THEN RAISE EXCEPTION '(A1) tools_cleared wrong: %', _p; END IF;
  -- hashes/enums/counts ONLY — no endpoint URL, no token substring anywhere in the payload.
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

-- ── (round-3 F1/F2/F3 + round-4) credential-bundle validation per auth_kind — the PARITY MATRIX. Case
--    names here are IDENTICAL to the runtime-parity proof in scripts/mcp-gateway-smoke.mjs (item 5),
--    which drives the REAL makeRpcConnectionLoader: every accept_* here is proven loader-USABLE there;
--    every reject_* here is proven loader-UNUSABLE there. A reject RAISEs its closed code before any
--    write (MCP_BAD_CREDENTIAL_BUNDLE, or the round-4 distinct codes MCP_AUTH_KIND_NOT_EXECUTABLE /
--    MCP_OAUTH_TOKEN_EXPIRED); an accept stores the matching columns. Extra SQL-stricter rejects (stray
--    fields) are covered too. api_key is NO LONGER an accept case (round-4 — loader-unexecutable). ────
DO $$
DECLARE _msg text; _row public.mcp_connections%ROWTYPE;
  C uuid := '0e900000-0000-0000-0000-0000000000c1';
  BAD text := 'https://cred-reject.example.com/rpc';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);

  -- ===== REJECT cases (parity: runtime-UNUSABLE ⇒ SQL rejects) =====
  -- reject_header_reserved (F1): a reserved header name the transport sets itself.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'header', 'tok', 'Authorization');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'reject_header_reserved must reject, got: %', _msg; END IF;
  -- reject_header_bad_grammar (F1): a name outside the RFC 9110 token grammar.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'header', 'tok', 'Bad Header');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'reject_header_bad_grammar must reject, got: %', _msg; END IF;
  -- reject_bearer_no_token: no token.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'bearer');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'reject_bearer_no_token must reject, got: %', _msg; END IF;
  -- reject_api_key (round-4): api_key is a recognized kind the loader cannot execute (not in
  -- MCP_EXECUTABLE_AUTH_KINDS, connection.ts:58) — REJECTED with the DISTINCT code even WITH a valid token.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'api_key', 'tok-k');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_AUTH_KIND_NOT_EXECUTABLE%' THEN RAISE EXCEPTION 'reject_api_key must reject with NOT_EXECUTABLE, got: %', _msg; END IF;
  -- reject_oauth_no_token (F3): a refresh-ONLY oauth bundle — the runtime has no refresh step and
  -- would load it as connection_unusable.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'oauth', NULL, NULL, 'refresh-only', 'https://iss.example.com', 'cid');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'reject_oauth_no_token (refresh-only) must reject, got: %', _msg; END IF;
  -- reject_oauth_expired (round-4): a full oauth bundle whose access token is already expired — the
  -- loader''s oauthExpired (connection.ts:118) would mark it connection_unusable.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'oauth', 'tok', NULL, NULL, 'https://iss.example.com', 'cid', NULL, NULL, now() - interval '1 minute');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_OAUTH_TOKEN_EXPIRED%' THEN RAISE EXCEPTION 'reject_oauth_expired must reject with OAUTH_TOKEN_EXPIRED, got: %', _msg; END IF;

  -- reject_header_no_name (parity: the loader's headerRowNotHeaderAuth → connection_unusable): a header
  -- row with no name falls through to bearer at the loader, so the setter refuses it.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'header', 'tok', NULL);
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'reject_header_no_name must reject, got: %', _msg; END IF;

  -- ===== extra SQL-stricter rejects (not in the runtime-unusable parity set, but hardening) =====
  -- header with no token.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'header', NULL, 'X-Api-Key');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'header w/o token must reject, got: %', _msg; END IF;
  -- oauth missing issuer / client_id (token present).
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'oauth', 'tok', NULL, NULL, NULL, 'cid');
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'oauth w/o issuer must reject, got: %', _msg; END IF;
  -- F2 stray-field rejects: a field belonging to another scheme, per kind.
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'bearer', 'tok', NULL, 'stray-refresh');  -- bearer + refresh
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'F2 bearer+stray-refresh must reject, got: %', _msg; END IF;
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'bearer', 'tok', NULL, NULL, 'https://iss.example.com');  -- bearer + oauth issuer
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'F2 bearer+stray-oauth must reject, got: %', _msg; END IF;
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'header', 'tok', 'X-Api-Key', NULL, 'https://iss.example.com', 'cid');  -- header + oauth
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'F2 header+stray-oauth must reject, got: %', _msg; END IF;
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'oauth', 'tok', 'X-Stray', NULL, 'https://iss.example.com', 'cid');  -- oauth + header name
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'F2 oauth+stray-header must reject, got: %', _msg; END IF;
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'url', 'stray-tok');  -- url + token
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'F2 url+stray-token must reject, got: %', _msg; END IF;
  _msg := NULL; BEGIN PERFORM public.set_mcp_connection_endpoint(C, BAD, 'none', NULL, 'X-Stray');  -- none + header name
    EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION 'F2 none+stray-header must reject, got: %', _msg; END IF;

  -- no reject may have changed the endpoint (all failed before the write).
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = C;
  IF public.platform_decrypt(_row.server_url_ct) = BAD THEN RAISE EXCEPTION '(bundle) a rejected call changed the endpoint'; END IF;

  -- ===== ACCEPT cases (parity: SQL accepts ⇒ runtime-USABLE) =====
  -- accept_header (a runtime-usable custom name + token).
  PERFORM public.set_mcp_connection_endpoint(C, 'https://cred-header.example.com/rpc', 'header', 'tok-h', 'X-Api-Key');
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = C;
  IF _row.auth_kind <> 'header' OR _row.auth_header_name <> 'X-Api-Key'
     OR public.platform_decrypt(_row.auth_token_ct) <> 'tok-h' THEN RAISE EXCEPTION 'accept_header did not store the bundle'; END IF;

  -- accept_bearer.
  PERFORM public.set_mcp_connection_endpoint(C, 'https://cred-bearer.example.com/rpc', 'bearer', 'tok-b');
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = C;
  IF _row.auth_kind <> 'bearer' OR public.platform_decrypt(_row.auth_token_ct) <> 'tok-b' THEN RAISE EXCEPTION 'accept_bearer did not store the token'; END IF;

  -- accept_oauth (F3: token REQUIRED + issuer + client_id; refresh optional-additional). A FUTURE
  -- access_token_expires_at is accepted (round-4: only an already-expired token is rejected).
  PERFORM public.set_mcp_connection_endpoint(C, 'https://cred-oauth.example.com/rpc', 'oauth',
            'tok-o', NULL, 'refresh-o', 'https://iss.example.com', 'cid-2', 'sec', ARRAY['read']::text[], now() + interval '1 hour');
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = C;
  IF _row.auth_kind <> 'oauth' OR public.platform_decrypt(_row.auth_token_ct) <> 'tok-o'
     OR _row.oauth_issuer <> 'https://iss.example.com' OR _row.oauth_client_id <> 'cid-2'
     OR public.platform_decrypt(_row.refresh_token_ct) <> 'refresh-o' THEN RAISE EXCEPTION 'accept_oauth did not store the bundle'; END IF;

  -- accept_url (no credential material).
  PERFORM public.set_mcp_connection_endpoint(C, 'https://cred-url.example.com/rpc', 'url');
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = C;
  IF _row.auth_kind <> 'url' OR _row.auth_token_ct IS NOT NULL OR _row.auth_header_name IS NOT NULL THEN
    RAISE EXCEPTION 'accept_url must carry no credential'; END IF;

  -- accept_none.
  PERFORM public.set_mcp_connection_endpoint(C, 'https://cred-none.example.com/rpc', 'none');
  SELECT * INTO _row FROM public.mcp_connections WHERE connection_id = C;
  IF _row.auth_kind <> 'none' OR _row.auth_token_ct IS NOT NULL THEN RAISE EXCEPTION 'accept_none must carry no credential'; END IF;
END $$;

-- ── (round-3 F4) credential_changed reflects a NON-TOKEN credential field. A same-URL rebind that keeps
--    the token but changes the header NAME must audit credential_changed=true (the round-2 code compared
--    only the token and would have said false) ────────────────────────────────────────────────────────
DO $$
DECLARE _p jsonb; C uuid := '0e900000-0000-0000-0000-0000000000c1'; U text := 'https://cred-f4.example.com/rpc';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  -- baseline: header at U with X-Api-Key + tok-f4.
  PERFORM public.set_mcp_connection_endpoint(C, U, 'header', 'tok-f4', 'X-Api-Key');
  -- same URL, SAME token, DIFFERENT header name.
  PERFORM public.set_mcp_connection_endpoint(C, U, 'header', 'tok-f4', 'X-Other-Key');
  -- filter by the UNIQUE new_endpoint_hash (created_at is transaction-time, so it cannot order rows here).
  SELECT payload INTO _p FROM public.paige_audit_log
    WHERE action = 'mcp_connection.endpoint_changed' AND target_id = C
      AND (payload->>'new_endpoint_hash') = public._mcp_endpoint_hash(U)
      AND (payload->>'endpoint_changed') = 'false'
    LIMIT 1;
  IF _p IS NULL THEN RAISE EXCEPTION '(F4) no same-URL header-name-change audit row found'; END IF;
  IF (_p->>'credential_changed') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '(F4) credential_changed must be true when only the header name changed: %', _p; END IF;
END $$;

-- ── (item 1) UNCONDITIONAL approval revocation: a SAME-URL credential rotation (which the shipped
--    20270322000000 trigger does NOT catch — it fires only on a URL change) must STILL drop the
--    endpoint-bound approval, and a REJECTED rebind must delete NOTHING ─────────────────────────────────
DO $$
DECLARE _appr int; _tools int; _p jsonb; _msg text;
  C uuid := '0e900000-0000-0000-0000-0000000000c1';
  U text := 'https://mcp-rev.example.com/rpc';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);

  -- Baseline: bind to U with a first token (this rebind clears any prior approvals/tools).
  PERFORM public.set_mcp_connection_endpoint(C, U, 'bearer', 'tok-rev-1');
  -- Seed an approval + a tool bound to U (endpoint unchanged on the next call).
  INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash)
  VALUES (C, 'rev.tool', repeat('c',64), '0e900000-0000-0000-0000-000000000001', public._mcp_endpoint_hash(U));
  INSERT INTO public.mcp_connection_tools (connection_id, tool_name, schema_hash)
  VALUES (C, 'rev.tool', repeat('c',64));

  -- SAME URL, DIFFERENT token — a pure credential rotation. The URL-change trigger will NOT fire.
  PERFORM public.set_mcp_connection_endpoint(C, U, 'bearer', 'tok-rev-2');

  SELECT count(*) INTO _appr  FROM public.mcp_connection_approvals WHERE connection_id = C;
  SELECT count(*) INTO _tools FROM public.mcp_connection_tools     WHERE connection_id = C;
  IF _appr  <> 0 THEN RAISE EXCEPTION '(item1) same-URL rotation did NOT revoke approvals: % remain', _appr; END IF;
  IF _tools <> 0 THEN RAISE EXCEPTION '(item1) same-URL rotation did NOT clear the tool catalog: % remain', _tools; END IF;

  -- The audit for THIS rotation records it faithfully. Filter by the UNIQUE new_endpoint_hash for U
  -- (created_at is transaction-time and cannot order rows; other blocks also write endpoint_changed=false).
  SELECT payload INTO _p FROM public.paige_audit_log
    WHERE action = 'mcp_connection.endpoint_changed' AND target_id = C
      AND (payload->>'new_endpoint_hash') = public._mcp_endpoint_hash(U)
      AND (payload->>'endpoint_changed') = 'false'
    LIMIT 1;
  IF _p IS NULL THEN RAISE EXCEPTION '(item1) no same-URL-rotation audit row found'; END IF;
  IF (_p->>'credential_changed') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '(item1) rotation credential_changed wrong: %', _p; END IF;
  IF (_p->>'approvals_revoked') IS DISTINCT FROM '1'     THEN RAISE EXCEPTION '(item1) rotation approvals_revoked wrong: %', _p; END IF;
  IF (_p->>'tools_cleared') IS DISTINCT FROM '1'         THEN RAISE EXCEPTION '(item1) rotation tools_cleared wrong: %', _p; END IF;

  -- A REJECTED rebind deletes NOTHING: re-seed, attempt a bad-bundle call, assert both survive.
  INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash)
  VALUES (C, 'rev.tool2', repeat('d',64), '0e900000-0000-0000-0000-000000000001', public._mcp_endpoint_hash(U));
  INSERT INTO public.mcp_connection_tools (connection_id, tool_name, schema_hash)
  VALUES (C, 'rev.tool2', repeat('d',64));
  _msg := NULL;
  BEGIN PERFORM public.set_mcp_connection_endpoint(C, 'https://mcp-rev2.example.com/rpc', 'bearer');  -- no token ⇒ bad bundle
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_BAD_CREDENTIAL_BUNDLE%' THEN RAISE EXCEPTION '(item1) expected bad-bundle refusal, got: %', _msg; END IF;
  SELECT count(*) INTO _appr  FROM public.mcp_connection_approvals WHERE connection_id = C;
  SELECT count(*) INTO _tools FROM public.mcp_connection_tools     WHERE connection_id = C;
  IF _appr  <> 1 THEN RAISE EXCEPTION '(item1) a REJECTED rebind deleted approvals (expected 1, got %)', _appr; END IF;
  IF _tools <> 1 THEN RAISE EXCEPTION '(item1) a REJECTED rebind cleared the tool catalog (expected 1, got %)', _tools; END IF;

  -- clean up the surviving seeds so later blocks see a clean connection.
  DELETE FROM public.mcp_connection_approvals WHERE connection_id = C;
  DELETE FROM public.mcp_connection_tools     WHERE connection_id = C;
END $$;

-- ── (A2 + §9 + no-bypass) refusals; each must RAISE with the EXPECTED reason and leave the endpoint
--    unchanged. Authority-first ordering: member/platform-owner/NULL fail at the capability gate; a
--    cross-tenant owner fails at the uniform connection-in-tenant guard ───────────────────────────────
DO $$
DECLARE _before text; _after text; _msg text;
BEGIN
  SELECT public._mcp_endpoint_hash(public.platform_decrypt(server_url_ct)) INTO _before
    FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';

  -- (a) ordinary member (with a global staff role, §59) — no `manage` ⇒ capability gate.
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000003","role":"authenticated"}', true);
  _msg := NULL;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%manage capability required%' THEN RAISE EXCEPTION '(A2a) member: expected manage-capability refusal, got: %', _msg; END IF;

  -- (b) platform owner, tenant MATCHES → still refused at the CAPABILITY gate (manage excludes platform owner).
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000004","role":"authenticated"}', true);
  _msg := NULL;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none',
                                                   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'0e900000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%manage capability required%' THEN RAISE EXCEPTION '(A2b) platform owner (tenant match): expected manage-capability refusal, got: %', _msg; END IF;

  -- (c) platform owner, no tenant given → resolves to no manage ⇒ capability gate.
  _msg := NULL;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%manage capability required%' THEN RAISE EXCEPTION '(A2c) platform owner (no tenant): expected manage-capability refusal, got: %', _msg; END IF;

  -- (d) owner of a DIFFERENT tenant → HAS manage for their own tenant, but the connection is not in it
  --     ⇒ uniform connection-in-tenant refusal (§9).
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000005","role":"authenticated"}', true);
  _msg := NULL;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%connection not in tenant%' THEN RAISE EXCEPTION '(A2d) cross-tenant owner: expected connection-not-in-tenant refusal, got: %', _msg; END IF;

  -- (e) NULL actor (service-role / no JWT) even naming the tenant → {} caps ⇒ capability gate (no bypass).
  PERFORM set_config('request.jwt.claims', '', true);
  _msg := NULL;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c1','https://evil.example.com/rpc','none',
                                                   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'0e900000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%manage capability required%' THEN RAISE EXCEPTION '(A2e) NULL actor: expected manage-capability refusal (no service-role bypass), got: %', _msg; END IF;

  -- none of the refusals may have changed the endpoint.
  SELECT public._mcp_endpoint_hash(public.platform_decrypt(server_url_ct)) INTO _after
    FROM public.mcp_connections WHERE connection_id = '0e900000-0000-0000-0000-0000000000c1';
  IF _before IS DISTINCT FROM _after THEN RAISE EXCEPTION 'a refused call changed the endpoint'; END IF;
END $$;

-- ── (D1) a legacy-projected row is refused even for a legitimate admin, with the distinct code ───────
DO $$
DECLARE _msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"0e900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  _msg := NULL;
  BEGIN PERFORM public.set_mcp_connection_endpoint('0e900000-0000-0000-0000-0000000000c2','https://mcp-x.example.com/rpc','none');
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  IF _msg IS NULL OR _msg NOT LIKE '%MCP_LEGACY_CONNECTION_READONLY%' THEN RAISE EXCEPTION '(D1) expected legacy-readonly refusal, got: %', _msg; END IF;
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
