-- =============================================================================
-- Wave 2: SECURITY DEFINER WRITER function hardening  (§9 P0 #117)
-- =============================================================================
-- Refs: §9 tenant isolation · §30 fix-in-place (harden, do not drop orphans)
--       §37 producer inventory · §39 adversarial peer-gate · §53 operator tiers
--       Hotfix #117 (definer-fn-audit)
--
-- Nine SECURITY DEFINER functions perform WRITES (or expose operator data) while
-- authorizing on GLOBAL role checks (has_role) or missing tenant-scope predicates,
-- so a legitimately-privileged caller in tenant A could act on tenant B's rows —
-- a cross-tenant §9 authority hole that SECURITY DEFINER makes exploitable because
-- it runs as the definer and bypasses RLS.
--
-- Each fix below was §39-adversarially confirmed SHIP-NOW-SAFE (zero regression to
-- any legitimate caller):
--   • AGENCY parents operate on sub-accounts by CONTEXT-SWITCH, so at call time
--     current_user_tenant_id()/is_tenant_admin() resolve to the switched-into
--     sub-account — the tenant-scoped guards hold.
--   • OPERATORS are preserved via is_platform_owner()/is_platform_operator()
--     branches (God + delegated platform_admin, §53).
--   • SERVICE-ROLE / edge callers land on the auth.uid() IS NULL path and are
--     intentionally exempt (they pass an already-verified tenant/operator context).
--
-- Each function is reproduced VERBATIM from prod pg_get_functiondef with ONLY the
-- documented change; signatures, return types, search_path, volatility, and all
-- other lines are preserved.
--
-- Per-function leak class + change:
--   1. accept_invitation(text,uuid)          — no auth.uid() check, arbitrary _user_id,
--        no email binding → any authed user could redeem any invite for any account
--        as anyone. ADD: auth required + _user_id=auth.uid() + caller-email must
--        match invitation.email (case-insensitive).
--   2. admin_bulk_assign_coach(uuid,uuid[])  — global has_role('admin'|'owner') gate +
--        unscoped UPDATE clients → admin in any tenant reassigns any tenant's clients.
--        SWAP gate to is_tenant_admin(current)/is_platform_owner; scope UPDATE to
--        caller tenant; require _coach be an active member of caller tenant.
--   3. admin_metering_dead_letter_summary()  — global has_role('admin') gate on a
--        PLATFORM-wide operator report → any tenant admin reads platform billing risk.
--        SWAP gate to is_platform_operator() (§53).
--   4. admin_remove_coach_role(uuid)         — global has_role gate, no tenant bind →
--        admin in any tenant strips a coach in any tenant. SWAP gate to
--        is_platform_operator()/is_tenant_admin(current); require target be a member
--        of caller tenant; scope the active-client count to caller tenant.
--   5. claim_client(uuid)                    — SELECT clients WHERE id=_client_id with
--        no tenant bind → a rep claims a client in another tenant. ADD tenant scope.
--   6. create_contact(...)                   — JWT caller could pass p_tenant_id of a
--        foreign tenant. ADD a JWT-branch-only guard rejecting a foreign p_tenant_id
--        (service path auth.uid() IS NULL stays trusted).
--   7. revoke_tenant_member_role(...)        — _is_admin_call OR'd in global
--        has_role('admin') → a global admin bypasses tenant scope. DROP that OR term
--        (is_tenant_admin(resolved) + is_platform_owner branch remain).
--   8. save_marketing_content(...)           — membership guard OR-exempted global
--        has_role('admin') → global admin writes into any tenant. DROP that term.
--   9. save_to_library(...)                  — same membership-guard global-admin
--        exemption as #8. DROP that term.
-- =============================================================================

-- 1) accept_invitation — bind to authenticated caller + invitation email -------
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text, _user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _invitation record;
  _token_hash text;
  _tenant_role public.tenant_role;
  _caller_email text;
