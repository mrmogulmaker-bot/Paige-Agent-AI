-- =============================================================================
-- §45 De-Brand SLICE 1 — the operator-identity resolution SEAM (foundation only).
-- =============================================================================
-- This slice builds ONLY the substrate every consumer will call. The 22 leak-site
-- migrations (F1/F2/F3/F5/N1..N13) are LATER slices — nothing tenant-facing is
-- rewired here. This migration EXTENDS the already-live brand/identity substrate
-- (§18: one home per capability — no new "brand table"):
--
--   * resolve_tenant_brand(_tenant_id)   — the cascade brand-CHROME resolver (widened
--                                          here with a cascaded booking_url key).
--   * resolve_tenant_sender(_tenant_id)  — the sender-identity resolver (unchanged).
--   * tenant_legal_profile               — the tenant's own legal/signing identity.
--
-- and composes them into ONE present-only object: resolve_operator_identity().
--
-- REAL-ASSET NOTE (§18/§31): tenant_legal_profile ALREADY carries signatory_name /
-- signatory_title. The design asked for "signer_name / signer_title" columns; adding
-- them would be a §12 duplicate home for the exact same concept (the tenant's
-- authorized human representative). So we REUSE signatory_name / signatory_title and
-- expose them under the design's JSON keys (signer_name / signer_title). No new
-- person-name column is created.
--
-- PRESENT-ONLY CONTRACT (§13/§15): every field a tenant has not set is ABSENT from
-- the JSON — never a placeholder, never the operator's own value. product_name /
-- from_name floor to the tenant's OWN name (inside resolve_tenant_brand /
-- resolve_tenant_sender), never to an operator string.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. resolve_tenant_brand — widen with a cascaded booking_url brand key (S3 §37).
--    Adding a column to a RETURNS TABLE changes the return type, so CREATE OR
--    REPLACE is illegal here; we DROP then CREATE. The five consumers
--    (get_paige_persona_context, provision_tenant_email_identity,
--    resolve_tenant_sender, get_client_portal_brand, peek_tenant_portal_brand)
--    all read via to_jsonb(rb) / `SELECT <named cols> INTO` / `rb.<col>` — none
--    positional — so an appended column is tolerated. (String-body SQL/plpgsql
--    functions do not create hard pg_depend edges on called functions, so this
--    DROP does not cascade to them.)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_tenant_brand(uuid);
CREATE FUNCTION public.resolve_tenant_brand(_tenant_id uuid)
RETURNS TABLE (
  tenant_id uuid, tenant_name text, tenant_slug text,
  logo_url text, logo_dark_url text, favicon_url text,
  primary_color text, accent_color text, font text, tagline text,
  product_name text, from_name text, support_email text, custom_domain text,
  booking_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE chain AS (
    SELECT t.id, t.parent_tenant_id, t.name, t.slug, t.brand, 0 AS depth
      FROM public.tenants t WHERE t.id = _tenant_id
    UNION ALL
    SELECT p.id, p.parent_tenant_id, p.name, p.slug, p.brand, c.depth+1
      FROM public.tenants p JOIN chain c ON p.id = c.parent_tenant_id
     WHERE c.depth < 10
  ),
  pick AS (
    SELECT
      (SELECT NULLIF(brand->>'logo_url','')      FROM chain WHERE NULLIF(brand->>'logo_url','')      IS NOT NULL ORDER BY depth LIMIT 1) AS logo_url,
      (SELECT NULLIF(brand->>'logo_dark_url','') FROM chain WHERE NULLIF(brand->>'logo_dark_url','') IS NOT NULL ORDER BY depth LIMIT 1) AS logo_dark_url,
      (SELECT NULLIF(brand->>'favicon_url','')   FROM chain WHERE NULLIF(brand->>'favicon_url','')   IS NOT NULL ORDER BY depth LIMIT 1) AS favicon_url,
      (SELECT NULLIF(brand->>'primary_color','') FROM chain WHERE NULLIF(brand->>'primary_color','') IS NOT NULL ORDER BY depth LIMIT 1) AS primary_color,
      (SELECT NULLIF(brand->>'accent_color','')  FROM chain WHERE NULLIF(brand->>'accent_color','')  IS NOT NULL ORDER BY depth LIMIT 1) AS accent_color,
      (SELECT NULLIF(brand->>'font','')          FROM chain WHERE NULLIF(brand->>'font','')          IS NOT NULL ORDER BY depth LIMIT 1) AS font,
      (SELECT NULLIF(brand->>'tagline','')       FROM chain WHERE NULLIF(brand->>'tagline','')       IS NOT NULL ORDER BY depth LIMIT 1) AS tagline,
      (SELECT NULLIF(brand->>'product_name','')  FROM chain WHERE NULLIF(brand->>'product_name','')  IS NOT NULL ORDER BY depth LIMIT 1) AS product_name,
      (SELECT COALESCE(NULLIF(brand->>'from_name',''), NULLIF(brand->>'sender_name',''), NULLIF(brand->>'name',''))
         FROM chain
        WHERE COALESCE(NULLIF(brand->>'from_name',''), NULLIF(brand->>'sender_name',''), NULLIF(brand->>'name','')) IS NOT NULL
        ORDER BY depth LIMIT 1) AS from_name,
      (SELECT NULLIF(brand->>'support_email','') FROM chain WHERE NULLIF(brand->>'support_email','') IS NOT NULL ORDER BY depth LIMIT 1) AS support_email,
      (SELECT NULLIF(brand->>'custom_domain','') FROM chain WHERE NULLIF(brand->>'custom_domain','') IS NOT NULL ORDER BY depth LIMIT 1) AS custom_domain,
      -- NEW: cascaded booking/CTA URL — same self→agency walk as its sibling keys.
      -- Present-only: no key anywhere in the chain → NULL (no platform floor).
      (SELECT NULLIF(brand->>'booking_url','')   FROM chain WHERE NULLIF(brand->>'booking_url','')   IS NOT NULL ORDER BY depth LIMIT 1) AS booking_url
  ),
  self AS (SELECT id, name, slug FROM chain WHERE depth = 0)
  SELECT
    self.id, self.name, self.slug,
    pick.logo_url,
    pick.logo_dark_url, pick.favicon_url,
    COALESCE(pick.primary_color, '#150C31')  AS primary_color,
    COALESCE(pick.accent_color,  '#EBB94C')  AS accent_color,
    pick.font, pick.tagline,
    COALESCE(pick.product_name, self.name)   AS product_name,
    COALESCE(pick.from_name,    self.name)   AS from_name,
    pick.support_email, pick.custom_domain,
    pick.booking_url
  FROM self, pick;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_tenant_brand(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_tenant_brand(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. resolve_operator_identity — the SEAM. One present-only composition object.
-- -----------------------------------------------------------------------------
-- B3 (§51) — CASCADE vs OWN-ROW, the critical distinction:
--   * Brand CHROME (product_name, from_name, support_email, logo_url, booking_url,
--     the sender object) uses the CASCADE resolvers — a sub-account with no brand of
--     its own correctly inherits its agency's white-label chrome.
--   * LEGAL identity (legal_entity_name, signer_name, signer_title) is read from the
--     tenant's OWN tenant_legal_profile row ONLY — NEVER walked up to an agency
--     parent. A sub-account must sign ITS OWN letters/invitations with ITS OWN legal
--     entity, not the agency's. Inheriting a parent's legal_business_name onto a
--     sub-account's outreach would be a real mis-scope. This is deliberate.
--
-- B2 (§9) — sensitive-field gate (v_can_see_legal), guards THREE cross-tenant blocks:
--   (1) legal_entity_name / signer_name / signer_title — legal + real-person PII;
--   (2) the sender ADDRESS fields (from_address/reply_to/domain/kind/source) — another
--       tenant's sending identity, sourced from the service_role-ONLY resolve_tenant_sender
--       whose REVOKE this SECURITY DEFINER would otherwise bypass;
--   (3) tradeline_partners — the tenant's OWN marketing-CTA config.
--   On the JWT path (auth.uid() IS NOT NULL) all three are returned ONLY to a caller
--   authorized for _tenant_id (can_manage_tenant_brand OR current_user_tenant_id() =
--   _tenant_id) — so tenant A cannot read tenant B's signer, sending addresses, or
--   partner CTAs by passing B's uuid. The service_role path (auth.uid() IS NULL —
--   Paige's edge functions, which have ALREADY resolved the tenant server-side) always
--   sees them. PUBLIC (ungated) brand chrome — product_name / from_name / support_email /
--   logo_url / booking_url and the sender's from_name/tenant_id/tenant_slug/tenant_name —
--   mirrors resolve_tenant_brand's open posture.
CREATE OR REPLACE FUNCTION public.resolve_operator_identity(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand         record;
  v_sender        jsonb;
  v_legal         public.tenant_legal_profile%ROWTYPE;
  v_partners      jsonb;
  v_out           jsonb := '{}'::jsonb;
  v_can_see_legal boolean;
BEGIN
  -- Present-only empty on no tenant / unknown tenant — NEVER throws (a resolver
  -- hiccup must not break a generation; the edge wrapper degrades neutrally).
  IF _tenant_id IS NULL THEN
    RETURN v_out;
  END IF;

  SELECT * INTO v_brand FROM public.resolve_tenant_brand(_tenant_id);
  IF NOT FOUND THEN
    RETURN v_out;  -- unknown tenant id
  END IF;

  v_sender := public.resolve_tenant_sender(_tenant_id);

  -- B2 (§9) — the sensitive-field gate, computed ONCE up front (it now guards THREE
  -- blocks: the sender ADDRESS fields, tradeline_partners, and the legal identity).
  -- On the JWT path a caller sees the gated fields ONLY for a tenant it is authorized
  -- for; the service_role path (auth.uid() IS NULL — Paige's edge functions, tenant
  -- already resolved server-side) always sees them.
  v_can_see_legal := (auth.uid() IS NULL)                       -- service_role (edge, tenant pre-resolved)
    OR public.can_manage_tenant_brand(_tenant_id)               -- owner/admin of tenant or its agency chain
    OR (public.current_user_tenant_id() = _tenant_id);          -- the caller's own active tenant

  -- --- PUBLIC brand chrome (present-only; floors to the tenant's OWN name) ------
  v_out := jsonb_build_object('tenant_id', _tenant_id);

  IF NULLIF(v_brand.product_name, '') IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('product_name', v_brand.product_name);
  END IF;

  -- from_name prefers the sender resolver (email-identity aware); both floor to the
  -- tenant name, never an operator string.
  IF v_sender ? 'from_name' AND NULLIF(v_sender->>'from_name', '') IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('from_name', v_sender->>'from_name');
  ELSIF NULLIF(v_brand.from_name, '') IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('from_name', v_brand.from_name);
  END IF;

  IF NULLIF(v_brand.support_email, '') IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('support_email', v_brand.support_email);
  END IF;
  IF NULLIF(v_brand.logo_url, '') IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('logo_url', v_brand.logo_url);
  END IF;
  IF NULLIF(v_brand.booking_url, '') IS NOT NULL THEN
    v_out := v_out || jsonb_build_object('booking_url', v_brand.booking_url);
  END IF;

  -- The sender object — SPLIT by sensitivity (§9 IDOR fix). resolve_tenant_sender is
  -- deliberately service_role-ONLY (REVOKE ALL FROM authenticated); this SECURITY
  -- DEFINER bypasses that REVOKE, so the ADDRESS-bearing fields (from_address /
  -- reply_to / domain / kind / source) are another tenant's sending identity and must
  -- NOT leak to a JWT tenant-A caller who passes tenant-B's uuid. from_name is PUBLIC
  -- (it floors to the tenant name, already exposed via resolve_tenant_brand), as are
  -- tenant_id / tenant_slug / tenant_name (public brand chrome). Present-only: when
  -- withheld the address keys are simply ABSENT (consumers tolerate omitted keys).
  IF v_can_see_legal THEN
    v_out := v_out || jsonb_build_object('sender', v_sender);
  ELSE
    v_out := v_out || jsonb_build_object(
      'sender', v_sender - 'from_address' - 'reply_to' - 'domain' - 'kind' - 'source');
  END IF;

  -- --- tradeline_partners: tenant config-as-data, OWN row, GATED, present-only ---
  -- S4 (§2): NEVER a platform default. There is NO seed in this migration; every
  -- tenant starts empty and only sees partners it authored itself. No cascade — an
  -- affiliate offer is the tenant's own, never inherited from an agency parent.
  -- §9 IDOR fix: these are the tenant's OWN cross-tenant config (marketing CTAs);
  -- gated behind the SAME v_can_see_legal check as the sender addresses / legal
  -- fields so a JWT tenant-A caller cannot read tenant-B's partner CTAs by passing
  -- B's uuid. No consumer needs them cross-tenant — both callers
  -- (useOperatorIdentity JWT hook + _shared/operator-identity service-role edge)
  -- fetch only their OWN tenant, which the gate allows. Present-only when withheld.
  IF v_can_see_legal THEN
    SELECT NULLIF(t.features -> 'tradeline_partners', 'null'::jsonb)
      INTO v_partners
      FROM public.tenants t WHERE t.id = _tenant_id;
    IF v_partners IS NOT NULL
       AND jsonb_typeof(v_partners) = 'array'
       AND jsonb_array_length(v_partners) > 0 THEN
      v_out := v_out || jsonb_build_object('tradeline_partners', v_partners);
    END IF;
  END IF;

  -- --- LEGAL identity: OWN row only (B3), gated (B2 — v_can_see_legal computed
  --     once above), present-only ---------------------------------------------
  IF v_can_see_legal THEN
    -- OWN row ONLY — no chain walk. A sub-account signs its own letters.
    SELECT * INTO v_legal FROM public.tenant_legal_profile WHERE tenant_id = _tenant_id;
    IF FOUND THEN
      IF NULLIF(v_legal.legal_business_name, '') IS NOT NULL THEN
        v_out := v_out || jsonb_build_object('legal_entity_name', v_legal.legal_business_name);
      END IF;
      -- design JSON keys signer_name/signer_title sourced from the EXISTING
      -- signatory_name/signatory_title columns (§18/§31 real-asset reuse).
      IF NULLIF(v_legal.signatory_name, '') IS NOT NULL THEN
        v_out := v_out || jsonb_build_object('signer_name', v_legal.signatory_name);
      END IF;
      IF NULLIF(v_legal.signatory_title, '') IS NOT NULL THEN
        v_out := v_out || jsonb_build_object('signer_title', v_legal.signatory_title);
      END IF;
    END IF;
  END IF;

  RETURN v_out;
END $$;
REVOKE EXECUTE ON FUNCTION public.resolve_operator_identity(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_operator_identity(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Callable setters (S1 §10) — so Paige can author identity by voice/text.
--    Each is a clean programmatic seam; the UI is one caller, Paige is another.
-- -----------------------------------------------------------------------------

-- 3a. Legal signer (writes the EXISTING signatory_* columns). Tenant-admin gate,
--     mirroring set_tenant_service_agreement (the sibling writer on this same table).
CREATE OR REPLACE FUNCTION public.set_tenant_legal_signer(
  _tenant_id uuid, _name text, _title text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to edit this tenant''s legal signer' USING ERRCODE = '42501';
  END IF;
  -- legal_business_name is NOT NULL; seed from tenant name on first write.
  INSERT INTO public.tenant_legal_profile (tenant_id, legal_business_name, signatory_name, signatory_title)
  VALUES (
    _tenant_id,
    COALESCE((SELECT name FROM public.tenants WHERE id = _tenant_id), 'Business'),
    NULLIF(trim(_name), ''),
    NULLIF(trim(_title), '')
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET signatory_name  = NULLIF(trim(_name), ''),
        signatory_title = NULLIF(trim(_title), ''),
        updated_at      = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_legal_signer(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_tenant_legal_signer(uuid, text, text) TO authenticated;

-- 3b. Booking/CTA URL — a brand jsonb key. can_manage_tenant_brand gate (mirrors
--     set_tenant_brand). NULL/'' clears it. Thin, explicit Paige-callable seam.
CREATE OR REPLACE FUNCTION public.set_tenant_booking_url(
  _tenant_id uuid, _url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _merged jsonb;
BEGIN
  IF NOT public.can_manage_tenant_brand(_tenant_id) THEN
    RAISE EXCEPTION 'not authorized to manage brand for %', _tenant_id USING ERRCODE = '42501';
  END IF;
  UPDATE public.tenants
     SET brand = COALESCE(brand, '{}'::jsonb) || jsonb_build_object('booking_url', NULLIF(trim(_url), ''))
   WHERE id = _tenant_id
  RETURNING brand INTO _merged;
  IF _merged IS NULL THEN
    RAISE EXCEPTION 'tenant % not found', _tenant_id USING ERRCODE = 'P0002';
  END IF;
  RETURN _merged;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_booking_url(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_tenant_booking_url(uuid, text) TO authenticated;

-- 3c. Tradeline partners — tenant config-as-data on features. can_manage_tenant_brand
--     gate. Validates a JSON array; each element should be {tradeline_type,label,url}.
--     S4: this is the ONLY write path — there is no platform default seed anywhere.
CREATE OR REPLACE FUNCTION public.set_tenant_tradeline_partners(
  _tenant_id uuid, _partners jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _merged jsonb;
BEGIN
  IF NOT public.can_manage_tenant_brand(_tenant_id) THEN
    RAISE EXCEPTION 'not authorized to manage config for %', _tenant_id USING ERRCODE = '42501';
  END IF;
  IF _partners IS NOT NULL AND jsonb_typeof(_partners) <> 'array' THEN
    RAISE EXCEPTION 'tradeline_partners must be a JSON array' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tenants
     SET features = COALESCE(features, '{}'::jsonb)
                    || jsonb_build_object('tradeline_partners', COALESCE(_partners, '[]'::jsonb))
   WHERE id = _tenant_id
  RETURNING features INTO _merged;
  IF _merged IS NULL THEN
    RAISE EXCEPTION 'tenant % not found', _tenant_id USING ERRCODE = 'P0002';
  END IF;
  RETURN _merged;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_tradeline_partners(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_tenant_tradeline_partners(uuid, jsonb) TO authenticated;

-- =============================================================================
-- S4 ASSERTION (§2): this migration seeds ZERO tradeline_partners for ANY tenant.
-- The owner's own affiliate codes (00498 / 3ANTONIO94) are NOT written here; they
-- belong on the owner's OWN tenant row as tenant-authored config, added later via
-- set_tenant_tradeline_partners. A generic coaching/consulting tenant sees no
-- partner CTAs at all until it authors its own. (No INSERT/UPDATE of features
-- ->'tradeline_partners' exists above — grep this file to confirm.)
-- =============================================================================
