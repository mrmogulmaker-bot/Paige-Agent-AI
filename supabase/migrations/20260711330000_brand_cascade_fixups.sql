-- Brand Kit fix-ups (#143) — post-ship review (S1, S2).
--
-- S1: the from_name split-brain fix was dead code. tenant_email_identities.from_name
-- is NOT NULL and always provisioned to the tenant's OWN name, so the brand-cascade
-- term that sat AFTER NULLIF(v_ident.from_name,'') in resolve_tenant_sender was
-- unreachable — a sub-account still sent under its own name while the portal showed
-- the inherited agency name. resolve_tenant_sender is the authoritative send-time
-- resolver, so the fix is to let the cascaded brand from_name win: it already
-- collapses own → agency → the tenant's own name, so it's the correct display name
-- in every case (brand.from_name stays the canonical place to set a sender name).
--
-- S2: get_client_portal_brand / peek_tenant_portal_brand were DROP+CREATEd without
-- re-issuing grants, so they inherited PUBLIC EXECUTE — an unintended widening
-- (harmless: bodies are auth.uid()/slug-scoped, anon gets zero rows). Restore the
-- explicit grants they had before (portal peek is intentionally anon-readable for
-- the logged-out gateway; the client-portal reader is authenticated-only).

CREATE OR REPLACE FUNCTION public.resolve_tenant_sender(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_tenant   public.tenants%ROWTYPE;
  v_cfg      public.platform_email_settings%ROWTYPE;
  v_ident    public.tenant_email_identities%ROWTYPE;
  v_domain   public.tenant_email_domains%ROWTYPE;
  v_brand    record;
  v_shared   text;
  v_from_name text;
  v_from_addr text;
  v_reply    text;
  v_brand_reply text;
  v_source   text;
  v_kind     text;
BEGIN
  SELECT * INTO v_cfg FROM public.platform_email_settings LIMIT 1;
  v_shared := COALESCE(NULLIF(v_cfg.shared_domain, ''), 'paigeagent.ai');

  IF _tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'tenant_id', NULL,
      'from_name', COALESCE(NULLIF(v_cfg.default_from_name, ''), 'Paige Agent AI'),
      'from_address', 'team@' || v_shared,
      'reply_to', COALESCE(NULLIF(v_cfg.default_reply_to, ''), 'support@' || v_shared),
      'domain', v_shared, 'kind', 'platform', 'source', 'platform_default'
    );
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = _tenant_id;
  SELECT * INTO v_ident FROM public.tenant_email_identities
    WHERE tenant_id = _tenant_id AND status = 'active';
  -- Cascaded brand display name + reply-to (already own → agency → own-name floor).
  SELECT from_name, support_email INTO v_brand FROM public.resolve_tenant_brand(_tenant_id);

  SELECT * INTO v_domain FROM public.tenant_email_domains
    WHERE tenant_id = _tenant_id AND status = 'verified'
    ORDER BY is_default DESC, verified_at DESC NULLS LAST
    LIMIT 1;

  IF FOUND THEN
    v_from_addr := COALESCE(NULLIF(v_domain.from_email_local, ''), 'no-reply') || '@' || v_domain.domain;
    -- A custom-domain from_name (explicit) wins; else the cascaded brand name.
    v_from_name := COALESCE(NULLIF(v_domain.from_name, ''), v_brand.from_name, v_tenant.name, 'Paige Agent AI');
    v_source := 'custom_domain';
    v_kind := 'custom_domain';
  ELSIF v_ident.tenant_id IS NOT NULL THEN
    v_from_addr := v_ident.local_part || '@' || v_shared;
    -- Cascaded brand name wins over the auto-provisioned identity name (closes S1).
    v_from_name := COALESCE(v_brand.from_name, NULLIF(v_ident.from_name, ''), v_tenant.name, 'Paige Agent AI');
    v_source := 'shared';
    v_kind := 'shared';
  ELSE
    v_from_addr := 'team@' || v_shared;
    v_from_name := COALESCE(v_brand.from_name, v_tenant.name, NULLIF(v_cfg.default_from_name, ''), 'Paige Agent AI');
    v_source := 'platform_default';
    v_kind := 'platform';
  END IF;

  v_brand_reply := NULLIF(v_brand.support_email, '');
  IF v_brand_reply IS NOT NULL AND v_brand_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    v_brand_reply := NULL;
  END IF;
  v_reply := COALESCE(
    NULLIF(v_ident.reply_to, ''),
    v_brand_reply,
    NULLIF(v_cfg.default_reply_to, ''),
    'support@' || v_shared
  );

  RETURN jsonb_build_object(
    'tenant_id',    _tenant_id,
    'tenant_slug',  v_tenant.slug,
    'tenant_name',  v_tenant.name,
    'from_name',    v_from_name,
    'from_address', v_from_addr,
    'reply_to',     v_reply,
    'domain',       split_part(v_from_addr, '@', 2),
    'kind',         v_kind,
    'source',       v_source
  );
END; $function$;

-- S2: restore explicit grants on the two rebuilt portal readers.
REVOKE EXECUTE ON FUNCTION public.get_client_portal_brand() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_client_portal_brand() TO authenticated;

GRANT EXECUTE ON FUNCTION public.peek_tenant_portal_brand(text) TO anon, authenticated;
