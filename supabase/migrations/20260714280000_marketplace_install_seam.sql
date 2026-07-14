-- ============================================================================
-- Marketplace Install Seam — the REAL install/uninstall (Phase 1, part 2)
--
-- Before this, "install" was set_tenant_skill() flipping a jsonb boolean — it
-- seeded NO KB and wired NO functions. This adds the honest install seam:
--
--   install_marketplace_item(_tenant, _item_slug, _seeded_kb_doc_ids, _agent)
--     → applies the version's install_manifest for the CONFIG-ONLY parts that
--       Postgres can do atomically: flips each skill_flag (reusing the existing
--       set_tenant_skill — §12 extend, don't rebuild), records the EXACT
--       provenance of what it wrote (seeded_refs) so uninstall is precise, writes
--       one idempotent receipt row, and appends the append-only §17 ledger.
--
--   uninstall_marketplace_item(_tenant, _item_slug)
--     → reverses using seeded_refs: un-flips skills and deletes the exact KB docs
--       this install seeded (chunks cascade). Fully SQL — no embedding needed.
--
--   marketplace_catalog_for_tenant(_tenant)  [§10 Paige read seam]
--     → the catalog visible to a tenant + whether each item is installed.
--
-- WHY KB seeding is NOT in this RPC: a tenant_knowledge_docs row is only
-- retrievable once its chunks are embedded via Voyage, and Postgres cannot call
-- Voyage. So kb_pack items route through the marketplace-install EDGE function,
-- which embeds + inserts the docs (reusing the proven kb-ingest path) and then
-- calls install_marketplace_item with the resulting doc IDs. A pure skill item
-- (e.g. funding) needs no embedding and installs via this RPC alone — so Paige
-- can install it straight from chat (§10). §13: the receipt reports exactly what
-- was written, never a hoped-for outcome.
--
-- Gate on EVERY entry point: is_platform_owner() OR is_tenant_admin(_tenant) —
-- the caller-supplied _tenant_id is authorized, never trusted (no IDOR, §9/§13).
-- ============================================================================

BEGIN;

-- ── install ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.install_marketplace_item(
  _tenant_id uuid,
  _item_slug text,
  _seeded_kb_doc_ids uuid[] DEFAULT '{}'::uuid[],
  _installed_by_agent text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item        public.marketplace_items%ROWTYPE;
  _ver         public.marketplace_item_versions%ROWTYPE;
  _is_owner    boolean := public.is_platform_owner();
  _fn          jsonb;
  _kind        text;
  _skill_slugs text[] := '{}';
  _skipped     jsonb := '[]'::jsonb;
  _seeded_refs jsonb;
  _install     public.marketplace_installs%ROWTYPE;
  _existing    public.marketplace_installs%ROWTYPE;
  _was_active  boolean := false;
  _gross       integer := 0;
  _fee         integer := 0;
  _net         integer := 0;
BEGIN
  -- Authorize the caller against the target tenant — never trust the arg (§9/§13).
  IF NOT (_is_owner OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to install for this tenant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  -- Non-owners may only install items that are LISTED and visible to them
  -- (the same declared visibility the RLS read policy enforces).
  IF NOT _is_owner THEN
    IF _item.status <> 'listed' THEN
      RAISE EXCEPTION 'marketplace item % is not available', _item_slug USING ERRCODE = '42501';
    END IF;
    IF NOT (
      _item.scope = 'public'
      OR (_item.scope = 'tenant' AND _item.visible_to_tenant_id = _tenant_id)
      OR (_item.scope = 'agency' AND public.agency_team_role(_item.visible_to_agency_id, auth.uid()) IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'marketplace item % is not visible to this tenant', _item_slug USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _item.current_version_id IS NULL THEN
    RAISE EXCEPTION 'marketplace item % has no published version', _item_slug USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO _ver FROM public.marketplace_item_versions WHERE id = _item.current_version_id;

  -- Idempotency: an already-active install is a no-op that returns its receipt —
  -- no double skill-flip, no duplicate ledger line.
  SELECT * INTO _existing FROM public.marketplace_installs
   WHERE tenant_id = _tenant_id AND item_id = _item.id;
  IF FOUND AND _existing.status = 'active' THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_installed', true,
      'item_slug', _item.slug, 'item_type', _item.item_type, 'version', _ver.semver,
      'seeded_refs', _existing.seeded_refs
    );
  END IF;
  _was_active := FOUND AND _existing.status = 'active';

  -- Apply the config-only functions in the manifest.
  FOR _fn IN SELECT * FROM jsonb_array_elements(COALESCE(_ver.install_manifest->'functions','[]'::jsonb))
  LOOP
    _kind := _fn->>'kind';
    IF _kind = 'skill_flag' AND (_fn->>'slug') IS NOT NULL THEN
      PERFORM public.set_tenant_skill(_tenant_id, _fn->>'slug', true);
      _skill_slugs := array_append(_skill_slugs, _fn->>'slug');
    ELSE
      -- Not silently ignored — surfaced in the receipt so the caller sees it (§13).
      _skipped := _skipped || jsonb_build_array(_fn);
    END IF;
  END LOOP;

  -- Exact provenance of everything this install wrote → precise uninstall.
  _seeded_refs := jsonb_build_object(
    'skill_slugs', to_jsonb(_skill_slugs),
    'kb_doc_ids', to_jsonb(COALESCE(_seeded_kb_doc_ids, '{}'::uuid[])),
    'portal_surface_slugs', '[]'::jsonb,
    'features_keys', '[]'::jsonb
  );

  INSERT INTO public.marketplace_installs
    (tenant_id, item_id, version_id, status, seeded_refs, installed_by, installed_by_agent, installed_at, uninstalled_at)
  VALUES
    (_tenant_id, _item.id, _ver.id, 'active', _seeded_refs, auth.uid(), _installed_by_agent, now(), NULL)
  ON CONFLICT (tenant_id, item_id) DO UPDATE
    SET version_id = EXCLUDED.version_id,
        status = 'active',
        seeded_refs = EXCLUDED.seeded_refs,
        installed_by = EXCLUDED.installed_by,
        installed_by_agent = EXCLUDED.installed_by_agent,
        installed_at = now(),
        uninstalled_at = NULL
  RETURNING * INTO _install;

  -- Only count a genuinely-new activation.
  IF NOT _was_active THEN
    UPDATE public.marketplace_items SET install_count = install_count + 1 WHERE id = _item.id;
  END IF;

  -- §17 append-only ledger. First-party items are free today → all-zero money,
  -- but the take-rate math is written generally for paid third-party items.
  _gross := COALESCE(_item.price_cents, 0);
  _fee   := (_gross * COALESCE(_item.take_rate_bps, 0)) / 10000;
  _net   := _gross - _fee;
  INSERT INTO public.marketplace_install_ledger
    (install_id, item_id, vendor_id, tenant_id, event_type, gross_cents, take_rate_bps, platform_fee_cents, vendor_net_cents)
  VALUES
    (_install.id, _item.id, _item.vendor_id, _tenant_id, 'install', _gross, COALESCE(_item.take_rate_bps,0), _fee, _net);

  RETURN jsonb_build_object(
    'ok', true,
    'already_installed', false,
    'item_slug', _item.slug,
    'item_type', _item.item_type,
    'version', _ver.semver,
    'skills_enabled', to_jsonb(_skill_slugs),
    'kb_docs_seeded', COALESCE(array_length(_seeded_kb_doc_ids, 1), 0),
    'skipped_functions', _skipped,
    'install_id', _install.id
  );
END $function$;
REVOKE ALL ON FUNCTION public.install_marketplace_item(uuid, text, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.install_marketplace_item(uuid, text, uuid[], text) TO authenticated, service_role;

-- ── uninstall ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.uninstall_marketplace_item(
  _tenant_id uuid,
  _item_slug text
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item     public.marketplace_items%ROWTYPE;
  _install  public.marketplace_installs%ROWTYPE;
  _slug     text;
  _doc      uuid;
  _skills_off text[] := '{}';
  _docs_removed integer := 0;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to uninstall for this tenant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO _install FROM public.marketplace_installs
   WHERE tenant_id = _tenant_id AND item_id = _item.id;
  IF NOT FOUND OR _install.status = 'uninstalled' THEN
    RETURN jsonb_build_object('ok', true, 'was_installed', false, 'item_slug', _item.slug);
  END IF;

  -- Reverse the skills this install turned on.
  FOR _slug IN SELECT jsonb_array_elements_text(COALESCE(_install.seeded_refs->'skill_slugs','[]'::jsonb))
  LOOP
    PERFORM public.set_tenant_skill(_tenant_id, _slug, false);
    _skills_off := array_append(_skills_off, _slug);
  END LOOP;

  -- Delete exactly the KB docs this install seeded (chunks cascade). Scope the
  -- delete to this tenant defensively even though the ids came from our own row.
  FOR _doc IN SELECT (jsonb_array_elements_text(COALESCE(_install.seeded_refs->'kb_doc_ids','[]'::jsonb)))::uuid
  LOOP
    DELETE FROM public.tenant_knowledge_docs WHERE id = _doc AND tenant_id = _tenant_id;
    IF FOUND THEN _docs_removed := _docs_removed + 1; END IF;
  END LOOP;

  UPDATE public.marketplace_installs
     SET status = 'uninstalled', uninstalled_at = now()
   WHERE id = _install.id;

  UPDATE public.marketplace_items
     SET install_count = GREATEST(install_count - 1, 0)
   WHERE id = _item.id;

  INSERT INTO public.marketplace_install_ledger
    (install_id, item_id, vendor_id, tenant_id, event_type, gross_cents, take_rate_bps, platform_fee_cents, vendor_net_cents)
  VALUES
    (_install.id, _item.id, _item.vendor_id, _tenant_id, 'uninstall', 0, 0, 0, 0);

  RETURN jsonb_build_object(
    'ok', true,
    'was_installed', true,
    'item_slug', _item.slug,
    'skills_disabled', to_jsonb(_skills_off),
    'kb_docs_removed', _docs_removed
  );
END $function$;
REVOKE ALL ON FUNCTION public.uninstall_marketplace_item(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uninstall_marketplace_item(uuid, text) TO authenticated, service_role;

-- ── §10 read seam: the catalog a tenant can see + install state ──────────────
CREATE OR REPLACE FUNCTION public.marketplace_catalog_for_tenant(_tenant_id uuid)
 RETURNS TABLE (
   slug text, item_type public.marketplace_item_type, name text, tagline text,
   description text, category text, icon text, pricing_model text, price_cents integer,
   requires_embedding boolean, installed boolean, install_status text, version text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Authorize the caller for THIS tenant before revealing its install state —
  -- otherwise the `installed` flags leak another tenant's choices (IDOR, §9/§13).
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to read this tenant''s catalog' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.slug, i.item_type, i.name, i.tagline, i.description, i.category, i.icon,
         i.pricing_model, i.price_cents,
         (v.install_manifest ? 'kb_pack') AS requires_embedding,
         (mi.id IS NOT NULL AND mi.status = 'active') AS installed,
         mi.status AS install_status,
         v.semver AS version
  FROM public.marketplace_items i
  LEFT JOIN public.marketplace_item_versions v ON v.id = i.current_version_id
  LEFT JOIN public.marketplace_installs mi ON mi.item_id = i.id AND mi.tenant_id = _tenant_id
  WHERE public.is_platform_owner()
     OR (i.status = 'listed' AND (
          i.scope = 'public'
          OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
          OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, auth.uid()) IS NOT NULL)
        ))
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid) TO authenticated, service_role;

COMMIT;
