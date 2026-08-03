-- P1 — create_subaccount ownership-leak fix (#215 + #212 rule 1/2)
--
-- BUG: when an Agency/Enterprise owner creates a sub-account, create_subaccount baked the
-- AGENCY OWNER (_actor) into the child as BOTH tenants.owner_user_id AND a tenant_members
-- row with role='owner', and typed the child account_type='standalone'. That violates:
--   • #215  — the agency/enterprise owner administers the umbrella via admin-access and is
--             NEVER a member of a sub-account's team roster (admin-access != team-membership).
--   • #212 rule 1 — a sub-account MUST carry account_type='sub_account' (+ a parent).
--   • #212 rule 2 — a sub-account's owner_user_id MUST differ from its parent's owner_user_id.
--
-- THE FIX (preventive — the only existing sub-account, 'Antonio Daniel LLC', is reconciled
-- separately as a data cleanup; this changes the CREATION path so future sub-accounts are born
-- correct):
--   A. Widen tenants_account_type_chk to admit 'sub_account'.
--   B. create_subaccount: type the child 'sub_account', set owner_user_id=NULL (no principal
--      yet — the real owner/admin arrives by accepting a 'subaccount_owner' invite), and DROP
--      the tenant_members insert of the agency owner entirely.
--   C. provision_paige_managed_email_connector: admit 'sub_account' into the sender-owning
--      topology set, else the account_type flip would disable the child's managed email sender.
--   D. create_tenant_invite_token: widen the mint gate so a parent-agency owner can mint the
--      'subaccount_owner' invite for a freshly-created child WITHOUT first being inserted as a
--      child member (removing the roster row in (B) otherwise makes is_tenant_admin(child)=false
--      and breaks the 'Invite owner' onboarding path). agency_can_manage_child grants exactly
--      the parent-agency owner / scoped agency-team authority — a tight widening, no over-grant.
--
-- A freshly created sub-account is therefore: account_type='sub_account', owner_user_id=NULL,
-- ZERO members — an un-onboarded shell. It is reachable/administrable by the agency via the
-- parent-chain agency_* RPCs, and gains its principal (as a member) when they accept the invite.
--
-- DELIBERATELY DEFERRED (tracked follow-ups, NOT in this migration):
--   • P1b: upgrade accept_tenant_invite('subaccount_owner') to establish the PRINCIPAL as the
--     child owner (owner_user_id + role='owner') + the token-gated ownership-guard exception;
--     and the get_actor_access() tier resolver fix (it keys the 'subaccount' tier on
--     account_type='standalone' and must key on parent_tenant_id — latent until a sub-account
--     gains its first member, which is P1b's job).
--   • operator_dashboard_metrics 'sub_account' breakdown bucket (operator analytics only).
--   • The deeper #215 item: agency_enter_subaccount still inserts the agency owner as a child
--     'admin' member on Open (admin-access implemented AS roster membership) — the platform-wide
--     #215 audit / P4.
--
-- Every function below is CREATE OR REPLACE with an UNCHANGED signature (grants preserved,
-- §18 one home — no forks). Bodies are the LIVE prod definitions with only the targeted change.

-- ─────────────────────────────────────────────────────────────────────────────
-- Part A — widen the account_type CHECK to admit 'sub_account'.
-- MUST drop+re-add (NOT an IF-NOT-EXISTS guard): the constraint already exists, so a guarded
-- ADD would silently skip and leave the narrow check in force, 500-ing every create_subaccount.
-- Re-runnable: DROP IF EXISTS + ADD; all existing rows already satisfy the widened set.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_account_type_chk;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_account_type_chk
  CHECK (account_type = ANY (ARRAY['standalone'::text, 'agency'::text, 'enterprise'::text, 'sub_account'::text]));

-- ─────────────────────────────────────────────────────────────────────────────
-- Part B — create_subaccount (7-arg actor-explicit core). The 6-arg auth.uid() SQL wrapper
-- is unchanged and continues to forward into this core.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_subaccount(_name text, _industry text, _description text, _parent_tenant_id uuid, _actor uuid, _playbook_slug text DEFAULT NULL::text, _inherit_from_parent boolean DEFAULT true)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := _actor;
  _parent uuid := _parent_tenant_id;
  _parent_type text;
  _parent_brand jsonb;
  _parent_features jsonb;
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _child_count int;
  _child_brand jsonb := '{}'::jsonb;
  _child_features jsonb := '{}'::jsonb;
  _pb_config jsonb;
  _known_slugs text[] := ARRAY['general','coaching-default','fitness','consultant','agency','funding'];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'no parent tenant in context' USING ERRCODE = '22000';
  END IF;
  -- Auth gate: the ACTOR must own the parent. _actor/_uid is used ONLY for authorization here;
  -- it MUST NOT flow into the child's ownership or roster (#215 / #212 rule 2).
  IF NOT public.is_tenant_owner(_uid, _parent) THEN
    RAISE EXCEPTION 'only the tenant owner may create a sub-account' USING ERRCODE = '42501';
  END IF;

  SELECT account_type, brand, features
    INTO _parent_type, _parent_brand, _parent_features
    FROM public.tenants WHERE id = _parent;
  IF _parent_type NOT IN ('agency', 'enterprise') THEN
    RAISE EXCEPTION 'sub-accounts require an Agency or Enterprise account' USING ERRCODE = '42501';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'sub-account name required' USING ERRCODE = '22000';
  END IF;

  IF _playbook_slug IS NOT NULL AND NOT (_playbook_slug = ANY (_known_slugs)) THEN
    RAISE EXCEPTION 'unknown playbook preset: %', _playbook_slug USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO _child_count FROM public.tenants WHERE parent_tenant_id = _parent;
  IF _child_count >= 100 THEN
    RAISE EXCEPTION 'sub-account limit (100) reached for this workspace' USING ERRCODE = '54000';
  END IF;

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'subaccount'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  IF _inherit_from_parent AND _parent_brand IS NOT NULL THEN
    _child_brand := jsonb_strip_nulls(jsonb_build_object(
      'logo_url',      _parent_brand->'logo_url',
      'logo_dark_url', _parent_brand->'logo_dark_url',
      'favicon_url',   _parent_brand->'favicon_url',
      'primary_color', _parent_brand->'primary_color',
      'accent_color',  _parent_brand->'accent_color',
      'font',          _parent_brand->'font',
      'tagline',       _parent_brand->'tagline',
      'product_name',  _parent_brand->'product_name',
      'from_name',     _parent_brand->'from_name',
      'support_email', _parent_brand->'support_email'
    ));
  END IF;
  _child_brand := _child_brand || jsonb_strip_nulls(jsonb_build_object(
    'industry', _industry,
    'about',    _description
  ));

  IF _playbook_slug IS NOT NULL THEN
    _child_features := _child_features || jsonb_build_object('playbook', _playbook_slug);
  ELSIF _inherit_from_parent
        AND _parent_features IS NOT NULL
        AND (_parent_features ? 'playbook_config') THEN
    _pb_config := _parent_features->'playbook_config';
    IF COALESCE(_pb_config->>'slug', '') <> 'funding' THEN
      _child_features := _child_features || jsonb_build_object('playbook_config', _pb_config);
      IF _pb_config ? 'slug' THEN
        _child_features := _child_features || jsonb_build_object('playbook', _pb_config->>'slug');
      END IF;
    END IF;
  ELSIF _inherit_from_parent
        AND _parent_features IS NOT NULL
        AND (_parent_features ? 'playbook')
        AND COALESCE(_parent_features->>'playbook', '') NOT IN ('', 'funding') THEN
    _child_features := _child_features || jsonb_build_object('playbook', _parent_features->>'playbook');
  END IF;

  IF _inherit_from_parent
     AND _parent_features IS NOT NULL
     AND (_parent_features ? 'portal_config') THEN
    _child_features := _child_features || jsonb_build_object('portal_config', _parent_features->'portal_config');
  END IF;

  -- #215 / #212: the child is a true sub_account with NO owner yet (owner_user_id NULL) and NO
  -- members. The agency owner (_uid) is intentionally NOT written as owner or member — they
  -- administer the umbrella via the parent chain, they are not on the child's roster. The real
  -- principal becomes owner/admin by accepting a 'subaccount_owner' invite (P1b establishes the
  -- owner; today they land as admin). owner_user_id is nullable and excluded from
  -- tenants_one_toplevel_per_owner; INSERT triggers do not require a non-null owner.
  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand, features)
  VALUES (
    _slug, trim(_name), NULL, _parent, 'active', 'sub_account',
    _child_brand,
    _child_features
  )
  RETURNING * INTO _tenant;

  RETURN _tenant;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part C — provision_paige_managed_email_connector: admit 'sub_account' into the topology set
-- that owns its own managed sender (a sub-account is a real workspace that sends). Without this,
-- the account_type='sub_account' flip trips the disable branch and the child loses its sender.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_paige_managed_email_connector(p_tenant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant public.tenants%ROWTYPE;
  _shared_domain text;
  _local_part text;
  _address text;
  _reply_to text;
  _connector_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('paige-managed-email:' || p_tenant_id::text, 0));

  SELECT * INTO _tenant
    FROM public.tenants
   WHERE id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_TENANT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  -- account_type + parent_tenant_id classify the topology, not inheritance:
  -- agency roots, sub-accounts (child workspaces), and solo standalones each own their sender.
  IF _tenant.status NOT IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
     OR _tenant.account_type NOT IN ('agency', 'standalone', 'enterprise', 'sub_account')
     OR coalesce((_tenant.features ->> 'system_workspace')::boolean, false) THEN
    UPDATE public.channel_connectors
       SET active = false, status = 'disabled'
     WHERE tenant_id = p_tenant_id
       AND channel_type = 'email'
       AND provider = 'resend'
       AND config ->> 'managed_default' = 'true';
    RETURN NULL;
  END IF;

  SELECT coalesce(nullif(shared_domain, ''), 'mail.paigeagent.ai'),
         coalesce(nullif(default_reply_to, ''), 'support@paigeagent.ai')
    INTO _shared_domain, _reply_to
    FROM public.platform_email_settings
   LIMIT 1;

  _shared_domain := coalesce(_shared_domain, 'mail.paigeagent.ai');
  _reply_to := coalesce(_reply_to, 'support@paigeagent.ai');
  _local_part := public.sanitize_email_local_part(coalesce(nullif(_tenant.slug, ''), _tenant.name, 'client'));
  _address := _local_part || '@' || _shared_domain;

  IF EXISTS (
    SELECT 1
      FROM public.channel_connectors c
     WHERE c.channel_type = 'email'
       AND lower(c.inbound_address) = lower(_address)
       AND NOT (
         c.tenant_id = p_tenant_id
         AND c.provider = 'resend'
         AND c.config ->> 'managed_default' = 'true'
       )
  ) THEN
    RAISE EXCEPTION 'PAIGE_MANAGED_EMAIL_ADDRESS_CONFLICT: %', _address
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.channel_connectors (
    tenant_id, channel_type, provider, inbound_address, inbound_domain,
    display_name, from_name, from_address, reply_to, status, active, config
  ) VALUES (
    p_tenant_id, 'email', 'resend', _address, NULL,
    'Paige email', coalesce(nullif(_tenant.name, ''), 'Paige'), _address, _reply_to,
    'active', true,
    jsonb_build_object(
      'managed_default', true,
      'source', 'tenant_domain_spine',
      'web_hostname', _tenant.slug || '.paigeagent.ai'
    )
  )
  ON CONFLICT (tenant_id)
    WHERE channel_type = 'email'
      AND provider = 'resend'
      AND config ->> 'managed_default' = 'true'
  DO UPDATE SET
    inbound_address = EXCLUDED.inbound_address,
    inbound_domain = NULL,
    display_name = EXCLUDED.display_name,
    from_name = EXCLUDED.from_name,
    from_address = EXCLUDED.from_address,
    reply_to = EXCLUDED.reply_to,
    status = 'active',
    active = true,
    config = coalesce(public.channel_connectors.config, '{}'::jsonb)
      || EXCLUDED.config
  RETURNING id INTO _connector_id;

  RETURN _connector_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part D — create_tenant_invite_token: widen the mint auth gate so a parent-agency owner can
-- mint an invite for a child they manage WITHOUT holding a child membership row. This restores
-- the 'Invite owner' onboarding path that Part B otherwise breaks (no more agency-owner roster
-- row → is_tenant_admin(child)=false on a fresh child). agency_can_manage_child(_tenant_id,
-- auth.uid()) is true only for the parent agency/enterprise OWNER (or scoped agency-team roles) —
-- the same authority that could already Open→mint, minus the #215-violating membership side
-- effect. A WIDENING only: every caller authorized before is still authorized (§37, no producer
-- breaks). Body is the LIVE definition with the single gate line widened.
-- ─────────────────────────────────────────────────────────────────────────────
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
