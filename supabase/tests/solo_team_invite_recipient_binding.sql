-- Executable recipient-binding proof against the APPLIED schema, never a copied RPC.
-- Isolated local/CI database only. Synthetic users; no email sends. All fixtures roll back.
BEGIN;
-- Four grants + two entrypoints: 14 calls x 3 assertions + 7 outcomes each.
SELECT plan(110);

INSERT INTO public.tenants
  (id, slug, name, status, account_type, account_number_prefix, account_number, features)
VALUES
  ('e9100000-0000-0000-0000-000000000001', 'recipient-binding-a', 'Recipient binding A', 'active', 'standalone', 'RBA', 9391001, '{}'),
  ('e9100000-0000-0000-0000-000000000002', 'recipient-binding-b', 'Recipient binding B', 'active', 'standalone', 'RBB', 9391002, '{}');

-- Snapshot every mutation surface of these acceptance paths, including trigger-written roles.
CREATE FUNCTION pg_temp.binding_snapshot() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'members', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.tenant_members x),
    'roles', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.user_id, x.role) FROM public.user_roles x),
    'invites', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.tenant_invite_tokens x),
    'profiles', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.user_id) FROM public.profiles x),
    'audit', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.audit_logs x)
  );
$$;

-- SECURITY INVOKER on purpose: the call itself runs as the real browser database role.
-- The surrounding test returns to its original role only to inspect otherwise-private effects.
CREATE FUNCTION pg_temp.binding_call(_rpc text, _token text, _actor uuid, _allow boolean, _label text)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  _before jsonb := pg_temp.binding_snapshot();
  _denied boolean := false;
  _result uuid;
  _role text;
  _claimed_email text := (SELECT email FROM public.tenant_invite_tokens WHERE token = _token);
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', _actor, 'role', CASE WHEN _actor IS NULL THEN 'anon' ELSE 'authenticated' END,
    -- Deliberately a lie: JWT email must not override the authoritative auth.users row.
    'email', _claimed_email, 'email_verified', true)::text, true);
  IF _actor IS NULL THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
  _role := current_user;
  BEGIN
    EXECUTE format('SELECT public.%I($1)', _rpc) INTO _result USING _token;
  EXCEPTION WHEN OTHERS THEN _denied := true;
  END;
  RESET ROLE;
  -- Fixture writes are trusted setup, not a continuation of the previous simulated browser.
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  RETURN NEXT ok(_role = CASE WHEN _actor IS NULL THEN 'anon' ELSE 'authenticated' END,
    _label || ': actual caller role');
  RETURN NEXT ok(_denied = NOT _allow, _label || ': expected acceptance/refusal');
  IF NOT _allow THEN
    RETURN NEXT is(pg_temp.binding_snapshot(), _before, _label || ': zero durable effects');
  ELSE
    RETURN NEXT is(_result, 'e9100000-0000-0000-0000-000000000001'::uuid,
      _label || ': only the invited workspace returned');
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.binding_cases(_rpc text, _serial integer)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  _actor uuid := ('e9200000-0000-0000-0000-' || lpad(_serial::text, 12, '0'))::uuid;
  _owner uuid := ('e9300000-0000-0000-0000-' || lpad(_serial::text, 12, '0'))::uuid;
  _a uuid := 'e9100000-0000-0000-0000-000000000001';
  _b uuid := 'e9100000-0000-0000-0000-000000000002';
  _token text := 'binding-fixture-' || _serial;
  _invite uuid;
  _replacement jsonb;
  _email text := 'recipient-' || _serial || '@tests.invalid';
