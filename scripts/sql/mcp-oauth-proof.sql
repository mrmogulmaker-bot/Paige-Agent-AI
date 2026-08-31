-- Behavioural proof for the MCP OAuth storage. Run against a scratch Postgres 16.
--
-- WHY THIS EXISTS
--
-- The Supabase preview branch replays migrations, which is what caught `cannot use
-- subquery in check constraint` — a statement no lint in this repo could have seen,
-- because none of them execute SQL. But a replay only proves the DDL is ACCEPTED. It says
-- nothing about whether single-use redemption is actually single-use, or whether rotation
-- replaces the token it is supposed to replace. Those are the properties whose absence is
-- silent: the flow still completes, and the connection still works, right up until it
-- doesn't.
--
-- HOW TO RUN (no Supabase, no network):
--
--   initdb -D /tmp/pg/data -U postgres --auth=trust      # as a non-root user
--   pg_ctl -D /tmp/pg/data -o '-k /tmp/pg -p 55432 -c listen_addresses=' start
--   createdb -h /tmp/pg -p 55432 -U postgres replay
--   psql -h /tmp/pg -p 55432 -U postgres -d replay -v ON_ERROR_STOP=1 \
--     -f scripts/sql/mcp-oauth-stub.sql \
--     -f supabase/migrations/20261005000000_mcp_registry_provider_scoped.sql \
--     -f supabase/migrations/20261006000000_mcp_capability_policy_and_evidence.sql \
--     -f supabase/migrations/20261007000000_mcp_oauth_state_and_tokens.sql \
--     -f scripts/sql/mcp-oauth-proof.sql
--
-- Every assertion RAISEs on failure, so a green run is the whole result.
--
-- FOLLOW-UP: wiring a Postgres service into the `verify` job would make this a gate rather
-- than a runbook. That is a change to shared CI infrastructure and is deliberately not
-- bundled into this work.

INSERT INTO public.tenants VALUES ('11111111-1111-4111-8111-111111111111')
  ON CONFLICT DO NOTHING;

