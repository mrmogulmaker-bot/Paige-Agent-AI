-- ============================================================================
-- Migration 20260803190000 — Slice A Option 1: tenant_members.is_owner is the
-- SOLE authoritative ownership signal (tenants.owner_user_id → DISPLAY-ONLY).
-- First concrete encoding of the OWNER slot in the Tenant tier's authz column
-- (§18 one home: is_tenant_owner is the canonical predicate). Refs #218/#221/#212.
-- Project xygzykjyynhzqytbqnzu. Discipline §1/§9/§13/§32/§37/§51.
-- FILE ORDER for the integrator (single migration, run top→bottom):
--   [1] this block (column + backfill + index + 3 reader flips)
--   [2] reader_migration_sql  (can_manage_tenant_brand FIX-3 + RLS no-op)
--   [3] guard_trigger_sql     (owner guard)
--   [4] owner_rpc_sql         (grant_co_owner / revoke_co_owner)
--   [5] invite_and_role_rpc_fixes_sql (FIX-1 + FIX-2)
--   [6] writer_edits          (provision_tenant / provision_tenant_as)
--   [7] premerge_proof_sql    (§32 harness — self-rolling-back, run + discard)
-- ============================================================================

-- (1) COLUMN + BACKFILL --------------------------------------------------------
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_members.is_owner IS
  'Slice A Option 1 (§9, #218/#221/#212): SOLE authoritative tenant-ownership signal. '
  'Mutated ONLY by grant_co_owner()/revoke_co_owner() or trusted postgres-owned SECURITY '
  'DEFINER provisioning; direct client DML is blocked by trg_tenant_members_owner_guard. '
  'tenants.owner_user_id is DISPLAY-ONLY and read by NO authz predicate. '
  'Distinct from the frontend/UI is_owner (which means platform-owner/super_admin).';

-- Backfill: every active role=''owner'' member becomes an is_owner owner.
-- Ground truth (xygzykjyynhzqytbqnzu, 2026-08-03): marks the 6 active owner rows.
-- tenants_set_no_ownermember=0 → every SET owner_user_id already has a matching active
-- owner member, so a role-based backfill is complete (no owner_user_id backfill needed).
UPDATE public.tenant_members
   SET is_owner = true
 WHERE role = 'owner'::public.tenant_role
   AND status = 'active'
   AND is_owner = false;

-- Partial index for the "owners of this tenant" read (grant/revoke floor lock + roster).
CREATE INDEX IF NOT EXISTS idx_tenant_members_owner
  ON public.tenant_members (tenant_id)
  WHERE is_owner;

-- (2) READER FLIPS -------------------------------------------------------------

-- is_tenant_owner: reads ONLY active is_owner membership. Branch-1 owner_user_id REMOVED.
-- Canonical Owner-slot predicate (§18 one home). EXISTS-based → multi-owner safe.
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_user_id uuid, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = _user_id
      AND tm.is_owner = true
      AND tm.status = 'active'
      AND (_tenant_id IS NULL OR tm.tenant_id = _tenant_id)
  );
$function$;

COMMENT ON FUNCTION public.is_tenant_owner(uuid, uuid) IS
  'Slice A Option 1 (§18): canonical Tenant-tier OWNER predicate. Reads the authoritative '
  'tenant_members.is_owner (active) ONLY — never tenants.owner_user_id (display-only).';

-- has_tenant_role: owner-case OR-in is_owner; owner_user_id path DROPPED.
CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id uuid, _tenant_id uuid, _role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = _user_id
      AND tm.tenant_id = _tenant_id
      AND tm.role::text = _role
      AND tm.status = 'active'
  ) OR (
    _role = 'owner' AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.user_id = _user_id
        AND tm.tenant_id = _tenant_id
        AND tm.is_owner = true
        AND tm.status = 'active'
    )
  );
$function$;

