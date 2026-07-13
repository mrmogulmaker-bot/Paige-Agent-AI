-- Roadmap #189 — Lane A: the fourth invite kind, `subaccount_owner`.
--
-- An agency invites the OWNER of one of its sub-accounts. This reuses the whole
-- customer-invite plumbing (mint → send-portal-invite → /join → accept) but flips
-- one switch at accept: instead of a `clients` row + `client` role (a customer),
-- the acceptor is granted ADMIN MEMBERSHIP on the child tenant.
--
--   • The agency owner mints on the CHILD tenant. Auth already passes: the agency
--     owner is the child's owner_user_id AND a member, so is_tenant_admin(child)
--     is true (no new grant needed).
--   • The token carries default_role='admin', contact_id=NULL (the owner is NOT a
--     contact — no clients row, ever).
--   • On accept: upsert tenant_members(child, role='admin', status='active'), set
--     the acceptor's active_tenant_id = child, bump uses. NO clients row, NO
--     'client' role, NO ownership transfer — the AGENCY stays owner_user_id and
--     keeps white-label control (can_manage_tenant_brand walks the parent chain
--     upward, so the agency governs the child's brand regardless).
--
-- peek_tenant_invite already returns the token's `kind` verbatim, so the /join
-- preview sees 'subaccount_owner' with no change here; its brand resolution is
-- handled by the invite-brand-cascade migration (20260713050000).

-- 1. Widen the mint's kind CHECK to admit the new kind. Signature unchanged, so a
--    CREATE OR REPLACE preserves the existing `authenticated` grant. Body is the
--    20260709240000 definition with the one-line kind guard widened.
CREATE OR REPLACE FUNCTION public.create_tenant_invite_token(
  _tenant_id uuid,
  _kind text DEFAULT 'consumer'::text,
  _default_role tenant_role DEFAULT 'member'::tenant_role,
  _expires_in_days integer DEFAULT 30,
  _max_uses integer DEFAULT NULL::integer,
  _contact_id uuid DEFAULT NULL::uuid,
  _email text DEFAULT NULL::text
) RETURNS tenant_invite_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row public.tenant_invite_tokens;
  _new_token text;
  _contact_ok boolean;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to create invite tokens for this tenant';
  END IF;
  IF _kind NOT IN ('consumer', 'team', 'subaccount_owner') THEN
    RAISE EXCEPTION 'invalid invite kind: %', _kind;
  END IF;

  -- A bound contact must belong to this tenant (no cross-tenant binding).
  -- subaccount_owner invites never carry a contact (owner is not a customer).
  IF _contact_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.clients WHERE id = _contact_id AND tenant_id = _tenant_id
    ) INTO _contact_ok;
    IF NOT _contact_ok THEN
      RAISE EXCEPTION 'contact does not belong to this tenant';
    END IF;
  END IF;

  _new_token := encode(extensions.gen_random_bytes(24), 'base64');
  _new_token := replace(replace(replace(_new_token, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.tenant_invite_tokens
    (tenant_id, token, kind, default_role, created_by, expires_at, max_uses, contact_id, email)
  VALUES
    (_tenant_id, _new_token, _kind, _default_role, auth.uid(),
     now() + make_interval(days => GREATEST(_expires_in_days, 1)), _max_uses,
     _contact_id, NULLIF(lower(trim(_email)), ''))
  RETURNING * INTO _row;

  RETURN _row;
END $$;

-- 2. Accept: add the subaccount_owner branch. Body is the 20260709240000
--    definition with a new ELSIF between the consumer and team branches.
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
  _existing_tenant uuid;
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
    -- clients.first_name AND last_name are both NOT NULL — derive from metadata,
    -- else the email local part; last_name falls back to '' (never NULL).
    _first := NULLIF(split_part(COALESCE(_full, ''), ' ', 1), '');
    IF _first IS NULL THEN _first := split_part(COALESCE(_email, 'there'), '@', 1); END IF;
    _last := COALESCE(NULLIF(trim(substr(COALESCE(_full, ''), length(split_part(COALESCE(_full, ''), ' ', 1)) + 1)), ''), '');

    -- A user has at most one client row platform-wide (clients_linked_user_id_unique).
    -- If they're already a client of ANOTHER tenant, do NOT move that row across the
    -- §9 tenant seam — refuse. (Multi-tenant client identity is a separate roadmap.)
    SELECT id, tenant_id INTO _client_id, _existing_tenant
      FROM public.clients WHERE linked_user_id = _uid;
    IF _client_id IS NOT NULL THEN
      IF _existing_tenant IS DISTINCT FROM _tok.tenant_id THEN
        RAISE EXCEPTION 'This account is already registered as a client of another workspace. Please accept this invite with a different email address.';
      END IF;
      -- Same tenant → idempotent refresh (re-accepting their own invite).
      UPDATE public.clients
         SET status = 'active',
             onboarding_stage = COALESCE(onboarding_stage, 'invited'),
             updated_at = now()
       WHERE id = _client_id;
    ELSE
      -- (a) The exact contact the admin invited (bound at mint), if still unlinked.
      IF _tok.contact_id IS NOT NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE id = _tok.contact_id AND tenant_id = _tok.tenant_id AND linked_user_id IS NULL;
      END IF;
      -- (b) Else an unlinked contact in this tenant matching the token's bound
      --     email (or, for a generic link, the accepting user's email).
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
        -- (c) Create a fresh customer profile linked to them.
        INSERT INTO public.clients (tenant_id, created_by, email, first_name, last_name, linked_user_id, onboarding_stage, status)
        VALUES (_tok.tenant_id, COALESCE(_tok.created_by, _tenant_owner, _uid), _email, _first, _last, _uid, 'invited', 'active')
        RETURNING id INTO _client_id;
      END IF;
    END IF;

    -- Portal gates key off the 'client' app_role (resolveLandingRoute self-heals
    -- too, but grant it here so the first landing is correct).
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF _tok.kind = 'subaccount_owner' THEN
    -- SUB-ACCOUNT OWNER path: grant ADMIN membership on the child tenant. This is
    -- NOT a customer — no clients row, no 'client' role, contact_id ignored. The
    -- role is pinned to 'admin' regardless of what was minted (enforce the
    -- invariant, not the caller's parameter). The AGENCY stays owner_user_id, so it
    -- retains white-label control (can_manage_tenant_brand walks the parent chain);
    -- there is NO ownership transfer here.
    --
    -- §13 least-privilege: this token grants tenant-ADMIN, so accept is bound to the
    -- intended recipient. If the invite was minted to a specific email, the accepting
    -- user's own email MUST match it — a forwarded link cannot be redeemed by a
    -- stranger into admin. (Paired with single-use max_uses=1 at mint.) _email is
    -- only populated in the consumer branch above, so fetch it here first.
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tok.tenant_id, _uid, 'admin', 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = 'admin',
          status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();

  ELSE
    -- TEAM / staff invite — idempotent membership upsert (unchanged).
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tok.tenant_id, _uid, _tok.default_role, 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();
  END IF;

  UPDATE public.tenant_invite_tokens SET uses = uses + 1, last_used_at = now() WHERE id = _tok.id;
  UPDATE public.profiles SET active_tenant_id = _tok.tenant_id WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $$;