BEGIN
  -- Fixture writes are trusted setup, not a continuation of the previous simulated browser.
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at) VALUES
    (_actor, 'authenticated', 'authenticated', 'wrong-' || _serial || '@tests.invalid', now()),
    (_owner, 'authenticated', 'authenticated', 'owner-' || _serial || '@tests.invalid', now());
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
    (_a, _owner, 'owner', 'active', true, now()),
    (_b, _actor, 'member', 'active', false, now());
  UPDATE public.profiles SET active_tenant_id = _b WHERE user_id = _actor;
  INSERT INTO public.tenant_invite_tokens
    (tenant_id, token, kind, default_role, created_by, expires_at, max_uses, email)
  VALUES (_a, _token, 'team', 'admin', _owner, now() + interval '1 day', 1, _email)
  RETURNING id INTO _invite;

  -- The captured token and spoofed verified-email claims are insufficient for another user.
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' wrong recipient / spoofed claims');
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, NULL, false, _rpc || ' anonymous');
  UPDATE auth.users SET email = _email, email_confirmed_at = NULL WHERE id = _actor;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' unverified matching recipient');
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = _actor;

  UPDATE public.tenant_invite_tokens SET email = NULL WHERE id = _invite;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' null recipient');
  UPDATE public.tenant_invite_tokens SET email = '  ' WHERE id = _invite;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' blank recipient');
  UPDATE public.tenant_invite_tokens SET email = _email, revoked_at = now() WHERE id = _invite;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' revoked');
  UPDATE public.tenant_invite_tokens SET revoked_at = NULL, expires_at = now() - interval '1 second' WHERE id = _invite;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' expired');
  UPDATE public.tenant_invite_tokens SET expires_at = now() + interval '1 day', uses = 1 WHERE id = _invite;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' used');
  UPDATE public.tenant_invite_tokens SET uses = 0 WHERE id = _invite;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, 'not/an/invite', _actor, false, _rpc || ' malformed');
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, NULL, _actor, false, _rpc || ' absent token');

  -- The actual resend RPC replaces rather than reuses the token; it never sends email itself.
  SELECT public.resend_solo_team_invite(_owner, _a, _invite) INTO _replacement;
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' replaced token');
  _token := _replacement->>'token';
  _invite := (_replacement->>'id')::uuid;
  RETURN NEXT ok((SELECT email = _email AND tenant_id = _a AND default_role = 'admin'
    FROM public.tenant_invite_tokens WHERE id = _invite), _rpc || ': resend preserves recipient/workspace/role');

  -- Normalize both server-side fields; do not rewrite plus aliases or dots.
  UPDATE auth.users SET email = '  ' || upper(_email) || '  ' WHERE id = _actor;
  UPDATE public.tenant_invite_tokens SET email = ' ' || _email || ' ' WHERE id = _invite;

  -- A fixture-scoped late failure proves partial acceptance cannot survive transaction abort.
  PERFORM set_config('test.recipient_binding_fail_actor', _actor::text, true);
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' late pointer-write failure is atomic');
  PERFORM set_config('test.recipient_binding_fail_actor', '', true);
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, true, _rpc || ' verified normalized recipient');
  RETURN NEXT is((SELECT count(*) FROM public.tenant_members WHERE tenant_id = _a AND user_id = _actor),
    1::bigint, _rpc || ': exactly one intended membership');
  RETURN NEXT ok((SELECT role = 'admin' AND status = 'active' AND NOT is_owner
    FROM public.tenant_members WHERE tenant_id = _a AND user_id = _actor), _rpc || ': exact role without ownership');
  RETURN NEXT ok((SELECT role = 'member' AND status = 'active' AND NOT is_owner
    FROM public.tenant_members WHERE tenant_id = _b AND user_id = _actor), _rpc || ': other workspace membership unchanged');
  RETURN NEXT is((SELECT active_tenant_id FROM public.profiles WHERE user_id = _actor), _a, _rpc || ': correct active workspace');
  RETURN NEXT is((SELECT uses FROM public.tenant_invite_tokens WHERE id = _invite), 1, _rpc || ': consumed once');
  RETURN NEXT ok((SELECT last_used_at IS NOT NULL FROM public.tenant_invite_tokens WHERE id = _invite), _rpc || ': acceptance timestamp');
  RETURN QUERY SELECT * FROM pg_temp.binding_call(_rpc, _token, _actor, false, _rpc || ' duplicate acceptance');
END;
$$;

-- This trigger exists only inside this rolled-back test. It is deliberately later than membership
-- insertion/token consumption in BOTH entrypoints, and scoped to one synthetic actor at a time.
CREATE FUNCTION pg_temp.binding_force_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id::text = current_setting('test.recipient_binding_fail_actor', true)
     AND NEW.active_tenant_id = 'e9100000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'synthetic acceptance atomicity failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recipient_binding_atomicity_probe BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION pg_temp.binding_force_failure();

