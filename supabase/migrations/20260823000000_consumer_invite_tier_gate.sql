-- §60 SERVER HALF of the customer-portal-invite tier-lock (owner-ruled 2026-08-11).
--
-- WHAT: add an `account_type` guard to create_tenant_invite_token's CONSUMER path so
-- consumer / customer-portal invites are mintable ONLY by Solo + Sub-account tenants —
-- never by an agency or enterprise tenant. An agency manages sub-accounts, not a direct
-- consumer client book, so it has no business minting a client-portal invite under its
-- own tenant_id. This is the server-side companion to the UI helper
-- `hasFeature('customer_portal_invite')` (`src/lib/tier/tierFeatures.ts`), which already
-- hides the affordance on agency/enterprise — this migration makes the lock REAL (§13:
-- not nav-only) at the RPC boundary for every caller.
--
-- FAITHFUL SUPERSET: this is the LIVE 7-arg definition from
-- 20260804020000_hole227_subaccount_owner_correction.sql (Part F.1), reproduced BYTE-FOR-
-- BYTE, with exactly ONE addition — the §60 consumer guard, inserted right after the
-- kind-validity check and before the subaccount_owner narrowing block. Nothing else
-- changes: same signature, same SECURITY DEFINER, same `SET search_path TO 'public'`,
-- same GRANTs (CREATE OR REPLACE preserves the existing EXECUTE grant to `authenticated`).
-- The team / subaccount_owner / agency_team / owner-role paths are untouched.
--
-- §37 PRODUCER INVENTORY — the 5 consumer-invite minters, all confirmed UI-gated to the
-- caller's OWN tenant, none targeting an agency/enterprise tenant:
--   1. src/components/admin/portal/… "Invite to portal" (client-file surface) — own tenant.
--   2. src/pages/admin/PortalStudio (Client Portal tab, AdminOnly) — own tenant.
--   3. WorkspaceSettingsPanel (Setup surface) — own tenant (the 5th minter caught by the
--      §39 peer-gate in this PR's UI work; now hasFeature-gated).
--   4. src/pages/admin/ClientsHub portal landing — own tenant.
--   5. paige-driven action seam (contact → portal invite) — resolves the caller's tenant.
-- No shipped flow mints a consumer invite for an agency/enterprise-typed tenant, so the
-- guard breaks no legitimate producer (§37). Every OTHER kind (team / subaccount_owner /
-- agency_team) is unaffected — the guard keys on `_kind = 'consumer'` only.
--
-- §51 tier-safe: keys on the TARGET tenant's account_type (the tenant the invite is FOR),
-- resolved from public.tenants — not on the caller's role — so it holds for God, agency,
-- standalone, and sub-account callers alike. A platform owner minting a consumer invite
-- FOR an agency tenant is still blocked (there is no such legitimate flow).

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

  -- §60 (owner-ruled 2026-08-11): customer portal / consumer invites are Solo + Sub-account
  -- ONLY. An agency (or enterprise) manages sub-accounts, not a direct consumer client book.
  -- Server-enforced (the UI helper hasFeature('customer_portal_invite') mirrors this). Applies
  -- to ALL callers incl. platform owner — no shipped flow mints a consumer invite for an
  -- agency/enterprise tenant (§37 producer inventory confirmed). Other kinds are unaffected.
  IF _kind = 'consumer'
     AND (SELECT account_type FROM public.tenants WHERE id = _tenant_id) IN ('agency','enterprise') THEN
    RAISE EXCEPTION 'consumer/portal invites are not available for this account type (agency/enterprise manage sub-accounts, not a direct client book)'
      USING ERRCODE = '42501';
  END IF;

  -- #227 HOLE#1 Layer-1 (§9): a subaccount_owner invite ESTABLISHES ownership on accept,
  -- so only the agency principal that manages this child (or the platform) may mint it.
  -- is_tenant_admin(child) is deliberately NOT sufficient — that is the admin self-mint vector.
  IF _kind = 'subaccount_owner'
     AND NOT (public.is_platform_owner()
              OR public.agency_can_manage_child(_tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'only the parent agency (or platform) may mint a sub-account owner invite'
      USING ERRCODE = '42501';
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

COMMENT ON FUNCTION public.create_tenant_invite_token(uuid, text, tenant_role, integer, integer, uuid, text) IS
  '§60 (2026-08-11): consumer/portal invites are Solo + Sub-account ONLY — agency/enterprise '
  'target tenants are rejected (42501). Server half of the customer_portal_invite tier-lock; '
  'the UI hasFeature() helper mirrors it. Preserves the #227 subaccount_owner Layer-1 mint gate '
  'and the FIX-1 owner-role gate unchanged.';