-- get_user_primary_tenant: rank is_owner first; deterministic ORDER BY(rank, created_at,
-- tenant_id); owner_user_id UNION arm DROPPED (tenants_set_no_ownermember=0 → no regression).
CREATE OR REPLACE FUNCTION public.get_user_primary_tenant(_user_id uuid)
 RETURNS TABLE(tenant_id uuid, tenant_name text, member_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT
      t.id   AS tenant_id,
      t.name AS tenant_name,
      CASE WHEN tm.is_owner THEN 'owner' ELSE tm.role::text END AS member_role,
      CASE
        WHEN tm.is_owner            THEN 0
        WHEN tm.role::text = 'owner' THEN 1
        WHEN tm.role::text = 'admin' THEN 2
        WHEN tm.role::text = 'coach' THEN 3
        ELSE 9
      END AS rank,
      t.created_at AS tenant_created_at
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = _user_id AND tm.status = 'active'
  )
  SELECT tenant_id, tenant_name, member_role
  FROM ranked
  ORDER BY rank ASC, tenant_created_at ASC, tenant_id ASC
  LIMIT 1;
$function$;

-- current_user_tenant_id() and is_tenant_admin() are INTENTIONALLY UNCHANGED:
-- role='owner' is retained additively and kept in lockstep with is_owner, so their
-- existing role IN ('owner','admin') reads remain correct.

-- ============================================================================
-- [2] FIX-3 predicate-reader migration + RLS item-6 no-op cleanup.
-- ============================================================================

-- FIX-3: can_manage_tenant_brand — the authz branch that ORed t.owner_user_id=auth.uid()
-- now reads the authoritative is_tenant_owner() over the parent chain. The member branch
-- (role IN ('owner','admin')) is retained additively.
CREATE OR REPLACE FUNCTION public.can_manage_tenant_brand(_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE chain AS (
    SELECT id, parent_tenant_id, 0 AS depth
      FROM public.tenants WHERE id = _tenant_id
    UNION ALL
    SELECT p.id, p.parent_tenant_id, c.depth+1
      FROM public.tenants p JOIN chain c ON p.id = c.parent_tenant_id
     WHERE c.depth < 10
  )
  SELECT public.is_platform_owner() OR EXISTS (
    SELECT 1 FROM chain
    WHERE public.is_tenant_owner(auth.uid(), chain.id)          -- FIX-3: was t.owner_user_id=auth.uid()
       OR EXISTS (SELECT 1 FROM public.tenant_members m
                    WHERE m.tenant_id = chain.id AND m.user_id = auth.uid()
                      AND m.role IN ('owner','admin')
                      AND m.status = 'active')
  );
$function$;

-- FIX-3 sweep result (pg_get_functiondef over every postgres-owned SECURITY DEFINER that
-- writes public.tenant_members) — NO residual owner-escalation, verified 2026-08-03:
--   * accept_invitation, grant_tenant_member_role, agency_enter_subaccount(x2),
--     sync_user_role_to_tenant_member  → all derive tenant_role via
--     map_app_role_to_tenant_role(), which returns ONLY admin/coach/member (NEVER 'owner'),
--     and their ON CONFLICT branches PRESERVE an existing owner but never set one. None can
--     mint role='owner' or write is_owner. → not escalation vectors.
--   * sync_tenant_member_to_user_roles → reads tenant_members → user_roles; does not write
--     is_owner/role. → not a vector.
--   * The ONLY paths that mint an active owner are provision_tenant / provision_tenant_as
--     (trusted provisioning; is_owner=true added in writer_edits) and accept_tenant_invite's
--     ELSE branch (closed by FIX-1). is_signup_complete's owner_user_id OR is a boolean
--     signup-gate existence check, NOT a cross-tenant authz predicate → LEFT AS-IS (§13 note).

-- Item 6 (RLS): VERIFIED SUPERSEDED — no policy on public.tenants reads owner_user_id
-- (pg_policy scan of tenants quals returned zero matches, 2026-08-03), and the two named
-- legacy policies DO NOT EXIST. Idempotent no-op DROPs kept for provenance/re-runs.
DO $rls$
BEGIN
  DROP POLICY IF EXISTS remote_bootstrap          ON public.tenants;
  DROP POLICY IF EXISTS dynamic_tenant_data_wiring ON public.tenants;
END
$rls$;

-- ============================================================================
-- [3] OWNER GUARD — trg_tenant_members_owner_guard (SECURITY INVOKER trigger).
-- Forbids any authenticated/anon/authenticator direct-DML that sets/raises is_owner
-- or transitions role into/out of 'owner'. Trusted server paths (postgres-owned
-- SECURITY DEFINER provisioning / grant_co_owner / revoke_co_owner, and service_role
-- edge writes) and the platform owner are exempt. PROVEN unforgeable: client roles
-- cannot SET ROLE to an exempt role, and forging a JWT `role` claim needs the signing
-- secret. Invoker (default) so current_user reflects the true executing role.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_tenant_member_owner_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Exempt trusted server identities + the platform owner. NOTE: 'authenticator'
  -- is deliberately NOT exempt — it always SET ROLEs to authenticated/anon before
  -- running client DML, and the task requires authenticator direct-DML to be forbidden.
  IF current_user IN ('postgres','service_role','supabase_admin','supabase_auth_admin')
     OR public.is_platform_owner() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_owner, false)
       OR NEW.role = 'owner'::public.tenant_role THEN
      RAISE EXCEPTION
        'OWNER_GUARD: tenant ownership may only be set via grant_co_owner()/provisioning'
        USING ERRCODE = '42501';
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF (COALESCE(NEW.is_owner, false) IS DISTINCT FROM COALESCE(OLD.is_owner, false))
       OR ((NEW.role = 'owner'::public.tenant_role)
            IS DISTINCT FROM (OLD.role = 'owner'::public.tenant_role)) THEN
      RAISE EXCEPTION
        'OWNER_GUARD: tenant ownership may only be changed via grant_co_owner()/revoke_co_owner()'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tenant_members_owner_guard ON public.tenant_members;
