-- Practice Blueprints — Slice 1: install substrate
-- ---------------------------------------------------------------------------
-- Extends the marketplace install/teardown seam so a config-only Blueprint can
-- seed a tenant's Playbook (preset + persona overlay), feature flags, and a
-- journey-stage ladder, with a FULLY REVERSIBLE teardown. Every existing
-- behavior of the touched functions is preserved byte-for-byte; only the
-- additions below are new.
--
-- Source of truth for the reproduced bodies: prod (ref xygzykjyynhzqytbqnzu),
-- pg_get_functiondef of the live objects (latest = 20260714340000 operator
-- seam, plus Hotfix-2 auth-agnostic write precedent).
--
-- Sections:
--   (A) NEW TABLE public.tenant_journey_stages (+ indexes, RLS, grants)
--   (B) set_tenant_skill — add a service-role branch (#448 fold)
--   (C) _marketplace_apply_playbook_config / _marketplace_restore_playbook_config
--   (D) _marketplace_install_node — new manifest kinds + singleton ownership
--   (E) _marketplace_teardown_install — reversal legs
--   (F) marketplace_publish_version — widen _allowed_kinds
-- ---------------------------------------------------------------------------

BEGIN;

-- ===========================================================================
-- (A) tenant_journey_stages
-- ===========================================================================
CREATE TABLE public.tenant_journey_stages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug              text        NOT NULL,
  label             text        NOT NULL,
  description       text,
  display_order     integer     NOT NULL,
  color_hex         text,
  -- ON DELETE CASCADE (not SET NULL): teardown finds a stage set BY source_install_id,
  -- so a hard-deleted install row must take its stages with it — SET NULL would orphan
  -- them beyond teardown's reach. Normal teardown deletes rows explicitly; this FK is
  -- the safety net for the (unexpected) hard-delete path.
  source_install_id uuid        REFERENCES public.marketplace_installs(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- slug is the only per-tenant uniqueness invariant. display_order is intentionally
  -- NOT unique: two coexisting installs may seed ladders with overlapping order slots
  -- (distinct slugs); ordering is app-side deterministic by (display_order, slug).
  CONSTRAINT tenant_journey_stages_tenant_slug_key  UNIQUE (tenant_id, slug)
);

-- Read-ordering index for (tenant_id, display_order). The former UNIQUE(tenant_id,
-- display_order) constraint was dropped (overlapping order slots across installs are
-- allowed), so a plain non-unique btree is re-added here to serve ordered reads.
-- The source_install_id lookup index serves teardown (delete-by-install).
CREATE INDEX tenant_journey_stages_tenant_order_idx
  ON public.tenant_journey_stages (tenant_id, display_order);
CREATE INDEX tenant_journey_stages_source_install_idx
  ON public.tenant_journey_stages (source_install_id);

ALTER TABLE public.tenant_journey_stages ENABLE ROW LEVEL SECURITY;

-- Policies mirror the live tenant_knowledge_docs seam, tightened per brief:
-- SELECT = platform owner OR tenant member; writes = platform owner OR tenant admin.
-- (The Slice-1 write path is the SECURITY DEFINER install node, which bypasses RLS;
--  these policies govern the future tenant UI.)
CREATE POLICY tjs_tenant_read ON public.tenant_journey_stages
  FOR SELECT USING (public.is_platform_owner() OR public.is_tenant_member(tenant_id));
CREATE POLICY tjs_tenant_insert ON public.tenant_journey_stages
  FOR INSERT WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));
CREATE POLICY tjs_tenant_update ON public.tenant_journey_stages
  FOR UPDATE USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id))
           WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));
CREATE POLICY tjs_tenant_delete ON public.tenant_journey_stages
  FOR DELETE USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_journey_stages TO authenticated, service_role;