BEGIN
  -- §9/#117: an invitation may only be redeemed BY the authenticated caller,
  -- FOR themselves, and only when the caller's email matches the invite target.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF _user_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _token_hash := encode(digest(_token, 'sha256'), 'hex');

  SELECT * INTO _invitation
  FROM public.invitations
  WHERE token_hash = _token_hash
    AND accepted_at IS NULL
    AND expires_at > now();

  IF _invitation IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Invalid or expired invitation');
  END IF;

  -- §9/#117: the caller's verified email must match the invitation's target email.
  SELECT email INTO _caller_email FROM auth.users WHERE id = auth.uid();
  IF _caller_email IS NULL
     OR _invitation.email IS NULL
     OR lower(_caller_email) <> lower(_invitation.email) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _invitation.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _invitation.tenant_id IS NOT NULL
     AND _invitation.role::text IN ('admin','coach','sales_rep','broker','broker_team_member','cs_rep','finance','viewer','moderator','user','client')
     AND _invitation.role <> 'super_admin'::public.app_role THEN
    _tenant_role := public.map_app_role_to_tenant_role(_invitation.role);

    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
    VALUES (_invitation.tenant_id, _user_id, _tenant_role, 'active', _invitation.created_at, now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = CASE
            WHEN public.tenant_members.role = 'owner'::public.tenant_role THEN public.tenant_members.role
            WHEN EXCLUDED.role = 'admin'::public.tenant_role THEN 'admin'::public.tenant_role
            WHEN EXCLUDED.role = 'coach'::public.tenant_role
                 AND public.tenant_members.role NOT IN ('admin'::public.tenant_role, 'owner'::public.tenant_role)
              THEN 'coach'::public.tenant_role
            ELSE public.tenant_members.role
          END,
          status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();

    UPDATE public.profiles
       SET active_tenant_id = _invitation.tenant_id
     WHERE user_id = _user_id
       AND active_tenant_id IS NULL;
  END IF;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE id = _invitation.id;

  RETURN json_build_object(
    'success', true,
    'role', _invitation.role,
    'tenant_id', _invitation.tenant_id,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;

-- 2) admin_bulk_assign_coach — tenant-admin gate + tenant-scoped write ----------
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_coach(_coach uuid, _client_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  updated int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  -- §9/#117: authorize on the caller's ACTIVE tenant, not a global admin/owner role.
  IF NOT (public.is_tenant_admin(public.current_user_tenant_id()) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _coach AND role = 'coach') THEN
    RAISE EXCEPTION 'target_user_is_not_a_coach';
  END IF;

  -- §9/#117: the coach must be an active member of the caller's tenant.
  IF NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM public.tenant_members
        WHERE tenant_id = public.current_user_tenant_id()
          AND user_id = _coach
          AND status = 'active'
     ) THEN
    RAISE EXCEPTION 'target_coach_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clients
     SET assigned_coach_user_id = _coach,
         updated_at = now()
   WHERE id = ANY(_client_ids)
     AND tenant_id = public.current_user_tenant_id();
  GET DIAGNOSTICS updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', updated);
END;
$function$;

-- 3) admin_metering_dead_letter_summary — platform-operator gate ----------------
CREATE OR REPLACE FUNCTION public.admin_metering_dead_letter_summary()
 RETURNS TABLE(event_type text, status text, row_count bigint, dollars_at_risk numeric, oldest_failure timestamp with time zone, most_recent_failure timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- §9/§53/#117: this is a PLATFORM-wide operator report; gate on operator tier.
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.event_type,
    d.status,
    COUNT(*)::bigint,
    ROUND(SUM(COALESCE(d.quantity,1) * COALESCE(d.unit_amount_cents,0))::numeric / 100.0, 2),
    MIN(d.first_failed_at),
    MAX(d.last_failed_at)
  FROM public.platform_metered_events_dead_letter d
  GROUP BY d.event_type, d.status
  ORDER BY d.status, d.event_type;
END;
$function$;

-- 4) admin_remove_coach_role — operator/tenant-admin gate + tenant bind ---------
CREATE OR REPLACE FUNCTION public.admin_remove_coach_role(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  active_count int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  -- §9/§53/#117: authorize on operator tier OR the caller's ACTIVE tenant, not a
  -- global admin/owner role.
  IF NOT (public.is_platform_operator() OR public.is_tenant_admin(public.current_user_tenant_id())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- §9/#117: the target must be a member of the caller's tenant (operators exempt).
  IF NOT public.is_platform_operator()
     AND NOT EXISTS (
       SELECT 1 FROM public.tenant_members
        WHERE tenant_id = public.current_user_tenant_id()
          AND user_id = _user_id
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT
    (SELECT count(*) FROM public.clients
      WHERE assigned_coach_user_id = _user_id AND coalesce(status, 'active') = 'active'
        AND tenant_id = public.current_user_tenant_id())
    + (SELECT count(*) FROM public.coach_clients
      WHERE coach_user_id = _user_id AND coalesce(status, 'active') = 'active')
  INTO active_count;
  IF active_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'active_clients', 'active_count', active_count);
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'coach';
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 5) claim_client — tenant-scoped client lookup --------------------------------
CREATE OR REPLACE FUNCTION public.claim_client(_client_id uuid)
 RETURNS paige_coach_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _client_tier text;
  _role app_role;
  _assignment_role text;
  _pool text[];
  _row public.paige_coach_assignments;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;

  IF public.has_role(_uid, 'sales_rep'::app_role) THEN
    _role := 'sales_rep'::app_role;
  ELSIF public.has_role(_uid, 'cs_rep'::app_role) THEN
    _role := 'cs_rep'::app_role;
  ELSE
    RAISE EXCEPTION 'role_not_eligible_to_claim' USING ERRCODE = '42501';
  END IF;

  _assignment_role := public.assignment_role_for(_role);
  _pool := public.tier_pool_for_role(_role);

  -- §9/#117: a rep may only claim a client within their own tenant.
  SELECT tier INTO _client_tier FROM public.clients
   WHERE id = _client_id AND tenant_id = public.current_user_tenant_id();
  IF _client_tier IS NULL OR NOT (_client_tier = ANY(_pool)) THEN
    RAISE EXCEPTION 'client_not_in_pool' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.paige_coach_assignments
    (contact_id, assigned_role, rep_user_id, active, metadata)
  VALUES
    (_client_id, _assignment_role, _uid, true,
     jsonb_build_object('source','self_claim','claimed_at', now()))
  ON CONFLICT (contact_id, assigned_role) WHERE active = true DO NOTHING
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'claim_race_lost' USING ERRCODE = '40001';
  END IF;

  RETURN _row;
END $function$;

-- 6) create_contact — JWT-branch cross-tenant guard ----------------------------
CREATE OR REPLACE FUNCTION public.create_contact(p_first_name text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_entity_name text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_lifecycle_stage text DEFAULT 'new_lead'::text, p_source text DEFAULT 'paige'::text, p_tags text[] DEFAULT '{}'::text[], p_primary_offer text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_assigned_coach_user_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller  uuid := auth.uid();
  _creator uuid := COALESCE(auth.uid(), p_created_by);  -- JWT caller wins; edge passes verified operator
  _tenant  uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _id uuid;
  _existing uuid;
  _email text := NULLIF(btrim(p_email), '');
BEGIN
  IF _creator IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_OPERATOR: an operator context is required' USING ERRCODE = '42501';
  END IF;
  -- The effective creator must be admin|coach — always enforced now, JWT or edge path.
  IF NOT public.has_any_role(_creator, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  -- §9/#117: on the JWT path only, a caller may not create a contact for a FOREIGN
  -- tenant. The service path (auth.uid() IS NULL) stays trusted — edge passes an
  -- already-verified p_tenant_id/p_created_by.
  IF _caller IS NOT NULL
     AND p_tenant_id IS NOT NULL
     AND p_tenant_id <> public.current_user_tenant_id()
     AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'cross-tenant contact create forbidden' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency on (created_by, lower(email)), keyed to the effective creator.
  IF _email IS NOT NULL THEN
    SELECT id INTO _existing FROM public.clients
     WHERE created_by = _creator AND lower(email) = lower(_email) LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  END IF;

  INSERT INTO public.clients (
    first_name, last_name, email, phone, entity_name, title,
    lifecycle_stage, source, tags, primary_offer, current_notes,
    assigned_coach_user_id, status, created_by, tenant_id, created_by_channel_type
  ) VALUES (
    COALESCE(NULLIF(btrim(p_first_name), ''), NULLIF(split_part(COALESCE(_email,''), '@', 1), ''), 'New'),
    COALESCE(NULLIF(btrim(p_last_name), ''), 'Contact'),
    _email, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_entity_name), ''), NULLIF(btrim(p_title), ''),
    COALESCE(NULLIF(p_lifecycle_stage, ''), 'new_lead'), COALESCE(NULLIF(p_source, ''), 'paige'),
    COALESCE(p_tags, '{}'), NULLIF(btrim(p_primary_offer), ''), NULLIF(btrim(p_notes), ''),
    p_assigned_coach_user_id, 'active', _creator, _tenant, NULLIF(btrim(p_channel), '')
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_creator, 'client', 'create_contact', _id,
          jsonb_build_object('tenant_id', _tenant, 'email', _email, 'source', p_source, 'channel', p_channel));

  RETURN _id;