CREATE TRIGGER trg_tenant_members_owner_guard
  BEFORE INSERT OR UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_member_owner_flag();

-- ============================================================================
-- [4] OWNER RPCs — the ONE home for ownership mutation (§18). Both postgres-owned
-- SECURITY DEFINER → guard-exempt (current_user=postgres inside the body). §16 lane
-- 'auto', audited to paige_audit_log WITH tenant_id.
-- ============================================================================

-- grant_co_owner: ELEVATES an EXISTING ACTIVE member to owner. Refuses non-active/
-- non-member. Gate: is_tenant_owner(caller) OR is_platform_owner().
CREATE OR REPLACE FUNCTION public.grant_co_owner(_tenant uuid, _user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_platform boolean := public.is_platform_owner();
  _active_member boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'CO_OWNER_UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL OR _user IS NULL THEN
    RAISE EXCEPTION 'CO_OWNER_BAD_ARGS' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_tenant_owner(_caller, _tenant) OR _is_platform) THEN
    RAISE EXCEPTION 'CO_OWNER_FORBIDDEN: only a tenant owner may grant co-ownership'
      USING ERRCODE = '42501';
  END IF;

  -- Elevate ONLY an existing, active member of THIS tenant.
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
     WHERE tenant_id = _tenant AND user_id = _user AND status = 'active'
  ) INTO _active_member;
  IF NOT _active_member THEN
    RAISE EXCEPTION
      'CO_OWNER_NOT_ACTIVE_MEMBER: target must be an active member of this tenant first'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_members
     SET is_owner = true,
         role     = 'owner'::public.tenant_role,
         status   = 'active',
         updated_at = now()
   WHERE tenant_id = _tenant AND user_id = _user;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    _caller,
    CASE WHEN _is_platform THEN 'super_admin' ELSE 'owner' END,
    'tenant:grant_co_owner', 'tenant_member', _user,
    jsonb_build_object('tenant_id', _tenant, 'lane', 'auto'),
    _tenant
  );
END;
$function$;

