-- P0: both public acceptance entry points enforce the stored, confirmed recipient identity.
-- Function definitions only: no invitation, membership, role or user records are migrated.
-- Preserve legacy non-Team branches and Team role/lifecycle rules; never delegate to a narrower
-- role contract. Each original function locks its token and performs consumption atomically.
-- Definition sources: 20260901001520 and 20260804020000; only recipient binding changes.
CREATE OR REPLACE FUNCTION public.accept_solo_team_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _actor_email text;
  _actor_email_confirmed_at timestamptz;
  _invite public.tenant_invite_tokens;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT email, email_confirmed_at INTO _actor_email, _actor_email_confirmed_at FROM auth.users WHERE id = _actor;
  SELECT * INTO _invite FROM public.tenant_invite_tokens
  WHERE token = _token AND kind = 'team' FOR UPDATE;
  IF _invite.id IS NULL THEN RAISE EXCEPTION 'team invitation not found'; END IF;
  IF _invite.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'team invitation has been revoked'; END IF;
  IF _invite.expires_at <= now() THEN RAISE EXCEPTION 'team invitation has expired'; END IF;
  IF _invite.uses > 0 OR (_invite.max_uses IS NOT NULL AND _invite.uses >= _invite.max_uses) THEN
    RAISE EXCEPTION 'team invitation has already been accepted';
  END IF;
  -- Identity comes from the authenticated subject's stored account, never browser email or metadata.
  IF _actor_email_confirmed_at IS NULL
     OR NULLIF(btrim(_actor_email), '') IS NULL
     OR NULLIF(btrim(_invite.email), '') IS NULL
     OR lower(btrim(_invite.email)) <> lower(btrim(_actor_email)) THEN
    RAISE EXCEPTION 'team invitation belongs to a different email address' USING ERRCODE = '42501';
  END IF;
  IF _invite.default_role NOT IN ('admin'::public.tenant_role, 'member'::public.tenant_role) THEN
    RAISE EXCEPTION 'team invitation has an unsupported permission';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = _invite.tenant_id AND tm.user_id = _actor
  ) THEN
    RAISE EXCEPTION 'this account already belongs to the workspace';
  END IF;

  INSERT INTO public.tenant_members
    (tenant_id, user_id, role, status, is_owner, invited_at, joined_at, job_title, responsibilities)
  VALUES
    (_invite.tenant_id, _actor, _invite.default_role, 'active', false, _invite.created_at, now(),
     _invite.job_title, _invite.responsibilities);

  UPDATE public.tenant_invite_tokens
  SET uses = uses + 1, last_used_at = now(), updated_at = now()
  WHERE id = _invite.id AND uses = 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'team invitation was already accepted'; END IF;

  UPDATE public.profiles SET active_tenant_id = _invite.tenant_id WHERE user_id = _actor;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_invite', 'team_invite_accepted', _invite.id,
          jsonb_build_object('tenant_id', _invite.tenant_id, 'permission', _invite.default_role::text));
  RETURN _invite.tenant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tok public.tenant_invite_tokens;
  _email text;
  _email_confirmed_at timestamptz;
  _full text;
  _first text;
  _last text;
  _client_id uuid;
  _existing_tenant uuid;
  _tenant_owner uuid;
  _has_active_owner boolean;   -- #227 Layer-2 shell-gate
  _minter_ok boolean;          -- #227 Layer-2 shell-gate
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

  -- Solo Team tokens are also reachable through this legacy RPC. Enforce the same recipient
  -- boundary before any membership, role, profile or token write. Other invite kinds retain
  -- their existing eligibility and acceptance behavior.
  IF _tok.kind = 'team' THEN
    SELECT email, email_confirmed_at INTO _email, _email_confirmed_at
    FROM auth.users WHERE id = _uid;
    IF _email_confirmed_at IS NULL
       OR NULLIF(btrim(_email), '') IS NULL
       OR NULLIF(btrim(_tok.email), '') IS NULL
       OR lower(btrim(_tok.email)) <> lower(btrim(_email)) THEN
      RAISE EXCEPTION 'team invitation belongs to a different email address' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF _tok.kind = 'consumer' THEN
    SELECT email, NULLIF(raw_user_meta_data->>'full_name', '')
      INTO _email, _full FROM auth.users WHERE id = _uid;
    SELECT owner_user_id INTO _tenant_owner FROM public.tenants WHERE id = _tok.tenant_id;
    _first := NULLIF(split_part(COALESCE(_full, ''), ' ', 1), '');
    IF _first IS NULL THEN _first := split_part(COALESCE(_email, 'there'), '@', 1); END IF;
    _last := COALESCE(NULLIF(trim(substr(COALESCE(_full, ''), length(split_part(COALESCE(_full, ''), ' ', 1)) + 1)), ''), '');

    SELECT id, tenant_id INTO _client_id, _existing_tenant
      FROM public.clients WHERE linked_user_id = _uid;
    IF _client_id IS NOT NULL THEN
      IF _existing_tenant IS DISTINCT FROM _tok.tenant_id THEN
        RAISE EXCEPTION 'This account is already registered as a client of another workspace. Please accept this invite with a different email address.';
      END IF;
      UPDATE public.clients
         SET status = 'active',
             onboarding_stage = COALESCE(onboarding_stage, 'invited'),
             updated_at = now()
       WHERE id = _client_id;
    ELSE
      IF _tok.contact_id IS NOT NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE id = _tok.contact_id AND tenant_id = _tok.tenant_id AND linked_user_id IS NULL;
      END IF;
      IF _client_id IS NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE tenant_id = _tok.tenant_id AND linked_user_id IS NULL
            AND email IS NOT NULL
            AND lower(email) = lower(COALESCE(_tok.email, _email))
          ORDER BY created_at ASC LIMIT 1;
      END IF;
      IF _client_id IS NOT NULL THEN
        UPDATE public.clients
           SET linked_user_id = _uid, status = 'active',
               onboarding_stage = COALESCE(onboarding_stage, 'invited'), updated_at = now()
         WHERE id = _client_id;
      ELSE
        INSERT INTO public.clients (tenant_id, created_by, email, first_name, last_name, linked_user_id, onboarding_stage, status, created_by_channel_type)
        VALUES (_tok.tenant_id, COALESCE(_tok.created_by, _tenant_owner, _uid), _email, _first, _last, _uid, 'invited', 'active', 'invite')
        RETURNING id INTO _client_id;
      END IF;
    END IF;

    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF _tok.kind = 'subaccount_owner' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;

    -- #227 HOLE#1 Layer-2 SHELL-GATE: establish ownership ONLY on a shell child that has
    -- no active owner yet, AND only when the minter is (still) agency-over-child / platform.
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_members
       WHERE tenant_id = _tok.tenant_id AND is_owner = true AND status = 'active'
    ) INTO _has_active_owner;

    SELECT ( public.is_platform_owner(_tok.created_by)
             OR public.agency_can_manage_child(_tok.tenant_id, _tok.created_by) )
      INTO _minter_ok;

    IF NOT _has_active_owner AND _minter_ok THEN
      -- LEGITIMATE first owner of the shell child, born correct — is_owner=true +
      -- role='owner' in lockstep (guard-exempt: current_user='postgres' inside definer).
      INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
      VALUES (_tok.tenant_id, _uid, 'owner'::public.tenant_role, 'active', true, now())
      ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET is_owner  = true,
            role      = 'owner'::public.tenant_role,
            status    = 'active',
            joined_at = COALESCE(public.tenant_members.joined_at, now()),
            updated_at = now();

      -- Display-only owner_user_id parity: set ONLY when still unset (never overwrite a
      -- real owner_user_id; Parts B/D reconcile the historically-leaked pointer).
      UPDATE public.tenants
         SET owner_user_id = _uid, updated_at = now()
       WHERE id = _tok.tenant_id AND owner_user_id IS NULL;

      INSERT INTO public.paige_audit_log
        (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
      VALUES (_uid, 'owner', 'tenant:subaccount_owner_established', 'tenant_member', _uid,
              jsonb_build_object('tenant_id', _tok.tenant_id, 'lane', 'auto', 'via', 'accept_tenant_invite'),
              _tok.tenant_id);
    ELSE
      -- Already-owned / peer child, or minter no longer authorized → plain admin seat.
      -- is_owner pinned FALSE on fresh insert; ON CONFLICT preserves an existing owner
      -- (lockstep) and NEVER raises is_owner — no second silent co-owner.
      INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
      VALUES (_tok.tenant_id, _uid, 'admin'::public.tenant_role, 'active', false, now())
      ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET role = (CASE WHEN public.tenant_members.role = 'owner'::public.tenant_role
                         THEN 'owner'::public.tenant_role
                         ELSE 'admin'::public.tenant_role END),
            status = 'active',
            joined_at = COALESCE(public.tenant_members.joined_at, now()),
            updated_at = now();
    END IF;

  ELSIF _tok.kind = 'agency_team' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;
    IF _tok.agency_role IS NULL OR _tok.agency_role NOT IN
       ('agency_admin','agency_manager','agency_biller','agency_specialist','agency_viewer') THEN
      RAISE EXCEPTION 'This agency invite is missing a valid role. Ask the agency to resend it.';
    END IF;

    DELETE FROM public.agency_team_members
     WHERE agency_tenant_id = _tok.tenant_id
       AND user_id IS NULL
       AND email IS NOT NULL
       AND lower(email) = lower(COALESCE(_email, ''));

    UPDATE public.agency_team_members
       SET agency_role = _tok.agency_role,
           status = 'active',
           email = COALESCE(email, _email),
           joined_at = COALESCE(joined_at, now()),
           updated_at = now()
     WHERE agency_tenant_id = _tok.tenant_id AND user_id = _uid;
    IF NOT FOUND THEN
      INSERT INTO public.agency_team_members
        (agency_tenant_id, user_id, email, agency_role, status, invited_by, invited_at, joined_at)
      VALUES
        (_tok.tenant_id, _uid, _email, _tok.agency_role, 'active', _tok.created_by, _tok.created_at, now());
    END IF;

  ELSE
    -- SECURITY (Tier Rail Phase A): a generic staff/'team' invite may only grant
    -- tenant_members on a NON-agency tenant.
    IF (SELECT account_type FROM public.tenants WHERE id = _tok.tenant_id)
         IN ('agency','enterprise') THEN
      RAISE EXCEPTION 'Staff invites cannot grant access on an agency or enterprise account. Use an agency team invite instead.';
    END IF;

    -- FIX-1 (§9): an invite NEVER mints or elevates ownership. Owner elevation is
    -- EXCLUSIVELY grant_co_owner(). Fresh seat: is_owner pinned false; any owner
    -- default_role coerced to 'admin' (keeps role/is_owner lockstep). ON CONFLICT:
    -- is_owner and role left UNTOUCHED — see §13 NOTE below.
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
    VALUES (
      _tok.tenant_id, _uid,
      (CASE WHEN _tok.default_role = 'owner'::public.tenant_role
            THEN 'admin'::public.tenant_role ELSE _tok.default_role END),
      'active', false, now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();
    -- §13 NOTE (deliberate deviation from the literal "force is_owner=false on the ON
    -- CONFLICT"): the conflict path intentionally does NOT write is_owner or role. It
    -- cannot ESCALATE (a returning member keeps their existing bit; only grant_co_owner
    -- raises it) and it must NOT force-clear it, which would DEMOTE / last-owner-strip a
    -- legitimate owner who re-accepts a staff invite. Escalation is fully closed at the
    -- fresh-INSERT (pins false) + the create-side owner-token rejection.
  END IF;

  UPDATE public.tenant_invite_tokens SET uses = uses + 1, last_used_at = now() WHERE id = _tok.id;
  UPDATE public.profiles SET active_tenant_id = _tok.tenant_id WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $function$;