END;
$function$;

-- 7) revoke_tenant_member_role — drop global-admin OR term ----------------------
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
  -- §9/#117: drop the global has_role('admin') OR — authorize strictly on the
  -- RESOLVED tenant (is_tenant_admin) or the platform-owner branch below.
  _is_admin_call := public.is_tenant_admin(_resolved_tenant);
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

-- 8) save_marketing_content — drop global-admin exemption from membership guard --
CREATE OR REPLACE FUNCTION public.save_marketing_content(p_kind text, p_title text, p_body text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_image_path text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_brief text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb, p_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _kind text := CASE WHEN p_kind IN ('text','image','video','document') THEN p_kind ELSE 'text' END;
  _id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  -- §9/#117: membership is required for a JWT caller; a global 'admin' role no longer
  -- exempts a cross-tenant write (platform owner still may).
  IF _caller IS NOT NULL
     AND NOT public.is_tenant_member(_tenant)
     AND NOT public.is_platform_owner(_caller) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: tenant not in your membership' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.marketing_content SET
      title = COALESCE(NULLIF(btrim(p_title), ''), title),
      body = COALESCE(p_body, body),
      channel = COALESCE(p_channel, channel),
      brief = COALESCE(p_brief, brief),
      meta = COALESCE(p_meta, meta),
      image_url = COALESCE(NULLIF(btrim(p_image_url), ''), image_url),
      image_path = COALESCE(NULLIF(btrim(p_image_path), ''), image_path),
      size = COALESCE(NULLIF(btrim(p_size), ''), size)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RETURN _id;
  END IF;

  INSERT INTO public.marketing_content (
    tenant_id, created_by, kind, channel, title, body,
    image_url, image_path, size, brief, meta
  ) VALUES (
    _tenant, _caller, _kind, NULLIF(btrim(p_channel), ''),
    COALESCE(NULLIF(btrim(p_title), ''), 'Untitled'), p_body,
    NULLIF(btrim(p_image_url), ''), NULLIF(btrim(p_image_path), ''),
    NULLIF(btrim(p_size), ''), p_brief, COALESCE(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'marketing_content', 'save_marketing_content', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'channel', p_channel));

  RETURN _id;
END;
$function$;

-- 9) save_to_library — drop global-admin exemption from membership guard --------
CREATE OR REPLACE FUNCTION public.save_to_library(p_kind text, p_artifact_id uuid, p_title text DEFAULT NULL::text, p_thumbnail_url text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _title text := NULLIF(btrim(p_title), '');
  _id uuid;
BEGIN
  IF p_kind NOT IN ('page','funnel','form','image','video','copy','document') THEN
    RAISE EXCEPTION 'LIBRARY_BAD_KIND: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_artifact_id IS NULL THEN
    RAISE EXCEPTION 'LIBRARY_NO_ARTIFACT: an artifact id is required' USING ERRCODE = '22023';
  END IF;
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'LIBRARY_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  -- §9/#117: membership is required for a JWT caller; a global 'admin' role no longer
  -- exempts a cross-tenant write (platform owner still may).
  IF _caller IS NOT NULL
     AND NOT public.is_tenant_member(_tenant)
     AND NOT public.is_platform_owner(_caller) THEN
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: tenant not in your membership' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.studio_library_items (
    tenant_id, created_by, artifact_kind, artifact_id, title, thumbnail_url, note, saved_at
  ) VALUES (
    _tenant, _caller, p_kind, p_artifact_id,
    COALESCE(_title, 'Untitled'),
    NULLIF(btrim(p_thumbnail_url), ''), p_note, now()
  )
  ON CONFLICT (tenant_id, artifact_kind, artifact_id) DO UPDATE SET
    title         = COALESCE(_title, studio_library_items.title),
    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, studio_library_items.thumbnail_url),
    note          = COALESCE(EXCLUDED.note, studio_library_items.note),
    saved_at      = now()
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'studio_library_items', 'save_to_library', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', p_kind, 'artifact_id', p_artifact_id));

  RETURN _id;
END;
$function$;