-- revoke_co_owner: demotes an owner to is_owner=false + role='admin' in lockstep, with a
-- last-owner FLOOR. Locks ALL active is_owner rows FOR UPDATE *before* counting (serializes
-- concurrent revokes so two callers cannot each pass the >1 check and strip the last owner).
CREATE OR REPLACE FUNCTION public.revoke_co_owner(_tenant uuid, _user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_platform boolean := public.is_platform_owner();
  _target_is_owner boolean;
  _owner_count int;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'CO_OWNER_UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL OR _user IS NULL THEN
    RAISE EXCEPTION 'CO_OWNER_BAD_ARGS' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_tenant_owner(_caller, _tenant) OR _is_platform) THEN
    RAISE EXCEPTION 'CO_OWNER_FORBIDDEN: only a tenant owner may revoke co-ownership'
      USING ERRCODE = '42501';
  END IF;

  -- Lock every active owner row for this tenant BEFORE the count (floor race guard).
  PERFORM 1
     FROM public.tenant_members
    WHERE tenant_id = _tenant AND is_owner = true AND status = 'active'
    FOR UPDATE;

  SELECT count(*) INTO _owner_count
    FROM public.tenant_members
   WHERE tenant_id = _tenant AND is_owner = true AND status = 'active';

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
     WHERE tenant_id = _tenant AND user_id = _user
       AND is_owner = true AND status = 'active'
  ) INTO _target_is_owner;

  IF NOT _target_is_owner THEN
    RAISE EXCEPTION 'CO_OWNER_NOT_OWNER: target is not an active owner of this tenant'
      USING ERRCODE = '42501';
  END IF;

  IF _owner_count <= 1 THEN
    RAISE EXCEPTION 'CO_OWNER_LAST: cannot revoke the last owner of a tenant'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_members
     SET is_owner = false,
         role     = 'admin'::public.tenant_role,
         updated_at = now()
   WHERE tenant_id = _tenant AND user_id = _user;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    _caller,
    CASE WHEN _is_platform THEN 'super_admin' ELSE 'owner' END,
    'tenant:revoke_co_owner', 'tenant_member', _user,
    jsonb_build_object('tenant_id', _tenant, 'lane', 'auto'),
    _tenant
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_co_owner(uuid, uuid)  FROM public, anon;
REVOKE ALL ON FUNCTION public.revoke_co_owner(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_co_owner(uuid, uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_co_owner(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- [5] FIX-1 (invite-token owner escalation) + FIX-2 (owner_user_id authz readers /
-- broken lockstep in change_user_role & revoke_tenant_member_role). All four are
-- postgres-owned SECURITY DEFINER → guard-exempt.
-- ============================================================================

-- FIX-1a: create_tenant_invite_token — defense-in-depth. A plain tenant admin may NOT
-- mint an owner-level invite; only a real owner (or platform owner) may. (Belt-and-
-- suspenders: accept_tenant_invite also coerces owner→admin. Live check 2026-08-03:
-- 0 owner tokens ever created, no code path passes _default_role='owner' — no flow breaks.
-- The doctrine-correct flow is: invite as member/admin, then call grant_co_owner().)
CREATE OR REPLACE FUNCTION public.create_tenant_invite_token(_tenant_id uuid, _kind text DEFAULT 'consumer'::text, _default_role tenant_role DEFAULT 'member'::tenant_role, _expires_in_days integer DEFAULT 30, _max_uses integer DEFAULT NULL::integer, _contact_id uuid DEFAULT NULL::uuid, _email text DEFAULT NULL::text)
 RETURNS tenant_invite_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.tenant_invite_tokens;
  _new_token text;
  _contact_ok boolean;
BEGIN
  IF NOT (public.is_platform_owner()
          OR public.is_tenant_admin(_tenant_id)
          OR public.agency_can_manage_child(_tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'not authorized to create invite tokens for this tenant';
  END IF;
  IF _kind NOT IN ('consumer', 'team', 'subaccount_owner', 'agency_team') THEN
    RAISE EXCEPTION 'invalid invite kind: %', _kind;
  END IF;

  -- FIX-1 (§9): owner-level invite requires actual ownership, not mere admin.
  IF _default_role = 'owner'::public.tenant_role
     AND NOT (public.is_tenant_owner(auth.uid(), _tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'not authorized to create an owner-level invite for this tenant; owner elevation is via grant_co_owner()'
      USING ERRCODE = '42501';
  END IF;

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
END $function$;

-- FIX-1b: accept_tenant_invite — an invite NEVER mints/elevates ownership.
--   * ELSE (generic staff/'team') branch: fresh seat pins is_owner=false and coerces any
--     (already source-rejected) owner default_role to 'admin'; the ON CONFLICT path leaves
--     is_owner AND role UNTOUCHED (see the §13 NOTE — forcing is_owner=false on conflict
--     would DEMOTE / last-owner-strip a legitimate owner who re-accepts a staff invite;
--     escalation is still impossible because the fresh INSERT can only ever pin FALSE and
--     the conflict path can only ever preserve the existing bit).
--   * subaccount_owner branch: ON CONFLICT now PRESERVES an existing owner (role/is_owner
--     lockstep) instead of unconditionally downgrading role to 'admin'.
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
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tok.tenant_id, _uid, 'admin', 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = (CASE WHEN public.tenant_members.role = 'owner'::public.tenant_role
                       THEN 'owner'::public.tenant_role
                       ELSE 'admin'::public.tenant_role END),  -- FIX-1: preserve owner (lockstep), never downgrade
          status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();

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
    -- fresh-INSERT (pins false) + the create-side owner-token rejection. Flagged for owner
    -- ruling in the rationale.
  END IF;

  UPDATE public.tenant_invite_tokens SET uses = uses + 1, last_used_at = now() WHERE id = _tok.id;
  UPDATE public.profiles SET active_tenant_id = _tok.tenant_id WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $function$;

-- FIX-2a: change_user_role — owner recognition reads is_tenant_owner (authoritative),
-- NOT tenants.owner_user_id; and REFUSES any role change on an owner (one home:
-- revoke_co_owner). Makes an is_owner/role desync via this path unreachable.
CREATE OR REPLACE FUNCTION public.change_user_role(_target_user_id uuid, _from_role app_role, _to_role app_role, _tenant_id uuid DEFAULT NULL::uuid, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _resolved_tenant uuid;
  _is_owner_call boolean := public.is_platform_owner();
  _is_admin_call boolean;
  _target_is_owner boolean;
  _tenant_role public.tenant_role;
  _protected public.app_role[] := ARRAY['admin','super_admin','platform_admin']::public.app_role[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  _resolved_tenant := COALESCE(_tenant_id, public.current_user_tenant_id());
  IF _resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_NO_TENANT' USING ERRCODE = '22023';
  END IF;

  _is_admin_call := public.is_tenant_admin(_resolved_tenant) OR public.has_role(_caller, 'admin'::public.app_role);

  IF NOT (_is_owner_call OR _is_admin_call) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: admin privileges required' USING ERRCODE = '42501';
  END IF;

  IF NOT _is_owner_call AND (_from_role = ANY(_protected) OR _to_role = ANY(_protected)) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cannot modify admin or super_admin (owner-only)'
      USING ERRCODE = '42501';
  END IF;

  IF _to_role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: super_admin is bootstrap-only' USING ERRCODE = '42501';
  END IF;

  -- FIX-2 (§9, Slice A Option 1): read the authoritative is_owner signal, NOT the
  -- display-only tenants.owner_user_id, and REFUSE any role change on a tenant owner
  -- (incl. a grant_co_owner co-owner). Ownership mutates ONLY via revoke_co_owner().
  _target_is_owner := public.is_tenant_owner(_target_user_id, _resolved_tenant);
  IF _target_is_owner THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: this member is a tenant owner; use revoke_co_owner() to change ownership'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = _from_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, _to_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    _tenant_role := public.map_app_role_to_tenant_role(_to_role);
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
    VALUES (_resolved_tenant, _target_user_id, _tenant_role, 'active', now(), now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = EXCLUDED.role, status = 'active', updated_at = now()
      WHERE public.tenant_members.role <> 'owner'::public.tenant_role;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.paige_audit_log
      (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
    VALUES (
      _caller,
      CASE WHEN _is_owner_call THEN 'super_admin' ELSE 'admin' END,
      'role:change:mirror_failed', 'user_role', _target_user_id,
      jsonb_build_object(
        'from_role', _from_role,
        'to_role', _to_role,
        'tenant_id', _resolved_tenant,
        'error_message', SQLERRM,
        'error_code', SQLSTATE
      ),
      _resolved_tenant
    );
  END;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    _caller,
    CASE WHEN _is_owner_call THEN 'super_admin' ELSE 'admin' END,
    'role:change', 'user_role', _target_user_id,
    jsonb_build_object('from_role', _from_role, 'to_role', _to_role,
                       'tenant_id', _resolved_tenant, 'reason', _reason),
    _resolved_tenant
  );
END;
$function$;

-- FIX-2b: revoke_tenant_member_role — refuse to modify a tenant owner (early gate reads
-- is_tenant_owner); the inner admin-branch owner check is also migrated off owner_user_id.
CREATE OR REPLACE FUNCTION public.revoke_tenant_member_role(_user_id uuid, _role app_role, _tenant_id uuid DEFAULT NULL::uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _resolved_tenant uuid;
  _is_owner_call boolean := public.is_platform_owner();
  _is_admin_call boolean;
  _target_is_tenant_owner boolean;
  _admin_count int;
  _active_clients int;
  _new_role public.tenant_role;
  _protected public.app_role[] := ARRAY['admin','super_admin','platform_admin']::public.app_role[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: authentication required' USING ERRCODE = '42501';
  END IF;
  _resolved_tenant := COALESCE(_tenant_id, public.current_user_tenant_id());
  IF _resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: no active tenant context' USING ERRCODE = '22023';
  END IF;
  _is_admin_call := public.is_tenant_admin(_resolved_tenant) OR public.has_role(_caller, 'admin'::public.app_role);
  IF NOT (_is_owner_call OR _is_admin_call) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: admin privileges required' USING ERRCODE = '42501';
  END IF;

  -- FIX-2 (§9): refuse to modify a tenant owner here; ownership changes go through
  -- revoke_co_owner() exclusively (prevents an is_owner/role lockstep break).
  IF public.is_tenant_owner(_user_id, _resolved_tenant) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: this member is a tenant owner; use revoke_co_owner() to change ownership'
      USING ERRCODE = '42501';
  END IF;

  IF NOT _is_owner_call AND _role = ANY(_protected) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cannot modify admin or super_admin (owner-only)' USING ERRCODE = '42501';
  END IF;
  IF _role = 'admin'::public.app_role THEN
    IF public.is_super_admin(_user_id) THEN
      RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cannot remove admin from the platform owner' USING ERRCODE = '42501';
    END IF;
    -- FIX-2: migrated off tenants.owner_user_id (now redundant with the early owner-refuse
    -- above, but kept so no authz predicate reads the display-only column).
    _target_is_tenant_owner := public.is_tenant_owner(_user_id, _resolved_tenant);
    IF _target_is_tenant_owner THEN
      RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: the tenant owner cannot lose admin' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO _admin_count FROM public.user_roles WHERE role = 'admin'::public.app_role;
    IF _admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN: at least one admin must remain' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF _role = 'coach'::public.app_role THEN
    SELECT
      (SELECT count(*) FROM public.clients
        WHERE assigned_coach_user_id = _user_id AND coalesce(status, 'active') = 'active')
      + (SELECT count(*) FROM public.coach_clients
        WHERE coach_user_id = _user_id AND coalesce(status, 'active') = 'active')
    INTO _active_clients;
    IF _active_clients > 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'active_clients', 'active_count', _active_clients);
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role)
      THEN 'admin'::public.tenant_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'coach'::public.app_role)
      THEN 'coach'::public.tenant_role
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id
         AND role = ANY(ARRAY['sales_rep','broker','cs_rep','finance','viewer','moderator','affiliate']::public.app_role[])
    ) THEN 'member'::public.tenant_role
    ELSE NULL
  END INTO _new_role;

  IF _new_role IS NULL THEN
    UPDATE public.tenant_members SET status = 'revoked', updated_at = now()
     WHERE tenant_id = _resolved_tenant AND user_id = _user_id AND role <> 'owner'::public.tenant_role;
  ELSE
    UPDATE public.tenant_members SET role = _new_role, status = 'active', updated_at = now()
     WHERE tenant_id = _resolved_tenant AND user_id = _user_id AND role <> 'owner'::public.tenant_role;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'tenant_member', 'revoke_tenant_member_role', _user_id,
          jsonb_build_object('tenant_id', _resolved_tenant, 'role', _role, 'reason', _reason));
  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (_caller, CASE WHEN _is_owner_call THEN 'super_admin' ELSE 'admin' END,
          'role:revoke_one', 'user_role', _user_id,
          jsonb_build_object('role', _role, 'tenant_id', _resolved_tenant, 'reason', _reason),
          _resolved_tenant);
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ============================================================================
-- [6] WRITER EDITS — provisioning mints is_owner=true wherever it mints an active
-- role='owner'. All postgres-owned SECURITY DEFINER → guard-exempt; self/no-JWT →
-- #614 consent-exempt.
-- ============================================================================

-- provision_tenant: the owner-member INSERT now sets is_owner=true (was role='owner' only).
CREATE OR REPLACE FUNCTION public.provision_tenant(_name text, _industry text DEFAULT NULL::text, _team_size text DEFAULT NULL::text, _description text DEFAULT NULL::text, _account_type text DEFAULT 'standalone'::text, _agreement_slug text DEFAULT NULL::text, _agreement_version integer DEFAULT NULL::integer)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _type text := lower(coalesce(_account_type, 'standalone'));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'business name required' USING ERRCODE = '22000';
  END IF;
  IF _type NOT IN ('standalone', 'agency', 'enterprise') THEN
    _type := 'standalone';
  END IF;

  SELECT t.* INTO _tenant
    FROM public.tenants t
   WHERE t.owner_user_id = _uid AND t.parent_tenant_id IS NULL
   ORDER BY t.created_at ASC
   LIMIT 1;
  IF FOUND THEN
    UPDATE public.profiles SET active_tenant_id = _tenant.id
     WHERE user_id = _uid AND active_tenant_id IS NULL;
    RETURN _tenant;
  END IF;

  IF _agreement_slug IS NULL OR _agreement_version IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.legal_documents ld
        WHERE ld.slug = _agreement_slug
          AND ld.version = _agreement_version
          AND ld.is_current
     ) THEN
    RAISE EXCEPTION 'You must review and accept the subscriber agreement to create your account'
      USING ERRCODE = 'P0001';
  END IF;

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'tenant'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  BEGIN
    INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, trial_ends_at, account_type, brand)
    VALUES (
      _slug, trim(_name), _uid, NULL, 'trial', now() + interval '14 days', _type,
      jsonb_strip_nulls(jsonb_build_object(
        'industry', _industry,
        'team_size', _team_size,
        'about', _description
      ))
    )
    RETURNING * INTO _tenant;
  EXCEPTION WHEN unique_violation THEN
    SELECT t.* INTO _tenant
      FROM public.tenants t
     WHERE t.owner_user_id = _uid AND t.parent_tenant_id IS NULL
     ORDER BY t.created_at ASC
     LIMIT 1;
    IF NOT FOUND THEN RAISE; END IF;
    UPDATE public.profiles SET active_tenant_id = _tenant.id
     WHERE user_id = _uid AND active_tenant_id IS NULL;
    RETURN _tenant;
  END;

  -- Slice A: mint the owner membership WITH the authoritative is_owner=true.
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', true, now());

  UPDATE public.profiles SET
    active_tenant_id    = _tenant.id,
    signup_completed_at = COALESCE(signup_completed_at, now()),
    terms_accepted_at   = now(),
    terms_version       = _agreement_slug || '@' || _agreement_version::text,
    signup_lane         = _type
  WHERE user_id = _uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, active_tenant_id, signup_completed_at, terms_accepted_at, terms_version, signup_lane)
    VALUES (_uid, _tenant.id, now(), now(), _agreement_slug || '@' || _agreement_version::text, _type);
  END IF;

  INSERT INTO public.legal_acceptances (user_id, document_slug, document_version, context)
  VALUES (
    _uid, _agreement_slug, _agreement_version,
    jsonb_build_object('via', 'provision_tenant', 'lane', _type, 'tenant_id', _tenant.id)
  );

  BEGIN
    INSERT INTO public.platform_usage_events (tenant_id, event_type, quantity, unit, metadata)
    VALUES (
      _tenant.id, 'tenant_provisioned', 1, 'signup',
      jsonb_strip_nulls(jsonb_build_object(
        'account_type', _type,
        'owner_user_id', _uid,
        'tenant_name', _tenant.name,
        'source', 'front_door',
        'agreement', _agreement_slug || '@' || _agreement_version::text
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'signup platform feed (tenant_provisioned) failed: %', SQLERRM;
  END;

  RETURN _tenant;
END;
$function$;

-- provision_tenant_as: BOTH owner-member inserts (idempotent early-return + main) set
-- is_owner=true. (ON CONFLICT DO NOTHING keeps its idempotency contract; a pre-existing
-- non-owner row is left as-is — backfill already covered live owners.)
CREATE OR REPLACE FUNCTION public.provision_tenant_as(_owner uuid, _name text DEFAULT NULL::text, _account_type text DEFAULT 'standalone'::text)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _tenant public.tenants;
  _display text;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _type text := lower(coalesce(_account_type, 'standalone'));
begin
  if _owner is null then
    raise exception 'owner required' using errcode = '22004';
  end if;
  if _type not in ('standalone', 'agency', 'enterprise') then
    _type := 'standalone';
  end if;

  select t.* into _tenant
    from public.tenants t
   where t.owner_user_id = _owner and t.parent_tenant_id is null
   order by t.created_at asc
   limit 1;
  if found then
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
      values (_tenant.id, _owner, 'owner', 'active', true, now())
      on conflict (tenant_id, user_id) do nothing;
    return _tenant;
  end if;

  _display := coalesce(
    nullif(trim(_name), ''),
    nullif(trim((select full_name from public.profiles where user_id = _owner)), '') || '''s Workspace',
    'My Workspace'
  );

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_display)), '[^a-z0-9]+', '-', 'g'));
  if _base_slug is null or length(_base_slug) = 0 then _base_slug := 'tenant'; end if;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  while exists (select 1 from public.tenants where slug = _slug) loop
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  end loop;

  begin
    insert into public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
    values (_slug, _display, _owner, null, 'active', _type, '{}'::jsonb)
    returning * into _tenant;
  exception when unique_violation then
    select t.* into _tenant
      from public.tenants t
     where t.owner_user_id = _owner and t.parent_tenant_id is null
     order by t.created_at asc
     limit 1;
    if not found then raise; end if;
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    return _tenant;
  end;

  insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
  values (_tenant.id, _owner, 'owner', 'active', true, now())
  on conflict (tenant_id, user_id) do nothing;

  update public.profiles set
    active_tenant_id    = _tenant.id,
    signup_completed_at = coalesce(signup_completed_at, now())
  where user_id = _owner;
  if not found then
    insert into public.profiles (user_id, active_tenant_id, signup_completed_at)
    values (_owner, _tenant.id, now())
    on conflict (user_id) do update set active_tenant_id = excluded.active_tenant_id;
  end if;

  begin
    insert into public.platform_usage_events (tenant_id, event_type, quantity, metadata)
    values (
      _tenant.id, 'tenant_provisioned', 1,
      jsonb_build_object('via', 'platform_subscription_webhook', 'account_type', _type)
    );
  exception when others then null; end;

  return _tenant;
end;
$function$;