SELECT ok(NOT has_function_privilege('anon', 'public.accept_solo_team_invite(text)', 'EXECUTE'), 'Solo acceptance denies anonymous execution');
SELECT ok(NOT has_function_privilege('anon', 'public.accept_tenant_invite(text)', 'EXECUTE'), 'generic acceptance denies anonymous execution');
SELECT ok(has_function_privilege('authenticated', 'public.accept_solo_team_invite(text)', 'EXECUTE'), 'Solo recipient can reach acceptance');
SELECT ok(has_function_privilege('authenticated', 'public.accept_tenant_invite(text)', 'EXECUTE'), 'generic recipient can reach acceptance');
SELECT * FROM pg_temp.binding_cases('accept_solo_team_invite', 1);
SELECT * FROM pg_temp.binding_cases('accept_tenant_invite', 2);
-- Negative controls: change only the new binding IF in a subtransaction. A deliberate exception
-- rolls back the definition AND every mutant write before any pgTAP assertion is emitted.
CREATE FUNCTION pg_temp.binding_negative_control(_rpc text, _serial integer)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  _original text := pg_get_functiondef(to_regprocedure('public.' || _rpc || '(text)'));
  _condition text;
  _mutant text;
  _actor uuid := ('e9400000-0000-0000-0000-' || lpad(_serial::text, 12, '0'))::uuid;
  _token text := 'binding-negative-' || _serial;
  _accepted boolean := false;
  _before jsonb;
  _result uuid;
BEGIN
  IF _rpc = 'accept_solo_team_invite' THEN
    _condition := E'IF _actor_email_confirmed_at IS NULL\n     OR NULLIF(btrim(_actor_email), '''') IS NULL\n     OR NULLIF(btrim(_invite.email), '''') IS NULL\n     OR lower(btrim(_invite.email)) <> lower(btrim(_actor_email)) THEN';
  ELSE
    _condition := E'IF _email_confirmed_at IS NULL\n       OR NULLIF(btrim(_email), '''') IS NULL\n       OR NULLIF(btrim(_tok.email), '''') IS NULL\n       OR lower(btrim(_tok.email)) <> lower(btrim(_email)) THEN';
  END IF;
  _mutant := replace(_original, _condition, 'IF false THEN');
  RETURN NEXT ok(_mutant <> _original AND length(_original) - length(_mutant) = length(_condition) - length('IF false THEN'),
    _rpc || ': negative control changes exactly one binding condition');
  _before := pg_temp.binding_snapshot();
  BEGIN
  -- Fixture writes are trusted setup, not a continuation of the previous simulated browser.
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
    EXECUTE _mutant;
    INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
    VALUES (_actor, 'authenticated', 'authenticated', 'wrong-negative-' || _serial || '@tests.invalid', now());
    INSERT INTO public.tenant_invite_tokens
      (tenant_id, token, kind, default_role, expires_at, max_uses, email)
    VALUES ('e9100000-0000-0000-0000-000000000001', _token, 'team', 'member', now() + interval '1 day', 1,
      'intended-negative-' || _serial || '@tests.invalid');
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      EXECUTE format('SELECT public.%I($1)', _rpc) INTO _result USING _token;
      _accepted := _result = 'e9100000-0000-0000-0000-000000000001'::uuid;
    EXCEPTION WHEN OTHERS THEN _accepted := false;
    END;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'ZB001', MESSAGE = 'rollback synthetic negative control';
  EXCEPTION WHEN SQLSTATE 'ZB001' THEN NULL;
  END;
  -- This is the same expected-refusal condition as binding_call. No inner pgTAP calls: emitting
  -- hidden failed assertions would corrupt the TAP counter instead of proving the mutation.
  RETURN NEXT ok(_accepted, _rpc || ': removing binding breaks the wrong-recipient refusal');
  RETURN NEXT is(pg_get_functiondef(to_regprocedure('public.' || _rpc || '(text)')), _original,
    _rpc || ': original function restored after negative control');
  RETURN NEXT is(pg_temp.binding_snapshot(), _before, _rpc || ': mutant fixtures and effects fully rolled back');
END;
$$;
SELECT * FROM pg_temp.binding_negative_control('accept_solo_team_invite', 1);
SELECT * FROM pg_temp.binding_negative_control('accept_tenant_invite', 2);

SELECT * FROM finish();
ROLLBACK;