DO $$
DECLARE t uuid := '11111111-1111-4111-8111-111111111111'; r jsonb; r2 jsonb;
BEGIN
  -- ── The authorization request ───────────────────────────────────────────────
  PERFORM public.begin_tenant_mcp_oauth(t,'zapier','state-A','verifier-A','https://app/cb','https://as','https://mcp','client-1',NULL,NULL);

  r := public.consume_tenant_mcp_oauth_state('state-A');
  IF (r->>'found')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FIRST REDEEM FAILED'; END IF;
  IF r->>'code_verifier' <> 'verifier-A' THEN RAISE EXCEPTION 'VERIFIER NOT RETURNED'; END IF;
  -- Without this the caller's constant-time comparison would compare a value to itself.
  IF r->>'state' <> 'state-A' THEN RAISE EXCEPTION 'STATE NOT RETURNED'; END IF;
  IF r->>'tenant_id' <> t::text THEN RAISE EXCEPTION 'WRONG TENANT'; END IF;
  RAISE NOTICE 'ok: a state redeems once, returning its verifier, its state and its tenant';

  -- The replay the whole mechanism exists to stop.
  r2 := public.consume_tenant_mcp_oauth_state('state-A');
  IF (r2->>'found')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'A CONSUMED STATE WAS REDEEMED TWICE'; END IF;
  RAISE NOTICE 'ok: the same state cannot be redeemed a second time';

  IF (public.consume_tenant_mcp_oauth_state('never-issued')->>'found')::boolean IS NOT FALSE
    THEN RAISE EXCEPTION 'AN UNKNOWN STATE WAS ACCEPTED'; END IF;
  RAISE NOTICE 'ok: a state that was never issued is refused';

  -- Expiry is enforced by the read, so it holds whether or not a cleanup job ever runs.
  PERFORM public.begin_tenant_mcp_oauth(t,'zapier','state-B','verifier-B','https://app/cb','https://as','https://mcp','client-1',NULL,NULL);
  UPDATE public.tenant_mcp_oauth_state SET expires_at = now() - interval '1 second' WHERE state='state-B';
  IF (public.consume_tenant_mcp_oauth_state('state-B')->>'found')::boolean IS NOT FALSE
    THEN RAISE EXCEPTION 'AN EXPIRED STATE WAS REDEEMED'; END IF;
  RAISE NOTICE 'ok: an expired state is refused even though the row still exists';

  -- Restarting must retire the previous request, not leave it redeemable alongside.
  PERFORM public.begin_tenant_mcp_oauth(t,'zapier','state-C','verifier-C','https://app/cb','https://as','https://mcp','client-1',NULL,NULL);
  PERFORM public.begin_tenant_mcp_oauth(t,'zapier','state-D','verifier-D','https://app/cb','https://as','https://mcp','client-1',NULL,NULL);
  IF (public.consume_tenant_mcp_oauth_state('state-C')->>'found')::boolean IS NOT FALSE
    THEN RAISE EXCEPTION 'A SUPERSEDED FLOW WAS STILL REDEEMABLE'; END IF;
  IF (public.consume_tenant_mcp_oauth_state('state-D')->>'found')::boolean IS NOT TRUE
    THEN RAISE EXCEPTION 'THE CURRENT FLOW WAS NOT REDEEMABLE'; END IF;
  RAISE NOTICE 'ok: restarting a flow retires the previous one';

  -- ── Tokens ─────────────────────────────────────────────────────────────────
  PERFORM public.set_tenant_zapier_mcp_connection(t,'https://mcp','at-1','rt-1',now()+interval '1 hour','https://as','client-1',NULL,ARRAY['mcp:tools'],NULL,NULL);

  IF (SELECT status FROM public.tenant_mcp_connections WHERE tenant_id=t AND provider='zapier') <> 'pending_verification'
    THEN RAISE EXCEPTION 'A GRANTED TOKEN CLAIMED A PROVEN CONNECTION'; END IF;
  RAISE NOTICE 'ok: a granted token is stored as pending_verification, never connected';

  PERFORM public.rotate_tenant_mcp_tokens(t,'zapier','at-2','rt-2',now()+interval '2 hours');
  IF public.platform_decrypt((SELECT refresh_token_ct FROM public.tenant_mcp_connections WHERE tenant_id=t AND provider='zapier')) <> 'rt-2'
    THEN RAISE EXCEPTION 'ROTATION DID NOT REPLACE THE REFRESH TOKEN'; END IF;
  RAISE NOTICE 'ok: a rotated refresh token replaces the old one';

  -- A server that does not rotate must not have its still-valid token erased.
  PERFORM public.rotate_tenant_mcp_tokens(t,'zapier','at-3',NULL,now()+interval '3 hours');
  IF public.platform_decrypt((SELECT refresh_token_ct FROM public.tenant_mcp_connections WHERE tenant_id=t AND provider='zapier')) <> 'rt-2'
    THEN RAISE EXCEPTION 'A NON-ROTATING SERVER ERASED A VALID REFRESH TOKEN'; END IF;
  RAISE NOTICE 'ok: a server that does not rotate keeps its still-valid refresh token';

  -- ── The approval set ───────────────────────────────────────────────────────
  BEGIN
    UPDATE public.tenant_mcp_connections SET approved_capabilities = '{"a":1}'::jsonb
     WHERE tenant_id=t AND provider='zapier';
    RAISE EXCEPTION 'AN OBJECT WAS ACCEPTED AS AN APPROVAL SET';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: a non-array approval set is refused';
  END;
  BEGIN
    UPDATE public.tenant_mcp_connections SET approved_capabilities = '[1,2]'::jsonb
     WHERE tenant_id=t AND provider='zapier';
    RAISE EXCEPTION 'NON-STRING CAPABILITIES WERE ACCEPTED';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: non-string capability names are refused';
  END;
  IF (SELECT approved_capabilities FROM public.tenant_mcp_connections WHERE tenant_id=t AND provider='zapier') <> '[]'::jsonb
    THEN RAISE EXCEPTION 'A NEW CONNECTION DID NOT START WITH AN EMPTY APPROVAL SET'; END IF;
  RAISE NOTICE 'ok: a new connection approves nothing until somebody says so';
END $$;
