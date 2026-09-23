-- list_integration_surface: Paige can SEE her MCP connections, and the list does not lie.
-- Synthetic fixtures; always rolled back.
--
-- WHY THIS FILE EXISTS. Before 20270410214500, list_integration_surface read only
-- public.channel_connectors, so every MCP connection a tenant owned was invisible to Paige —
-- absent, not stale. Asked "am I connected to Zapier?" she had nothing to answer from.
--
-- The dangerous half of the fix is the one these assertions target. The gateway registry
-- (public.mcp_connections) was filled by a ONE-TIME backfill with no trigger keeping it current,
-- while the legacy writers remain the live write path. So reading the gateway ALONE would hand
-- Paige a list with a hole in it — and a hole in a list is indistinguishable from an absence, which
-- turns honest silence into a confident false "no, you aren't connected." (C) is that invariant.
--
-- (D) is the §9 crown jewel: list_integration_surface is SECURITY DEFINER and so bypasses RLS on a
-- table whose only policy is is_platform_owner(). The owner_only visibility gate therefore has to
-- survive being reached through a nested definer call. It does, because SECURITY DEFINER changes
-- the executing privilege and NOT auth.uid() — but that is the kind of claim that must be proven
-- rather than reasoned about, so it is proven here, from both sides.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/integrations_surface_sees_mcp.sql "$DB_URL"

BEGIN;

-- ── Grant surface (§59 — the grant is never the guard, but it is still the outer boundary) ──
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.list_integration_surface()', 'EXECUTE') THEN
    RAISE EXCEPTION '(0) anon must not reach list_integration_surface';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.list_integration_surface()', 'EXECUTE') THEN
    RAISE EXCEPTION '(0) authenticated must reach list_integration_surface';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.list_integration_surface()', 'EXECUTE') THEN
    RAISE EXCEPTION '(0) service_role must reach list_integration_surface';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.list_integration_surface()'::regprocedure) THEN
    RAISE EXCEPTION '(0) list_integration_surface must be SECURITY DEFINER';
  END IF;
