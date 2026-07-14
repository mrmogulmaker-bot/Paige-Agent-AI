-- ─────────────────────────────────────────────────────────────────────────────
-- Sub-account onboarding — arrive READY, never blank (#agency-onboarding-gate)
--
-- A new sub-account spun up under an agency should open already wearing the
-- parent's white-label look and running a chosen (or inherited) Playbook — not a
-- bare shell the agency has to hand-configure. This migration extends BOTH
-- create_subaccount overloads (the 4-arg auth.uid() UI path and the 5-arg
-- actor-explicit MCP path) with two optional inputs:
--     _playbook_slug        text    -- pick a preset from the shared library
--     _inherit_from_parent  boolean -- copy the agency's white-label brand down
-- and materializes brand + Playbook on the child AT INSERT time, so the write
-- lands before the starter-business worker runs (its set_tenant_playbook call is
-- _only_if_unset=true, so anything seeded here wins cleanly — §12: layer, don't
-- rebuild).
--
-- Signature change ⇒ DROP + CREATE both overloads (Postgres keys functions by
-- arg types). The two overloads stay behaviorally identical: the 4-arg wrapper
-- forwards auth.uid(); the actor-explicit core holds the ONE copy of the insert
-- logic (§13, no fork). Every existing guard is preserved and ownership is proven
-- BEFORE any parent row is read — no new IDOR surface.
--
-- §2 HARD LINE — funding/credit is NEVER inherited or defaulted:
--   • enabled_skills is never carried to a child (funding-as-skill stays behind
--     the explicit agency_provision_catalog_item opt-in, one call per child).
--   • an inherited parent playbook_config whose slug is 'funding' is DROPPED, not
--     carried — funding arrives ONLY via an explicit _playbook_slug='funding'
--     choice (an opt-in the agency deliberately makes), never as a default.
-- ─────────────────────────────────────────────────────────────────────────────

-- Old signatures must go before the wider ones can take their place.
DROP FUNCTION IF EXISTS public.create_subaccount(text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_subaccount(text, text, text, uuid);

-- ── Actor-explicit core (service_role) — the ONE place the insert lives ───────
CREATE FUNCTION public.create_subaccount(
  _name text,
  _industry text,
  _description text,
  _parent_tenant_id uuid,
  _actor uuid,
  _playbook_slug text DEFAULT NULL,
  _inherit_from_parent boolean DEFAULT true
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  -- The shared preset library (src/lib/playbook/presets.ts → PLAYBOOK_LIBRARY).
  -- Kept in lockstep with resolve_starter_playbook_slug's output space.
  _known_slugs text[] := ARRAY['general','coaching-default','fitness','consultant','agency','funding'];
BEGIN
  -- ── Guards — ownership proven BEFORE any parent read (no IDOR surface) ──────
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'no parent tenant in context' USING ERRCODE = '22000';
  END IF;
  IF NOT public.is_tenant_owner(_uid, _parent) THEN
    RAISE EXCEPTION 'only the tenant owner may create a sub-account' USING ERRCODE = '42501';
  END IF;

  -- Ownership is proven; only now do we read the parent's own rows.
  SELECT account_type, brand, features
    INTO _parent_type, _parent_brand, _parent_features
    FROM public.tenants WHERE id = _parent;
  IF _parent_type NOT IN ('agency', 'enterprise') THEN
    RAISE EXCEPTION 'sub-accounts require an Agency or Enterprise account' USING ERRCODE = '42501';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'sub-account name required' USING ERRCODE = '22000';
  END IF;

  -- Validate an explicit preset choice against the known library (else the child
  -- could silently carry an unresolvable slug the resolver falls back on anyway).
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

  -- ── Brand: white-label subset from the parent, opt-in ──────────────────────
  -- ONLY the presentation identity — never owner PII, operator/God fields, the
  -- parent's id, or the parent's custom_domain (unique per tenant). The child's
  -- OWN name stays its own; the industry/about the agency typed win on top.
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

  -- ── Playbook: explicit choice > inherited parent playbook_config ───────────
  -- Writing features.playbook (and playbook_config when inherited) here makes
  -- the starter worker's _only_if_unset=true set_tenant_playbook a no-op, so the
  -- child boots with the intended Playbook.
  IF _playbook_slug IS NOT NULL THEN
    -- An explicit preset — including 'funding' as a deliberate opt-in (§2: chosen,
    -- not defaulted). The resolver reads features.playbook to hydrate the preset.
    _child_features := _child_features || jsonb_build_object('playbook', _playbook_slug);
  ELSIF _inherit_from_parent
        AND _parent_features IS NOT NULL
        AND (_parent_features ? 'playbook_config') THEN
    _pb_config := _parent_features->'playbook_config';
    -- §2: never carry a funding Playbook down as an inherited default. If the
    -- parent authored the funding preset, drop it — the child falls back to the
    -- coaching-generic 'general' via the starter worker.
    IF COALESCE(_pb_config->>'slug', '') <> 'funding' THEN
      _child_features := _child_features || jsonb_build_object('playbook_config', _pb_config);
      IF _pb_config ? 'slug' THEN
        _child_features := _child_features || jsonb_build_object('playbook', _pb_config->>'slug');
      END IF;
    END IF;
  END IF;

  -- ── Portal presentation overlay: carry down when inheriting (optional) ──────
  IF _inherit_from_parent
     AND _parent_features IS NOT NULL
     AND (_parent_features ? 'portal_config') THEN
    _child_features := _child_features || jsonb_build_object('portal_config', _parent_features->'portal_config');
  END IF;

  -- §2 HARD: enabled_skills (incl. 'funding') is intentionally NEVER copied above.
  -- A child starts with no resold skills; funding-as-skill arrives only through the
  -- explicit agency_provision_catalog_item opt-in, one call per child.

  -- Children default to 'standalone' — an agency cannot spawn a pre-escalated
  -- sub-agency; upgrading a child is a separate god-only act.
  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand, features)
  VALUES (
    _slug, trim(_name), _uid, _parent, 'active', 'standalone',
    _child_brand,
    _child_features
  )
  RETURNING * INTO _tenant;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', now());

  RETURN _tenant;
END;
$$;

-- ── 4-arg wrapper — preserves the exact authenticated-UI contract (auth.uid()) ─
-- Adds the same two optional inputs so the Agency Board can pass a preset + the
-- inherit toggle, while a bare 4-arg call still behaves as before.
CREATE FUNCTION public.create_subaccount(
  _name text,
  _industry text DEFAULT NULL,
  _description text DEFAULT NULL,
  _parent_tenant_id uuid DEFAULT NULL,
  _playbook_slug text DEFAULT NULL,
  _inherit_from_parent boolean DEFAULT true
) RETURNS public.tenants
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.create_subaccount(
    _name, _industry, _description,
    COALESCE(_parent_tenant_id, public.current_user_tenant_id()),
    auth.uid(),
    _playbook_slug,
    _inherit_from_parent
  );
$$;

-- ── Least privilege — mirror the prior grants exactly ─────────────────────────
-- Actor-explicit core: service_role ONLY (a browser must never forge _actor).
REVOKE ALL ON FUNCTION public.create_subaccount(text, text, text, uuid, uuid, text, boolean) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_subaccount(text, text, text, uuid, uuid, text, boolean) TO service_role;

-- auth.uid() wrapper: authenticated (UI) + service_role (parity with the tool tier).
REVOKE ALL ON FUNCTION public.create_subaccount(text, text, text, uuid, text, boolean) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.create_subaccount(text, text, text, uuid, text, boolean) TO authenticated, service_role;
