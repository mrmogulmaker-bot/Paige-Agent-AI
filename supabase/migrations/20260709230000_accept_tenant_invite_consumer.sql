-- Roadmap #2: a tenant can invite their own CUSTOMER (not just staff).
--
-- accept_tenant_invite previously ALWAYS inserted a tenant_members row, so a
-- consumer invite filed the invitee as staff (they'd land in /admin). Now it
-- branches on the token's kind:
--   kind='consumer' → link the user to a CLIENTS row in the tenant (link an
--     existing unlinked contact by email if the tenant pre-created one, else
--     create), grant the 'client' app_role, set active tenant → they land in the
--     client portal / onboarding, scoped to their own account only.
--   kind='team' (or anything else) → unchanged staff membership path.
--
-- Constraints honored: clients_linked_user_id_unique (one client per user) and
-- clients_created_by_email_unique (one client per creator+email).

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tok public.tenant_invite_tokens;
  _email text;
  _full text;
  _first text;
  _last text;
  _client_id uuid;
  _tenant_owner uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in to accept an invite';
  END IF;

  SELECT * INTO _tok FROM public.tenant_invite_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite token not found'; END IF;
  IF _tok.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invite has been revoked'; END IF;
  IF _tok.expires_at <= now() THEN RAISE EXCEPTION 'invite has expired'; END IF;
  IF _tok.max_uses IS NOT NULL AND _tok.uses >= _tok.max_uses THEN
    RAISE EXCEPTION 'invite has reached its usage limit';
  END IF;

  IF _tok.kind = 'consumer' THEN
    -- CUSTOMER path: link to a clients row (a customer, not staff).
    SELECT email, NULLIF(raw_user_meta_data->>'full_name', '')
      INTO _email, _full FROM auth.users WHERE id = _uid;
    SELECT owner_user_id INTO _tenant_owner FROM public.tenants WHERE id = _tok.tenant_id;
    -- clients.first_name is NOT NULL — derive from metadata, else the email local part.
    _first := NULLIF(split_part(COALESCE(_full, ''), ' ', 1), '');
    IF _first IS NULL THEN _first := split_part(COALESCE(_email, 'there'), '@', 1); END IF;
    _last := NULLIF(trim(substr(COALESCE(_full, ''), length(split_part(COALESCE(_full, ''), ' ', 1)) + 1)), '');

    -- (a) already linked to a client anywhere? (one client per user) → re-point.
    SELECT id INTO _client_id FROM public.clients WHERE linked_user_id = _uid;
    IF _client_id IS NOT NULL THEN
      UPDATE public.clients
         SET tenant_id = _tok.tenant_id,
             status = 'active',
             onboarding_stage = COALESCE(onboarding_stage, 'invited'),
             updated_at = now()
       WHERE id = _client_id;
    ELSE
      -- (b) an unlinked contact in this tenant with this email → link it, so an
      -- invite sent from a customer profile attaches to THAT profile.
      SELECT id INTO _client_id FROM public.clients
        WHERE tenant_id = _tok.tenant_id AND linked_user_id IS NULL
          AND email IS NOT NULL AND lower(email) = lower(_email)
        ORDER BY created_at ASC LIMIT 1;
      IF _client_id IS NOT NULL THEN
        UPDATE public.clients
           SET linked_user_id = _uid, status = 'active',
               onboarding_stage = COALESCE(onboarding_stage, 'invited'), updated_at = now()
         WHERE id = _client_id;
      ELSE
        -- (c) create a fresh customer profile linked to them.
        INSERT INTO public.clients (tenant_id, created_by, email, first_name, last_name, linked_user_id, onboarding_stage, status)
        VALUES (_tok.tenant_id, COALESCE(_tok.created_by, _tenant_owner, _uid), _email, _first, _last, _uid, 'invited', 'active')
        RETURNING id INTO _client_id;
      END IF;
    END IF;

    -- Portal gates key off the 'client' app_role (resolveLandingRoute self-heals
    -- too, but grant it here so the first landing is correct).
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- TEAM / staff invite — idempotent membership upsert (unchanged).
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, accepted_at)
    VALUES (_tok.tenant_id, _uid, _tok.default_role, 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET status = 'active',
          accepted_at = COALESCE(public.tenant_members.accepted_at, now()),
          updated_at = now();
  END IF;

  UPDATE public.tenant_invite_tokens SET uses = uses + 1, last_used_at = now() WHERE id = _tok.id;
  UPDATE public.profiles SET active_tenant_id = _tok.tenant_id WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $$;

-- Bugfix: create_tenant_invite_token called unqualified gen_random_bytes(), which
-- lives in the `extensions` schema and is invisible under the function's
-- search_path='public' — so minting ANY invite token errored ("function
-- gen_random_bytes(integer) does not exist"). Qualify it. Also accept 'team' OR
-- 'consumer' (the two kinds we use).
CREATE OR REPLACE FUNCTION public.create_tenant_invite_token(
  _tenant_id uuid,
  _kind text DEFAULT 'consumer'::text,
  _default_role tenant_role DEFAULT 'member'::tenant_role,
  _expires_in_days integer DEFAULT 30,
  _max_uses integer DEFAULT NULL::integer
) RETURNS tenant_invite_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row public.tenant_invite_tokens;
  _new_token text;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to create invite tokens for this tenant';
  END IF;
  IF _kind NOT IN ('consumer', 'team') THEN
    RAISE EXCEPTION 'invalid invite kind: %', _kind;
  END IF;

  _new_token := encode(extensions.gen_random_bytes(24), 'base64');
  _new_token := replace(replace(replace(_new_token, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.tenant_invite_tokens
    (tenant_id, token, kind, default_role, created_by, expires_at, max_uses)
  VALUES
    (_tenant_id, _new_token, _kind, _default_role, auth.uid(),
     now() + make_interval(days => GREATEST(_expires_in_days, 1)), _max_uses)
  RETURNING * INTO _row;

  RETURN _row;
END $$;