END $$;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('f1a00000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'isurf-admin@tests.invalid'),
  ('f1a00000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'isurf-member@tests.invalid');

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('f1a00000-0000-0000-0000-0000000000b1', 'isurf-t', 'ISURF T', 'active', 'standalone', 'ISF', '{}'::jsonb);

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('f1a00000-0000-0000-0000-0000000000b1', 'f1a00000-0000-0000-0000-0000000000a1', 'admin',  'active', true,  now()),
  ('f1a00000-0000-0000-0000-0000000000b1', 'f1a00000-0000-0000-0000-0000000000a2', 'member', 'active', false, now());

-- The pre-existing capability this change must NOT disturb (§58).
INSERT INTO public.channel_connectors (tenant_id, channel_type, provider, status, active, display_name, from_address, inbound_domain, inbound_address, updated_at)
VALUES ('f1a00000-0000-0000-0000-0000000000b1', 'email', 'resend', 'active', true, 'Resend', 'hi@isurf.test', 'isurf.test', 'in@isurf.test', now());

-- GATEWAY registry: one ordinary connection, one owner_only.
INSERT INTO public.mcp_connections (connection_id, tenant_id, provider_key, label, server_url_ct, auth_kind, visibility, enabled, status, health) VALUES
  ('f1a00000-0000-0000-0000-0000000000c1', 'f1a00000-0000-0000-0000-0000000000b1', 'zapier', 'Zapier (gateway)',
     public.platform_encrypt('https://mcp.zapier.example/rpc'), 'none', 'tenant',     true, 'connected', 'healthy'),
  ('f1a00000-0000-0000-0000-0000000000c2', 'f1a00000-0000-0000-0000-0000000000b1', 'generic-remote', 'Restricted',
     public.platform_encrypt('https://restricted.example/rpc'), 'none', 'owner_only', true, 'connected', 'healthy');

-- LEGACY registry: the SAME zapier (must be deduped, gateway wins) and an n8n the backfill never
-- projected (must still appear — this is the anti-lie case).
INSERT INTO public.tenant_mcp_connections (tenant_id, provider, label, server_url_ct, auth_token_ct, auth_token_last4, transport, auth_kind, enabled, status) VALUES
  ('f1a00000-0000-0000-0000-0000000000b1', 'zapier', 'Zapier (legacy, stale)',
     public.platform_encrypt('https://old.zapier.example/rpc'), public.platform_encrypt('tok-zapier-legacy'), 'gacy', 'http', 'bearer', true, 'connected'),
  ('f1a00000-0000-0000-0000-0000000000b1', 'n8n', 'My n8n',
     public.platform_encrypt('https://n8n.isurf.test/mcp'),     public.platform_encrypt('tok-n8n-unprojected'), 'cted', 'http', 'bearer', true, 'connected');

SET LOCAL ROLE authenticated;

-- ── (A) the channel half is untouched, and (B) the gateway connection is now visible ───────────
SELECT set_config('request.jwt.claims', '{"sub":"f1a00000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
DO $$
DECLARE _v jsonb; _e jsonb;
BEGIN
  _v := public.list_integration_surface();

  SELECT e INTO _e FROM jsonb_array_elements(_v) e WHERE e->>'channel' = 'email';
  IF _e IS NULL THEN RAISE EXCEPTION '(A) §58 REGRESSION: the channel_connectors half disappeared: %', _v; END IF;
  IF _e->>'from_address' IS DISTINCT FROM 'hi@isurf.test'
     OR _e->>'inbound_address' IS DISTINCT FROM 'in@isurf.test' THEN
    RAISE EXCEPTION '(A) §58 REGRESSION: channel fields dropped: %', _e;
  END IF;

  SELECT e INTO _e FROM jsonb_array_elements(_v) e WHERE e->>'provider' = 'zapier';
  IF _e IS NULL THEN RAISE EXCEPTION '(B) the gateway MCP connection is invisible to Paige: %', _v; END IF;
  IF _e->>'channel' IS DISTINCT FROM 'mcp'      THEN RAISE EXCEPTION '(B) channel=%', _e->>'channel'; END IF;
  IF _e->>'health'  IS DISTINCT FROM 'healthy'  THEN RAISE EXCEPTION '(B) health=%',  _e->>'health';  END IF;
  IF _e->>'status'  IS DISTINCT FROM 'active'   THEN RAISE EXCEPTION '(B) status=%',  _e->>'status';  END IF;
  IF _e->>'display_name' IS DISTINCT FROM 'Zapier (gateway)' THEN
    RAISE EXCEPTION '(B) the stale LEGACY row won over the gateway (§57 source of truth): %', _e->>'display_name';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_v) e WHERE e->>'provider' = 'zapier') <> 1 THEN
    RAISE EXCEPTION '(B) zapier listed twice — dedup broken: %', _v;
  END IF;
END $$;

-- ── (C) THE ANTI-LIE INVARIANT: a legacy connection the one-time backfill never projected ──────
DO $$
DECLARE _e jsonb;
BEGIN
  SELECT e INTO _e FROM jsonb_array_elements(public.list_integration_surface()) e WHERE e->>'provider' = 'n8n';
  IF _e IS NULL THEN
    RAISE EXCEPTION '(C) a LIVE legacy MCP connection is invisible. Paige would answer "you are not connected" about a connection that works — the exact failure 20270410214500 exists to prevent.';
  END IF;
  IF _e->>'health' IS DISTINCT FROM 'healthy' THEN RAISE EXCEPTION '(C) health=%', _e->>'health'; END IF;
END $$;

-- ── (D) §9: owner_only is hidden from an ordinary member and shown to an admin ─────────────────
DO $$
DECLARE _n int;
BEGIN
  -- admin (claims already set above)
  SELECT count(*) INTO _n FROM jsonb_array_elements(public.list_integration_surface()) e
   WHERE e->>'display_name' = 'Restricted';
  IF _n <> 1 THEN RAISE EXCEPTION '(D) a tenant ADMIN must see the owner_only connection (saw %)', _n; END IF;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"f1a00000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
DO $$
DECLARE _v jsonb; _n int;
BEGIN
  _v := public.list_integration_surface();
  SELECT count(*) INTO _n FROM jsonb_array_elements(_v) e WHERE e->>'display_name' = 'Restricted';
  IF _n <> 0 THEN
    RAISE EXCEPTION '(D) §9 LEAK: an ordinary member saw an owner_only connection through the nested SECURITY DEFINER call: %', _v;
  END IF;
  -- ...while still seeing the ordinary ones, so the gate is a gate and not a blackout.
  IF (SELECT count(*) FROM jsonb_array_elements(_v) e WHERE e->>'provider' = 'zapier') <> 1 THEN
    RAISE EXCEPTION '(D) the member lost the ordinary connection too — that is a blackout, not a visibility gate: %', _v;
  END IF;

  -- ── (E) nothing credential-bearing ever crosses ──
  IF _v::text ~* 'auth_token|refresh_token|last4|_ct"|tok-' THEN
    RAISE EXCEPTION '(E) credential material reached the caller: %', _v;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'INTEGRATIONS_SURFACE_SEES_MCP_PROVEN'; END $$;

ROLLBACK;