-- ===========================================================================
-- (B) set_tenant_skill — #448 fold: allow the already-authorized service-role
--     (actor) path to flip a skill. The JWT-caller auth check is UNCHANGED.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_tenant_skill(_tenant_id uuid, _skill text, _enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _skills jsonb;
BEGIN
  -- JWT caller (auth.uid() present): unchanged owner/admin gate.
  -- Service-role caller (auth.uid() NULL): the install node / actor overload has
  -- already authorized the tenant admin (is_tenant_admin_as), so trust it here —
  -- the same precedent _marketplace_clear_orphan_skills relies on.
  IF auth.uid() IS NOT NULL THEN
    IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
      RAISE EXCEPTION 'not authorized to change this tenant''s skills';
    END IF;
  ELSIF NOT public._marketplace_is_service_role() THEN
    RAISE EXCEPTION 'not authorized to change this tenant''s skills';
  END IF;
  IF _skill IS NULL OR _skill !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid skill slug';
  END IF;

  -- current set, minus this skill (so we can re-add cleanly / de-dupe)
  SELECT COALESCE(
           (SELECT jsonb_agg(DISTINCT v)
            FROM jsonb_array_elements_text(COALESCE(t.features->'enabled_skills', '[]'::jsonb)) AS v
            WHERE v <> _skill),
           '[]'::jsonb)
  INTO _skills
  FROM public.tenants t WHERE t.id = _tenant_id;

  IF _enabled THEN
    _skills := _skills || to_jsonb(_skill);
  END IF;

  UPDATE public.tenants
  SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('enabled_skills', _skills)
  WHERE id = _tenant_id;

  RETURN _skills;
END $function$;

-- ===========================================================================
-- (C) Auth-agnostic playbook apply / restore helpers (internal only).
--     SECURITY DEFINER, search_path pinned, no grant to authenticated/anon.
--     They re-check nothing — the install/teardown node already authorized the
--     caller (Hotfix-2 precedent).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._marketplace_apply_playbook_config(_tenant uuid, _config jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Inlines set_tenant_playbook's EXACT config write: features || {playbook_config}
  -- and, when the config carries a slug, the top-level features.playbook mirror.
  UPDATE public.tenants
     SET features = COALESCE(features, '{}'::jsonb)
                    || jsonb_build_object('playbook_config', _config)
                    || (CASE WHEN _config ? 'slug'
                              THEN jsonb_build_object('playbook', _config->>'slug')
                              ELSE '{}'::jsonb END)
   WHERE id = _tenant;
END $function$;
REVOKE ALL ON FUNCTION public._marketplace_apply_playbook_config(uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._marketplace_restore_playbook_config(_tenant uuid, _prior_config jsonb, _prior_slug text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Restore BOTH the playbook_config object AND the top-level playbook slug to the
  -- captured pre-install slice. A prior that was ABSENT (SQL NULL captured as JSON
  -- null) removes the key; a present prior is restored verbatim. This is NOT a
  -- blanket delete of 'playbook' — a tenant who had features.playbook='funding'
  -- with no config object gets that slug back exactly.
  IF _prior_config IS NULL OR jsonb_typeof(_prior_config) = 'null' THEN
    UPDATE public.tenants SET features = COALESCE(features, '{}'::jsonb) - 'playbook_config'
     WHERE id = _tenant;
  ELSE
    UPDATE public.tenants SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('playbook_config', _prior_config)
     WHERE id = _tenant;
  END IF;

  IF _prior_slug IS NULL THEN
    UPDATE public.tenants SET features = COALESCE(features, '{}'::jsonb) - 'playbook'
     WHERE id = _tenant;
  ELSE
    UPDATE public.tenants SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('playbook', _prior_slug)
     WHERE id = _tenant;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public._marketplace_restore_playbook_config(uuid, jsonb, text) FROM PUBLIC;

-- ===========================================================================
-- (D) _marketplace_install_node — add playbook_preset / persona_overlay /
--     feature_flag / journey_stages legs; snapshot prior state ONCE; stamp
--     singleton ownership of playbook_config. Everything else is byte-for-byte
--     the live body (the skill_flag branch and both _was_active idempotent
--     early-returns are UNCHANGED).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._marketplace_install_node(_tenant_id uuid, _item_slug text, _is_owner boolean, _seeded_kb_doc_ids uuid[], _installed_by_agent text, _parent_install_id uuid, _path text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item        public.marketplace_items%ROWTYPE;
  _ver         public.marketplace_item_versions%ROWTYPE;
  _existing    public.marketplace_installs%ROWTYPE;
  _install     public.marketplace_installs%ROWTYPE;
  _had_row     boolean := false;
  _was_active  boolean := false;
  _pending     boolean := false;
  _needs_embed boolean := false;
  _fn          jsonb;
  _kind        text;
  _skill_slugs text[] := '{}';
  _skipped     jsonb := '[]'::jsonb;
  _seeded_refs jsonb;
  _held        boolean := (_parent_install_id IS NULL);
  _child_slug  text;
  _child_res   jsonb;
  _children    jsonb := '[]'::jsonb;
  _deferred    jsonb := '[]'::jsonb;
  _reconciled  integer := 0;
  _gross integer := 0; _fee integer := 0; _net integer := 0;
  -- Slice-1 additions:
  _prior_features jsonb;
  _prior_pb       jsonb;
  _prior_pb_slug  text;
  _working_pb     jsonb;
  _persona_patch  jsonb := '{}'::jsonb;
  _pb_touched     boolean := false;
  _feat_keys      jsonb := '[]'::jsonb;
  _journey        jsonb := '[]'::jsonb;
  _journey_owned  text[] := '{}';
  _ff_key         text;
  _owner_id       text;
  _capture_prior  jsonb;
BEGIN
  IF _item_slug = ANY (_path) THEN
    RAISE EXCEPTION 'bundle cycle detected: % already on install path %', _item_slug, _path
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(array_length(_path,1),0) >= 8 THEN
    RAISE EXCEPTION 'bundle nesting exceeds max depth (8) at %', _item_slug USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT _is_owner AND _item.status <> 'listed' THEN
    RAISE EXCEPTION 'marketplace item % is not available', _item_slug USING ERRCODE = '42501';
  END IF;
  IF _item.scope = 'tenant' AND _item.visible_to_tenant_id IS DISTINCT FROM _tenant_id THEN
    RAISE EXCEPTION 'marketplace item % is scoped to another tenant and cannot be installed here', _item_slug
      USING ERRCODE = '42501';
  ELSIF _item.scope = 'agency'
        AND NOT (_is_owner OR public.agency_team_role(_item.visible_to_agency_id, auth.uid()) IS NOT NULL) THEN
    RAISE EXCEPTION 'marketplace item % is not visible to this tenant', _item_slug USING ERRCODE = '42501';
  END IF;

  IF _item.current_version_id IS NULL THEN
    RAISE EXCEPTION 'marketplace item % has no published version', _item_slug USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO _ver FROM public.marketplace_item_versions WHERE id = _item.current_version_id;

  SELECT * INTO _existing FROM public.marketplace_installs
   WHERE tenant_id = _tenant_id AND item_id = _item.id;
  _had_row := FOUND;
  _was_active := FOUND AND _existing.status = 'active';
  _needs_embed := (_ver.install_manifest ? 'kb_pack')
                  AND COALESCE(array_length(_seeded_kb_doc_ids,1),0) = 0;

  IF _was_active THEN
    _pending := COALESCE((_existing.seeded_refs->>'embedding_pending')::boolean, false);

    -- Edge-function finalize (held_directly deliberately preserved: the only caller
    -- supplying doc ids is the edge fn completing a bundle child; the genuine
    -- tenant-standalone-of-pending case arrives with NO doc ids and takes the
    -- already_active branch below, which upgrades held_directly).
    IF _pending AND COALESCE(array_length(_seeded_kb_doc_ids,1),0) > 0 THEN
      DELETE FROM public.tenant_knowledge_docs
       WHERE tenant_id = _tenant_id
         AND tags @> ARRAY['marketplace:' || _item.slug]
         AND NOT (id = ANY (_seeded_kb_doc_ids));
      GET DIAGNOSTICS _reconciled = ROW_COUNT;
      UPDATE public.marketplace_installs
         SET seeded_refs = jsonb_set(
               jsonb_set(seeded_refs, '{kb_doc_ids}', to_jsonb(_seeded_kb_doc_ids)),
               '{embedding_pending}', 'false'::jsonb),
             version_id = _ver.id
       WHERE id = _existing.id
       RETURNING * INTO _install;
      RETURN jsonb_build_object(
        'ok', true, 'already_installed', true, 'status', 'finalized',
        'item_slug', _item.slug, 'item_type', _item.item_type, 'version', _ver.semver,
        'skills_enabled', COALESCE(_existing.seeded_refs->'skill_slugs','[]'::jsonb),
        'kb_docs_seeded', COALESCE(array_length(_seeded_kb_doc_ids,1),0),
        'needs_embedding', false, 'reconciled_orphans', _reconciled,
        'skipped_functions', '[]'::jsonb, 'warning', NULL,
        'seeded_refs', _install.seeded_refs, 'install_id', _install.id, 'children', '[]'::jsonb);
    END IF;

    -- Genuine idempotent no-op (bundle re-install does NOT re-walk manifest; version
    -- changes route through the update_available path). Two provenance touch-ups:
    IF _parent_install_id IS NULL AND NOT _existing.held_directly THEN
      UPDATE public.marketplace_installs SET held_directly = true WHERE id = _existing.id;
    END IF;
    IF _parent_install_id IS NOT NULL THEN
      INSERT INTO public.marketplace_install_bundle_links
        (bundle_install_id, child_install_id, tenant_id, child_item_slug)
      VALUES (_parent_install_id, _existing.id, _tenant_id, _item.slug)
      ON CONFLICT (bundle_install_id, child_install_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
      'ok', true, 'already_installed', true, 'status', 'already_active',
      'item_slug', _item.slug, 'item_type', _item.item_type, 'version', _ver.semver,
      'needs_embedding', _pending, 'seeded_refs', _existing.seeded_refs,
      'install_id', _existing.id, 'children', '[]'::jsonb);
  END IF;

  -- --- Slice-1: snapshot tenant playbook/feature state ONCE, pre-mutation. -----
  SELECT COALESCE(t.features, '{}'::jsonb) INTO _prior_features
    FROM public.tenants t WHERE t.id = _tenant_id;
  _prior_pb      := _prior_features->'playbook_config';   -- SQL NULL if absent
  _prior_pb_slug := _prior_features->>'playbook';         -- SQL NULL if absent
  _working_pb    := _prior_pb;

  FOR _fn IN SELECT * FROM jsonb_array_elements(COALESCE(_ver.install_manifest->'functions','[]'::jsonb))
  LOOP
    _kind := _fn->>'kind';
    IF _kind = 'skill_flag' AND (_fn->>'slug') IS NOT NULL THEN
      PERFORM public.set_tenant_skill(_tenant_id, _fn->>'slug', true);
      _skill_slugs := array_append(_skill_slugs, _fn->>'slug');

    ELSIF _kind = 'playbook_preset' THEN
      -- Preset defines the base playbook config.
      _working_pb := COALESCE(_fn->'config', '{}'::jsonb);
      _pb_touched := true;

    ELSIF _kind = 'persona_overlay' THEN
      -- Overlay is accumulated separately and merged onto the base AFTER the loop,
      -- so the outcome is order-independent (preset base + overlay persona) whether
      -- the overlay appears before or after the preset in the manifest.
      _persona_patch := _persona_patch || COALESCE(_fn->'persona', '{}'::jsonb);
      _pb_touched := true;

    ELSIF _kind = 'feature_flag' AND (_fn->>'key') IS NOT NULL THEN
      _ff_key := _fn->>'key';
      -- Reserved-key guard: these are owned by the playbook/skill legs, the playbook
      -- ownership stamp, and the feature-flag owner map — a feature_flag must never
      -- double-write them (__feature_flag_owners is the cross-install owner registry).
      IF _ff_key IN ('playbook','playbook_config','enabled_skills','playbook_config_source_install','__feature_flag_owners') THEN
        _skipped := _skipped || jsonb_build_array(_fn);
      ELSE
        -- Cross-install prior capture: if a prior install already OWNS this key, INHERIT
        -- its captured prior (the pre-first-install value) so the restore chain returns to
        -- the original pristine value when the LAST owner leaves — never to an intermediate
        -- install's write. If unowned, snapshot the current pre-mutation value.
        _owner_id := _prior_features->'__feature_flag_owners'->>_ff_key;
        IF _owner_id IS NOT NULL THEN
          SELECT elem->'prior'
            INTO _capture_prior
            FROM public.marketplace_installs mi,
                 jsonb_array_elements(COALESCE(mi.seeded_refs->'features_keys','[]'::jsonb)) elem
           WHERE mi.id = _owner_id::uuid AND elem->>'key' = _ff_key
           LIMIT 1;
        ELSE
          _capture_prior := _prior_features->_ff_key;
        END IF;
        _feat_keys := _feat_keys || jsonb_build_array(
          jsonb_build_object('key', _ff_key, 'prior', _capture_prior));
        UPDATE public.tenants
           SET features = COALESCE(features,'{}'::jsonb) || jsonb_build_object(_ff_key, _fn->'value')
         WHERE id = _tenant_id;
      END IF;

    ELSIF _kind = 'journey_stages' THEN
      -- Stash; applied AFTER the install-row insert (needs _install.id).
      _journey := COALESCE(_fn->'stages', '[]'::jsonb);

    ELSE
      _skipped := _skipped || jsonb_build_array(_fn);
    END IF;
  END LOOP;

  -- Merge the accumulated persona overlay onto the working playbook config.
  IF _persona_patch <> '{}'::jsonb THEN
    _working_pb := COALESCE(_working_pb, '{}'::jsonb)
                   || jsonb_build_object('persona',
                        COALESCE(_working_pb->'persona','{}'::jsonb) || _persona_patch);
  END IF;

  -- Pre-resolve which journey stage slugs THIS install may own — cross-install
  -- guard: never steal a (tenant, slug) already present for another install
  -- (analogous to _marketplace_skill_referenced_elsewhere).
  IF _journey <> '[]'::jsonb THEN
    SELECT COALESCE(array_agg(s->>'slug'), '{}')
      INTO _journey_owned
      FROM jsonb_array_elements(_journey) AS s
     WHERE (s->>'slug') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.tenant_journey_stages js
          WHERE js.tenant_id = _tenant_id AND js.slug = s->>'slug');
  END IF;

  -- Reconcile ONLY when a winning doc set is supplied (empty set = deferred fan-out
  -- child; reconcile is done later in the finalize branch, never wiping embedded docs).
  IF array_length(_seeded_kb_doc_ids, 1) IS NOT NULL THEN
    DELETE FROM public.tenant_knowledge_docs
     WHERE tenant_id = _tenant_id
       AND tags @> ARRAY['marketplace:' || _item.slug]
       AND NOT (id = ANY (_seeded_kb_doc_ids));
    GET DIAGNOSTICS _reconciled = ROW_COUNT;
  END IF;

  _seeded_refs := jsonb_build_object(
    'skill_slugs', to_jsonb(_skill_slugs),
    'kb_doc_ids', to_jsonb(COALESCE(_seeded_kb_doc_ids, '{}'::uuid[])),
    'portal_surface_slugs', '[]'::jsonb,
    'features_keys', _feat_keys,
    'journey_stage_slugs', to_jsonb(_journey_owned),
    'playbook_config_touched', to_jsonb(_pb_touched),
    'prior_playbook_config', _prior_pb,
    'prior_playbook_key', to_jsonb(_prior_pb_slug),
    'embedding_pending', _needs_embed
  );

  INSERT INTO public.marketplace_installs
    (tenant_id, item_id, version_id, status, seeded_refs, held_directly,
     installed_by, installed_by_agent, installed_at, uninstalled_at)
  VALUES
    (_tenant_id, _item.id, _ver.id, 'active', _seeded_refs, _held,
     auth.uid(), _installed_by_agent, now(), NULL)
  ON CONFLICT (tenant_id, item_id) DO UPDATE
    SET version_id = EXCLUDED.version_id,
        status = 'active',
        seeded_refs = EXCLUDED.seeded_refs,
        held_directly = CASE WHEN _parent_install_id IS NULL
                             THEN true ELSE public.marketplace_installs.held_directly END,
        installed_by = EXCLUDED.installed_by,
        installed_by_agent = EXCLUDED.installed_by_agent,
        installed_at = now(),
        uninstalled_at = NULL
  RETURNING * INTO _install;

  -- --- Slice-1: apply the playbook leg ONCE, stamp singleton ownership, and
  --     seed this install's journey stages (all need _install.id). -----------
  IF _pb_touched THEN
    PERFORM public._marketplace_apply_playbook_config(_tenant_id, COALESCE(_working_pb, '{}'::jsonb));
    -- Singleton ownership stamp: playbook_config is a per-tenant singleton, so we
    -- record WHICH install currently owns it. Teardown only restores if this
    -- install is still the owner (a later install that overwrites carries its own
    -- prior snapshot and takes over the stamp).
    -- DESIGN NOTE (accepted, per design): the playbook singleton uses a snapshot-
    -- CURRENT-state model — uninstalling a later install B restores A's config (the
    -- state B captured), NOT the absolute pre-A pristine value. Intended. (The
    -- feature_flag owner map below is deliberately stricter: it INHERITS the original
    -- prior across ownership transfers, so its restore chain returns to pristine.)
    UPDATE public.tenants
       SET features = COALESCE(features,'{}'::jsonb)
                      || jsonb_build_object('playbook_config_source_install', _install.id)
     WHERE id = _tenant_id;
  END IF;

  -- Feature-flag ownership stamp: record THIS install as the current owner of every
  -- non-reserved feature key it wrote (mirrors the playbook singleton stamp). Teardown
  -- restores a key ONLY IF this install is still its owner; a later install that
  -- overwrites the key takes over the stamp (and inherited the original prior, above),
  -- so uninstalling the earlier install never clobbers the later install's live value.
  IF _feat_keys <> '[]'::jsonb THEN
    UPDATE public.tenants t
       SET features = COALESCE(t.features,'{}'::jsonb)
                      || jsonb_build_object('__feature_flag_owners',
                           COALESCE(t.features->'__feature_flag_owners','{}'::jsonb)
                           || (SELECT jsonb_object_agg(fk->>'key', to_jsonb(_install.id::text))
                                 FROM jsonb_array_elements(_feat_keys) fk))
     WHERE t.id = _tenant_id;
  END IF;

  IF _journey_owned <> '{}' THEN
    INSERT INTO public.tenant_journey_stages
      (tenant_id, slug, label, description, display_order, color_hex, source_install_id)
    SELECT _tenant_id, s->>'slug', s->>'label', s->>'description',
           (s->>'display_order')::int, s->>'color_hex', _install.id
      FROM jsonb_array_elements(_journey) AS s
     WHERE (s->>'slug') = ANY (_journey_owned);
  END IF;

  IF (NOT _had_row) OR _existing.status = 'uninstalled' THEN
    UPDATE public.marketplace_items SET install_count = install_count + 1 WHERE id = _item.id;
  END IF;

  -- §17 ledger: direct install captures the sale; a fan-out child is billed ZERO
  -- (the purchased bundle captured the money — no GMV double-count / vendor over-credit).
  IF _parent_install_id IS NULL THEN
    _gross := COALESCE(_item.price_cents, 0);
  ELSE
    _gross := 0;
  END IF;
  _fee := (_gross * COALESCE(_item.take_rate_bps, 0)) / 10000;
  _net := _gross - _fee;
  INSERT INTO public.marketplace_install_ledger
    (install_id, item_id, vendor_id, tenant_id, event_type, gross_cents, take_rate_bps, platform_fee_cents, vendor_net_cents)
  VALUES
    (_install.id, _item.id, _item.vendor_id, _tenant_id, 'install', _gross,
     CASE WHEN _gross = 0 THEN 0 ELSE COALESCE(_item.take_rate_bps,0) END, _fee, _net);

  IF _parent_install_id IS NOT NULL THEN
    INSERT INTO public.marketplace_install_bundle_links
      (bundle_install_id, child_install_id, tenant_id, child_item_slug)
    VALUES (_parent_install_id, _install.id, _tenant_id, _item.slug)
    ON CONFLICT (bundle_install_id, child_install_id) DO NOTHING;
  END IF;

  IF _item.item_type = 'bundle' THEN
    FOR _child_slug IN
      SELECT jsonb_array_elements_text(COALESCE(_ver.install_manifest->'bundle_items','[]'::jsonb))
    LOOP
      _child_res := public._marketplace_install_node(
        _tenant_id, _child_slug, _is_owner, '{}'::uuid[], _installed_by_agent,
        _install.id, _path || _item.slug);
      _children := _children || jsonb_build_array(_child_res);
      IF COALESCE((_child_res->>'needs_embedding')::boolean, false) THEN
        _deferred := _deferred || jsonb_build_array(jsonb_build_object(
          'item_slug', _child_res->>'item_slug',
          'install_id', _child_res->>'install_id',
          'via_bundle_install_id', _install.id));
      END IF;
      -- Bubble up a nested (grandchild) deferral so the top-level flat list is complete.
      _deferred := _deferred || COALESCE(_child_res->'children_deferred_embedding', '[]'::jsonb);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_installed', false,
    'status', CASE WHEN _needs_embed THEN 'deferred_embedding' ELSE 'installed' END,
    'item_slug', _item.slug,
    'item_type', _item.item_type,
    'version', _ver.semver,
    'skills_enabled', to_jsonb(_skill_slugs),
    'kb_docs_seeded', COALESCE(array_length(_seeded_kb_doc_ids,1),0),
    'needs_embedding', _needs_embed,
    'reconciled_orphans', _reconciled,
    'skipped_functions', _skipped,
    'warning', CASE WHEN _needs_embed THEN
        'Knowledge pack must be embedded by the marketplace-install edge function; skills were enabled and the install is recorded as embedding_pending.'
      ELSE NULL END,
    'seeded_refs', _install.seeded_refs,
    'install_id', _install.id,
    'children', _children,
    'children_deferred_embedding', _deferred);
END $function$;

-- ===========================================================================
-- (E) _marketplace_teardown_install — add feature_flag, journey_stages, and
--     playbook (singleton-ownership-guarded) reversal legs, AFTER the skill/kb
--     legs and BEFORE the bundle-child cascade, all in the same teardown txn.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._marketplace_teardown_install(_tenant_id uuid, _install_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inst         public.marketplace_installs%ROWTYPE;
  _slug         text;
  _doc          uuid;
  _skills_off   text[] := '{}';
  _docs_removed integer := 0;
  _link         record;
  _child        public.marketplace_installs%ROWTYPE;
  _remaining    integer;
  _children     jsonb := '[]'::jsonb;
  -- Slice-1 additions:
  _feats            jsonb;
  _fk               jsonb;
  _ff_key           text;
  _features_reverted jsonb := '[]'::jsonb;
  _owned_off        jsonb := '[]'::jsonb;
  _journey_removed  integer := 0;
  _pb_restored      boolean := false;
BEGIN
  SELECT * INTO _inst FROM public.marketplace_installs WHERE id = _install_id FOR UPDATE;
  IF NOT FOUND OR _inst.status = 'uninstalled' THEN
    RETURN jsonb_build_object('install_id', _install_id, 'torn_down', false);
  END IF;

  UPDATE public.marketplace_installs
     SET status = 'uninstalled', held_directly = false, uninstalled_at = now()
   WHERE id = _install_id;

  FOR _slug IN SELECT jsonb_array_elements_text(COALESCE(_inst.seeded_refs->'skill_slugs','[]'::jsonb))
  LOOP
    IF NOT public._marketplace_skill_referenced_elsewhere(_tenant_id, _slug, _install_id) THEN
      PERFORM public.set_tenant_skill(_tenant_id, _slug, false);
      _skills_off := array_append(_skills_off, _slug);
    END IF;
  END LOOP;

  FOR _doc IN SELECT (jsonb_array_elements_text(COALESCE(_inst.seeded_refs->'kb_doc_ids','[]'::jsonb)))::uuid
  LOOP
    DELETE FROM public.tenant_knowledge_docs WHERE id = _doc AND tenant_id = _tenant_id;
    IF FOUND THEN _docs_removed := _docs_removed + 1; END IF;
  END LOOP;

  -- --- Slice-1 reversal legs (feature flags, journey stages, playbook singleton) ---
  SELECT COALESCE(t.features, '{}'::jsonb) INTO _feats FROM public.tenants t WHERE t.id = _tenant_id;

  -- feature_flag leg: restore each captured key to its pre-install value (or remove
  -- it if it was absent) — but ONLY IF this install is still the key's current owner
  -- (cross-install ownership guard, mirroring the playbook singleton). A later install
  -- that overwrote the key owns the stamp and carries its own (inherited) prior; this
  -- teardown must NOT clobber the live value it set. Reserved keys were never captured
  -- here, so no other leg's key can be touched.
  FOR _fk IN SELECT * FROM jsonb_array_elements(COALESCE(_inst.seeded_refs->'features_keys','[]'::jsonb))
  LOOP
    _ff_key := _fk->>'key';
    IF _ff_key IS NULL THEN CONTINUE; END IF;
    -- Not the current owner? Skip: do not restore its prior, do not touch the map.
    IF (_feats->'__feature_flag_owners'->>_ff_key) IS DISTINCT FROM _install_id::text THEN
      CONTINUE;
    END IF;
    IF (_fk->'prior') IS NULL OR jsonb_typeof(_fk->'prior') = 'null' THEN
      UPDATE public.tenants SET features = COALESCE(features,'{}'::jsonb) - _ff_key WHERE id = _tenant_id;
    ELSE
      UPDATE public.tenants SET features = COALESCE(features,'{}'::jsonb) || jsonb_build_object(_ff_key, _fk->'prior')
       WHERE id = _tenant_id;
    END IF;
    _owned_off := _owned_off || jsonb_build_array(_ff_key);
    _features_reverted := _features_reverted || jsonb_build_array(_ff_key);
  END LOOP;

  -- Release ownership: drop this install's restored keys from the owner map. If the
  -- map is emptied, remove the reserved key entirely so features returns to pristine
  -- shape (no orphan __feature_flag_owners left behind on a full teardown).
  IF _owned_off <> '[]'::jsonb THEN
    UPDATE public.tenants t
       SET features = (
         CASE WHEN (COALESCE(t.features->'__feature_flag_owners','{}'::jsonb)
                     - (SELECT array_agg(x) FROM jsonb_array_elements_text(_owned_off) x)) = '{}'::jsonb
              THEN COALESCE(t.features,'{}'::jsonb) - '__feature_flag_owners'
              ELSE COALESCE(t.features,'{}'::jsonb)
                   || jsonb_build_object('__feature_flag_owners',
                        COALESCE(t.features->'__feature_flag_owners','{}'::jsonb)
                        - (SELECT array_agg(x) FROM jsonb_array_elements_text(_owned_off) x))
         END)
     WHERE t.id = _tenant_id;
  END IF;

  -- journey_stages leg: only THIS install's rows.
  DELETE FROM public.tenant_journey_stages WHERE source_install_id = _install_id;
  GET DIAGNOSTICS _journey_removed = ROW_COUNT;

  -- playbook singleton leg: restore prior config + slug ONLY if this install is
  -- still the current owner. If a LATER install overwrote the playbook, it owns the
  -- stamp and carries its own prior — this teardown must NOT restore.
  IF (_feats->>'playbook_config_source_install') = _install_id::text THEN
    PERFORM public._marketplace_restore_playbook_config(
      _tenant_id,
      _inst.seeded_refs->'prior_playbook_config',
      _inst.seeded_refs->>'prior_playbook_key');
    UPDATE public.tenants
       SET features = COALESCE(features,'{}'::jsonb) - 'playbook_config_source_install'
     WHERE id = _tenant_id;
    _pb_restored := true;
  END IF;

  INSERT INTO public.marketplace_install_ledger
    (install_id, item_id, vendor_id, tenant_id, event_type, gross_cents, take_rate_bps, platform_fee_cents, vendor_net_cents)
  SELECT _inst.id, _inst.item_id, i.vendor_id, _tenant_id, 'uninstall', 0, 0, 0, 0
    FROM public.marketplace_items i WHERE i.id = _inst.item_id;
  UPDATE public.marketplace_items
     SET install_count = GREATEST(install_count - 1, 0) WHERE id = _inst.item_id;

  FOR _link IN SELECT * FROM public.marketplace_install_bundle_links
                WHERE bundle_install_id = _install_id
  LOOP
    DELETE FROM public.marketplace_install_bundle_links
     WHERE bundle_install_id = _install_id AND child_install_id = _link.child_install_id;

    -- Tenant predicate: defense-in-depth so §9 isolation is self-enforced here.
    SELECT * INTO _child FROM public.marketplace_installs
     WHERE id = _link.child_install_id AND tenant_id = _tenant_id;
    IF FOUND AND _child.status = 'active' THEN
      _remaining := (CASE WHEN _child.held_directly THEN 1 ELSE 0 END)
                    + public._marketplace_active_bundle_holds(_child.id);
      IF _remaining = 0 THEN
        _children := _children || jsonb_build_array(
          public._marketplace_teardown_install(_tenant_id, _child.id));
      ELSE
        _children := _children || jsonb_build_array(jsonb_build_object(
          'install_id', _child.id, 'item_slug', _link.child_item_slug,
          'torn_down', false, 'retained_holds', _remaining));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'install_id', _inst.id, 'item_id', _inst.item_id, 'torn_down', true,
    'skills_disabled', to_jsonb(_skills_off), 'kb_docs_removed', _docs_removed,
    'journey_stages_removed', _journey_removed,
    'playbook_restored', _pb_restored,
    'features_reverted', _features_reverted,
    'children', _children);
END $function$;

-- ===========================================================================
-- (F) marketplace_publish_version — widen the config-only allowlist to the
--     Slice-1 kinds. ONLY _allowed_kinds changes; every other validation and
--     the trailing behavior is byte-for-byte the live 340000 body. portal_surface
--     is dropped (the install node still doesn't apply it; re-added in the portal
--     slice); playbook_preset + journey_stages are added.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.marketplace_publish_version(_item_slug text, _semver text, _payload_class text DEFAULT 'config_only'::text, _install_manifest jsonb DEFAULT '{}'::jsonb, _changelog text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item public.marketplace_items%ROWTYPE;
  _ver  public.marketplace_item_versions%ROWTYPE;
  _fn   jsonb;
  _kind text;
  _kb   jsonb;
  _actor_role text;
  _finance_warning text := NULL;
  _allowed_kinds text[] := ARRAY['skill_flag','playbook_preset','journey_stages','persona_overlay','feature_flag'];
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN
    RAISE EXCEPTION 'only the platform owner (or service_role) may publish catalog versions'
      USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;

  IF _payload_class = 'code' THEN
    RAISE EXCEPTION 'code payloads cannot be published through the operator seam; a payload_class=code version must clear the Phase-2 approval rail (#218) before it can publish'
      USING ERRCODE = '42501';
  END IF;
  IF _payload_class IS DISTINCT FROM 'config_only' THEN
    RAISE EXCEPTION 'invalid payload_class %: only config_only is publishable here', coalesce(_payload_class,'<null>')
      USING ERRCODE = '22023';
  END IF;

  IF _semver IS NULL OR _semver !~ '^\d+\.\d+\.\d+$' THEN
    RAISE EXCEPTION 'invalid semver %: must be MAJOR.MINOR.PATCH', coalesce(_semver,'<null>')
      USING ERRCODE = '22023';
  END IF;

  IF _install_manifest IS NULL OR jsonb_typeof(_install_manifest) <> 'object' THEN
    RAISE EXCEPTION 'install_manifest must be a json object' USING ERRCODE = '22023';
  END IF;

  IF _install_manifest ? 'code_ref' OR _install_manifest ? 'code' THEN
    RAISE EXCEPTION 'install_manifest carries a code reference (code_ref/code); a code payload must clear the Phase-2 approval rail (#218), it cannot publish as config_only'
      USING ERRCODE = '42501';
  END IF;
  IF _install_manifest ? 'functions' AND jsonb_typeof(_install_manifest->'functions') <> 'array' THEN
    RAISE EXCEPTION 'install_manifest.functions must be an array' USING ERRCODE = '22023';
  END IF;
  IF _install_manifest ? 'functions' THEN
    FOR _fn IN SELECT * FROM jsonb_array_elements(_install_manifest->'functions') LOOP
      IF jsonb_typeof(_fn) <> 'object' OR (_fn->>'kind') IS NULL THEN
        RAISE EXCEPTION 'each install_manifest.functions[] entry needs an object with a kind' USING ERRCODE = '22023';
      END IF;
      _kind := _fn->>'kind';
      IF NOT (_kind = ANY (_allowed_kinds)) THEN
        RAISE EXCEPTION 'install_manifest.functions[] kind "%" is not a permitted config-only kind on the operator publish path; code-bearing/undeclared kinds must clear the Phase-2 approval rail (#218)', _kind
          USING ERRCODE = '42501';
      END IF;
      IF _fn ? 'code_ref' OR _fn ? 'code' OR _fn ? 'code_url' OR _fn ? 'source' OR _fn ? 'handler' OR _fn ? 'entrypoint' THEN
        RAISE EXCEPTION 'install_manifest.functions[] entry of kind "%" carries a code reference; code cannot publish here (Phase-2 approval rail #218)', _kind
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  IF _install_manifest ? 'kb_pack' THEN
    _kb := _install_manifest->'kb_pack';
    IF jsonb_typeof(_kb) <> 'object' OR NOT (_kb ? 'docs') OR jsonb_typeof(_kb->'docs') <> 'array' THEN
      RAISE EXCEPTION 'install_manifest.kb_pack must be an object with a docs array' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _install_manifest ? 'bundle_items' AND jsonb_typeof(_install_manifest->'bundle_items') <> 'array' THEN
    RAISE EXCEPTION 'install_manifest.bundle_items must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.marketplace_item_versions
              WHERE item_id = _item.id AND semver = _semver) THEN
    RAISE EXCEPTION 'version % already exists for item %; bump the semver', _semver, _item_slug
      USING ERRCODE = 'unique_violation';
  END IF;

  IF _item.origin = 'first_party' AND _item.scope = 'public' AND NOT _item.is_finance
     AND lower(coalesce(_install_manifest::text,'')) ~ public._marketplace_finance_re() THEN
    _finance_warning := 'This public first-party version ships finance/credit vocabulary but the item is not marked is_finance. A public listing is shown to all tenants in browse. Mark is_finance and keep it opt-in, or confirm the exposure is intended (section 2).';
    RAISE WARNING '%', _finance_warning;
  END IF;

  INSERT INTO public.marketplace_item_versions
    (item_id, semver, status, payload_class, install_manifest, changelog, created_by, published_at)
  VALUES
    (_item.id, _semver, 'published', 'config_only', _install_manifest, _changelog, auth.uid(), now())
  RETURNING * INTO _ver;

  UPDATE public.marketplace_items
     SET current_version_id = _ver.id, updated_at = now()
   WHERE id = _item.id;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role, 'marketplace.version.publish',
    'marketplace_item_version', _ver.id,
    jsonb_build_object(
      'item_slug', _item.slug, 'item_id', _item.id,
      'semver', _ver.semver, 'payload_class', _ver.payload_class,
      'manifest_keys', (SELECT coalesce(jsonb_agg(k), '[]'::jsonb)
                          FROM jsonb_object_keys(_install_manifest) k),
      'changelog', _changelog, 'set_as_current', true,
      'finance_warning', _finance_warning
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true, 'item_slug', _item.slug,
    'version_id', _ver.id, 'semver', _ver.semver,
    'status', _ver.status, 'is_current', true,
    'finance_warning', _finance_warning
  );
END $function$;

COMMIT;
