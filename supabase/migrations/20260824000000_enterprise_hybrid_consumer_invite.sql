-- §60 Enterprise HYBRID baseline — enterprise GAINS customer_portal_invite (owner-ruled 2026-08-11).
--
-- WHAT: narrow create_tenant_invite_token's CONSUMER guard from `IN ('agency','enterprise')`
-- to `= 'agency'`. This is the SERVER companion to the UI helper change in
-- `src/lib/tier/tierFeatures.ts` (ENTERPRISE_FEATURES now = union of SOLO ∪ AGENCY), which
-- makes enterprise the ONE HYBRID tier: it inherits BOTH the Solo/Sub-account "doing"
-- surface (CRM + creation + customer_portal_invite) AND the Agency "managing" surface
-- (subaccount_management).
--
-- WHY: the prior guard (migration 20260823000000) blocked consumer/portal invites for BOTH
-- agency AND enterprise. The owner's HYBRID ruling makes that inconsistent for enterprise —
-- an enterprise tenant is creation-capable AND runs a direct client book, so it must be able
-- to invite the very clients its campaigns are for. This closes flag 1 from PR #458. Shipping
-- the UI helper without this server change would recreate the exact split-brain §37 forbids
-- (UI grants the affordance, server 403s it) — so both layers move together, in one PR.
--
-- WHAT DOES NOT CHANGE: a pure AGENCY tenant is STILL rejected (it manages sub-accounts, not a
-- direct consumer client book — the §60 lock holds for agency). Every other kind (team /
-- subaccount_owner / agency_team) is untouched. Same signature, SECURITY DEFINER,
-- `SET search_path TO 'public'`, and GRANTs (CREATE OR REPLACE preserves the existing EXECUTE
-- grant to `authenticated`). The #227 subaccount_owner Layer-1 mint gate and the FIX-1
-- owner-role gate are reproduced byte-for-byte and unchanged.
--
-- FAITHFUL SUPERSET: this is the LIVE definition from 20260823000000, reproduced with exactly
-- ONE change — the account_type list in the §60 consumer guard (line ~63 there):
--   `... IN ('agency','enterprise')`  →  `... = 'agency'`.
--
-- §37 PRODUCER INVENTORY — the consumer-invite minters are unchanged and all target the
-- caller's OWN tenant (client-file "Invite to portal", PortalStudio, WorkspaceSettingsPanel,
-- ClientsHub portal landing, the paige-driven contact→portal action seam). Widening the guard
-- to ALLOW enterprise breaks NO producer — it only stops rejecting a legitimate enterprise
-- self-mint that the UI now (correctly) exposes via hasFeature('customer_portal_invite').
-- No consumer here is a NEW producer; this is a pure loosening for one tier, so there is no
-- §37 break-risk (loosening a guard cannot 4xx a caller that previously passed).
--
-- §51 tier-safe: keys on the TARGET tenant's account_type (resolved from public.tenants), not
-- the caller's role — holds for God, agency, standalone, sub-account, and enterprise callers.

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

  -- §60 (owner-ruled 2026-08-11, Enterprise HYBRID): customer portal / consumer invites are
  -- Solo + Sub-account + ENTERPRISE. Only a pure AGENCY is rejected — it manages sub-accounts,
  -- not a direct consumer client book. Enterprise is the hybrid tier (Solo ∪ Agency), so it
  -- runs its own client book AND can mint portal invites. Server-enforced; the UI helper
  -- hasFeature('customer_portal_invite') mirrors this (enterprise now included). Applies to
  -- ALL callers incl. platform owner. Other kinds are unaffected.
  IF _kind = 'consumer'
     AND (SELECT account_type FROM public.tenants WHERE id = _tenant_id) = 'agency' THEN
    RAISE EXCEPTION 'consumer/portal invites are not available for an agency account (an agency manages sub-accounts, not a direct client book)'
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
  '§60 (2026-08-11, Enterprise HYBRID): consumer/portal invites are Solo + Sub-account + Enterprise — '
  'only a pure AGENCY target tenant is rejected (42501). Server half of the customer_portal_invite '
  'tier-lock; the UI hasFeature() helper mirrors it (enterprise included). Preserves the #227 '
  'subaccount_owner Layer-1 mint gate and the FIX-1 owner-role gate unchanged.';
