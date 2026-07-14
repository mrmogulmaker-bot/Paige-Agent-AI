-- ============================================================================
-- Marketplace Install Seam — Wave 1: BUNDLE FAN-OUT + REFERENCE-COUNTED REVERSAL
--
-- Extends (never rebuilds — §12) the existing install/uninstall RPCs so that:
--
--   (A) BUNDLE FAN-OUT. Installing an item of item_type='bundle' (manifest
--       .bundle_items = ["child_slug", ...]) recursively installs every child,
--       cycle-guarded, per-child visibility-checked (§9), atomically in the one
--       transaction the RPC already runs in. Config-only children install fully
--       in-RPC; a child that carries a kb_pack (needs Voyage embedding, which
--       Postgres cannot do) is created active-but-embedding_pending and reported
--       as deferred_embedding for the marketplace-install EDGE function to
--       finalize (contract documented at the bottom of this file). §13: the
--       receipt reports what ACTUALLY happened — children installed vs deferred.
--
--   (B) REFERENCE-COUNTED REVERSAL. An effect is torn down only when the LAST
--       holder relinquishes it. Two independent hold kinds are counted:
--         * held_directly  — the tenant installed this item standalone.
--         * bundle links   — one row per (active bundle install -> child install).
--       refcount(child) = (held_directly ? 1 : 0) + COUNT(active bundle links).
--       A child's skills/docs are reversed only when refcount hits 0. Skill flags
--       carry an additional cross-install guard: a slug is turned OFF only when NO
--       OTHER active install still lists it in seeded_refs.skill_slugs (the sharp
--       'funding' case — a bundle turns funding on, the tenant also installed the
--       standalone Funding skill; uninstalling the bundle must NOT turn funding
--       off).
--
-- ── REFERENCE-COUNT MODEL (why these two extensions, and no more) ────────────
-- A single scalar column (e.g. installed_via_bundle_id) CANNOT model a child
-- shared by two bundles (a child has many potential bundle parents). So the
-- correct minimal shape is:
--   * marketplace_installs.held_directly (bool)  — the tenant's own standalone
--     hold, distinct from a bundle-only hold. Backfills TRUE for every existing
--     install (they were all direct).
--   * marketplace_install_bundle_links (bundle_install_id, child_install_id) —
--     the many-to-many "this bundle currently holds this child" edges.
-- Ownership of *effects* stays with the child's single install row (UNIQUE
-- (tenant_id,item_id) guarantees one row per item per tenant, so a child's docs
-- are seeded exactly once and owned by exactly that row). A bundle never owns a
-- child's docs/skills — it owns a *reference*. Tearing a bundle down relinquishes
-- its references and cascades a teardown only into children whose refcount fell to
-- zero. Both new objects are RLS-guarded and queryable by Paige (§10) via
-- marketplace_install_refcount().
--
-- ── BUNDLE-CYCLE GUARD (chosen: recurse, one uniform code path, with a guard) ──
-- We allow arbitrarily nested bundles (a bundle may include a bundle) because the
-- refcount teardown is naturally recursive and composition serves §7/§12. Every
-- descent carries the slug path; if a child slug is already on the path we RAISE
-- 'bundle cycle' (this also catches a bundle listing itself). A depth cap (8) is a
-- belt-and-suspenders bound. The finance-default guard (§2) applies the SAME
-- recursive cycle-guarded walk so a bundle cannot smuggle a finance child into the
-- platform defaults.
--
-- ── LOCKING ──────────────────────────────────────────────────────────────────
-- The whole (possibly recursive) fan-out and the whole teardown each run under ONE
-- tenant-scoped advisory xact lock ('mp_install:'||tenant). Installs are rare and
-- user-initiated, so serializing a tenant's install seam is a non-issue, and a
-- single lock removes ALL multi-row lock-ordering / deadlock risk that per-child
-- locks would introduce when two bundles share a child. Install and uninstall use
-- the same key, so they serialize against each other too.
--
-- Gate unchanged on every public entry point: is_platform_owner() OR
-- is_tenant_admin(_tenant) — the _tenant arg is authorized, never trusted (§9/§13).
-- ============================================================================

BEGIN;

-- ── 1. Schema extension: the two new refcount objects ────────────────────────
ALTER TABLE public.marketplace_installs
  ADD COLUMN IF NOT EXISTS held_directly boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.marketplace_installs.held_directly IS
  'Reference-count model (Wave 1): TRUE when the tenant installed this item standalone (a direct hold). A child pulled in ONLY by a bundle fan-out is FALSE. Effects are reversed only when held_directly is false AND no active bundle link references this install. Existing rows backfill TRUE (all prior installs were direct).';

CREATE TABLE IF NOT EXISTS public.marketplace_install_bundle_links (
  bundle_install_id uuid NOT NULL REFERENCES public.marketplace_installs(id) ON DELETE CASCADE,
  child_install_id  uuid NOT NULL REFERENCES public.marketplace_installs(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL,
  child_item_slug   text NOT NULL,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bundle_install_id, child_install_id),
  CONSTRAINT mp_bundle_link_no_self CHECK (bundle_install_id <> child_install_id)
);
COMMENT ON TABLE public.marketplace_install_bundle_links IS
  'Wave 1 bundle fan-out edges: one row per (active bundle install -> child install it pulled in). refcount(child) = held_directly + COUNT(rows here whose bundle install is still active). Written only by the SECURITY DEFINER install/uninstall RPCs; readable (RLS) by the owning tenant + platform owner (§10).';

CREATE INDEX IF NOT EXISTS idx_mp_bundle_links_child
  ON public.marketplace_install_bundle_links (child_install_id);
CREATE INDEX IF NOT EXISTS idx_mp_bundle_links_tenant
  ON public.marketplace_install_bundle_links (tenant_id);

ALTER TABLE public.marketplace_install_bundle_links ENABLE ROW LEVEL SECURITY;
-- Read-only to the owning tenant admin + platform owner. All writes go through the
-- SECURITY DEFINER RPCs (which run as the table owner and bypass RLS) — there is
-- deliberately NO write policy, so a direct authenticated write is default-denied.
DROP POLICY IF EXISTS mp_bundle_links_read ON public.marketplace_install_bundle_links;
CREATE POLICY mp_bundle_links_read ON public.marketplace_install_bundle_links
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));
GRANT SELECT ON public.marketplace_install_bundle_links TO authenticated, service_role;

-- ── 2. §2 finance vocabulary — ONE source of truth (shared by guard + recheck) ─
-- Refactor (§12): the guard and the new after-the-fact recheck (below) must match
-- the exact same finance lexicon, so it lives in one immutable function instead of
-- being copy-pasted (a drift here is a §2 hole).
CREATE OR REPLACE FUNCTION public._marketplace_finance_re()
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT '(credit|funding|lending|lender|loan|financ|capital[- ]rais|tradeline|underwrit|\mdebt\M|merchant cash|cash advance|\mfico\M|collections|business credit|net[- ]?30|grant writ)'::text;
$function$;

-- ── §2 finance-default guard: extend to walk bundle children recursively ──────
-- A bundle's own copy/manifest is just child slugs; the finance content lives in
-- the CHILDREN. So when a DEFAULT item is a bundle, recurse (cycle-guarded) and
-- reject if ANY descendant is is_finance or ships finance vocabulary. Non-bundle
-- behaviour is byte-for-byte the prior guard.
CREATE OR REPLACE FUNCTION public.marketplace_item_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE
  _hay text; _manifest jsonb; _bad text;
  _fin_re text := public._marketplace_finance_re();
BEGIN
  IF NEW.default_for_new_tenants THEN
    -- Authoritative structural block: a finance item is never a default (§2).
    IF NEW.is_finance THEN
      RAISE EXCEPTION 'A finance/credit marketplace item cannot be a default for new tenants (section 2). It may be listed as an opt-in item only.'
        USING ERRCODE = '22023';
    END IF;

    SELECT install_manifest INTO _manifest
      FROM public.marketplace_item_versions WHERE id = NEW.current_version_id;

    -- Secondary net: scan this item's effective payload (display copy + manifest).
    _hay := lower(concat_ws(' ',
      NEW.slug, NEW.name, NEW.tagline, NEW.description, NEW.category,
      coalesce(_manifest::text, '')));
    IF _hay ~ _fin_re THEN
      RAISE EXCEPTION 'This item ships finance/credit content and cannot be a default for new tenants (section 2). List it as an opt-in item, or set is_finance and keep it opt-in.'
        USING ERRCODE = '22023';
    END IF;

    -- Bundle net: no descendant (recursively) may be finance or carry finance copy.
    IF _manifest ? 'bundle_items' THEN
      WITH RECURSIVE tree(slug, depth, path) AS (
        SELECT c.slug, 1, ARRAY[NEW.slug]
          FROM jsonb_array_elements_text(_manifest->'bundle_items') AS c(slug)
        UNION ALL
        SELECT gc.slug, t.depth + 1, t.path || t.slug
          FROM tree t
          JOIN public.marketplace_items ci ON ci.slug = t.slug
          JOIN public.marketplace_item_versions cv ON cv.id = ci.current_version_id
          CROSS JOIN LATERAL jsonb_array_elements_text(
                 COALESCE(cv.install_manifest->'bundle_items','[]'::jsonb)) AS gc(slug)
         WHERE t.depth < 8 AND NOT (gc.slug = ANY (t.path))
      )
      SELECT string_agg(DISTINCT ci.slug, ', ') INTO _bad
        FROM tree t
        JOIN public.marketplace_items ci ON ci.slug = t.slug
        LEFT JOIN public.marketplace_item_versions cv ON cv.id = ci.current_version_id
       WHERE ci.is_finance
          OR lower(concat_ws(' ', ci.slug, ci.name, ci.tagline, ci.description,
                             ci.category, coalesce(cv.install_manifest::text,''))) ~ _fin_re;
      IF _bad IS NOT NULL THEN
        RAISE EXCEPTION 'This bundle includes finance/credit content via child item(s) [%] and cannot be a default for new tenants (section 2). Keep the bundle opt-in.', _bad
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ── 2b. §2 AFTER-THE-FACT recheck: a child turning finance can't slip past a
--        bundle that was ALREADY marked default while clean. ────────────────────
-- The guard above only fires on writes to the bundle's OWN row. But a default
-- bundle can be poisoned indirectly: a descendant item is later flipped
-- is_finance=true, or its current_version_id is repointed to a version whose
-- manifest carries finance vocabulary. Re-run the recursive finance walk against
-- EVERY default bundle after any such change and reject the change if it would
-- make a default bundle ship finance/credit content to every new tenant (§2).
CREATE OR REPLACE FUNCTION public._marketplace_default_bundle_finance_violation()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH RECURSIVE dt(root, descend, depth, path) AS (
    SELECT i.slug, c.slug, 1, ARRAY[i.slug]
      FROM public.marketplace_items i
      JOIN public.marketplace_item_versions v ON v.id = i.current_version_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
             COALESCE(v.install_manifest->'bundle_items','[]'::jsonb)) AS c(slug)
     WHERE i.default_for_new_tenants AND i.item_type = 'bundle'
    UNION ALL
    SELECT dt.root, gc.slug, dt.depth + 1, dt.path || dt.descend
      FROM dt
      JOIN public.marketplace_items ci ON ci.slug = dt.descend
      JOIN public.marketplace_item_versions cv ON cv.id = ci.current_version_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
             COALESCE(cv.install_manifest->'bundle_items','[]'::jsonb)) AS gc(slug)
     WHERE dt.depth < 8 AND NOT (gc.slug = ANY (dt.path))
  )
  SELECT string_agg(DISTINCT dt.root, ', ')
    FROM dt
    JOIN public.marketplace_items ci ON ci.slug = dt.descend
    LEFT JOIN public.marketplace_item_versions cv ON cv.id = ci.current_version_id
   WHERE ci.is_finance
      OR lower(concat_ws(' ', ci.slug, ci.name, ci.tagline, ci.description,
                         ci.category, coalesce(cv.install_manifest::text,'')))
         ~ public._marketplace_finance_re();
$function$;
REVOKE ALL ON FUNCTION public._marketplace_default_bundle_finance_violation() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.marketplace_finance_default_recheck()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE _bad text;
BEGIN
  _bad := public._marketplace_default_bundle_finance_violation();
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'This change would make default bundle(s) [%] ship finance/credit content to every new tenant (section 2). Un-default the bundle(s) first, or keep this item opt-in.', _bad
      USING ERRCODE = '22023';
  END IF;
  RETURN NULL;  -- AFTER trigger, statement-level effect only
END $function$;

DROP TRIGGER IF EXISTS trg_mp_items_finance_recheck ON public.marketplace_items;
CREATE TRIGGER trg_mp_items_finance_recheck
  AFTER UPDATE OF is_finance, current_version_id ON public.marketplace_items
  FOR EACH ROW WHEN (
    NEW.is_finance IS DISTINCT FROM OLD.is_finance
    OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id)
  EXECUTE FUNCTION public.marketplace_finance_default_recheck();

DROP TRIGGER IF EXISTS trg_mp_versions_finance_recheck ON public.marketplace_item_versions;
CREATE TRIGGER trg_mp_versions_finance_recheck
  AFTER INSERT OR UPDATE OF install_manifest, status ON public.marketplace_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_finance_default_recheck();

-- ── 3. Internal helper: is a skill still needed by any OTHER active install? ──
-- The cross-install reference guard for skill flags. Excludes _exclude_install
-- (the row being torn down, which the caller has already flipped to 'uninstalled'
-- before calling this, so the status filter alone would suffice — the explicit
-- exclusion is defense in depth).
CREATE OR REPLACE FUNCTION public._marketplace_skill_referenced_elsewhere(
  _tenant_id uuid, _slug text, _exclude_install uuid
) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.marketplace_installs mi
     WHERE mi.tenant_id = _tenant_id
       AND mi.status = 'active'
       AND mi.id <> _exclude_install
       AND (COALESCE(mi.seeded_refs->'skill_slugs','[]'::jsonb) ? _slug)
  );
$function$;
REVOKE ALL ON FUNCTION public._marketplace_skill_referenced_elsewhere(uuid, text, uuid) FROM PUBLIC;

-- ── 4. Internal helper: refcount for a child install (held_directly + bundles) ─
CREATE OR REPLACE FUNCTION public._marketplace_active_bundle_holds(_child_install uuid)
 RETURNS integer
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT COUNT(*)::int
    FROM public.marketplace_install_bundle_links l
    JOIN public.marketplace_installs bi
      ON bi.id = l.bundle_install_id AND bi.status = 'active'
   WHERE l.child_install_id = _child_install;
$function$;
REVOKE ALL ON FUNCTION public._marketplace_active_bundle_holds(uuid) FROM PUBLIC;

-- ── 5. Internal helper: UNCONDITIONAL teardown of one install + cascade ──────
-- Reverses one install's own effects (skills with the cross-install guard, its own
-- KB docs, status, ledger, count), then relinquishes every bundle link where this
-- install is the PARENT and recursively tears down any child whose refcount fell to
-- zero. Marks self 'uninstalled' FIRST so the skill guard and refcount both exclude
-- it and the cascade is order-independent (only ACTIVE holders count).
CREATE OR REPLACE FUNCTION public._marketplace_teardown_install(
  _tenant_id uuid, _install_id uuid
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
BEGIN
  SELECT * INTO _inst FROM public.marketplace_installs WHERE id = _install_id FOR UPDATE;
  IF NOT FOUND OR _inst.status = 'uninstalled' THEN
    RETURN jsonb_build_object('install_id', _install_id, 'torn_down', false);
  END IF;

  -- Flip to uninstalled first: excludes this row from every subsequent guard/count.
  UPDATE public.marketplace_installs
     SET status = 'uninstalled', held_directly = false, uninstalled_at = now()
   WHERE id = _install_id;

  -- Reverse this install's skills, each only if no OTHER active install needs it.
  FOR _slug IN SELECT jsonb_array_elements_text(COALESCE(_inst.seeded_refs->'skill_slugs','[]'::jsonb))
  LOOP
    IF NOT public._marketplace_skill_referenced_elsewhere(_tenant_id, _slug, _install_id) THEN
      PERFORM public.set_tenant_skill(_tenant_id, _slug, false);
      _skills_off := array_append(_skills_off, _slug);
    END IF;
  END LOOP;

  -- Delete exactly the KB docs THIS install owns (chunks cascade).
  FOR _doc IN SELECT (jsonb_array_elements_text(COALESCE(_inst.seeded_refs->'kb_doc_ids','[]'::jsonb)))::uuid
  LOOP
    DELETE FROM public.tenant_knowledge_docs WHERE id = _doc AND tenant_id = _tenant_id;
    IF FOUND THEN _docs_removed := _docs_removed + 1; END IF;
  END LOOP;

  -- §17 per-item uninstall ledger row (all-zero money) + install_count decrement.
  INSERT INTO public.marketplace_install_ledger
    (install_id, item_id, vendor_id, tenant_id, event_type, gross_cents, take_rate_bps, platform_fee_cents, vendor_net_cents)
  SELECT _inst.id, _inst.item_id, i.vendor_id, _tenant_id, 'uninstall', 0, 0, 0, 0
    FROM public.marketplace_items i WHERE i.id = _inst.item_id;
  UPDATE public.marketplace_items
     SET install_count = GREATEST(install_count - 1, 0) WHERE id = _inst.item_id;

  -- Cascade: relinquish every link where this install is the bundle parent, and
  -- tear down any child that now has zero remaining holds.
  FOR _link IN SELECT * FROM public.marketplace_install_bundle_links
                WHERE bundle_install_id = _install_id
  LOOP
    DELETE FROM public.marketplace_install_bundle_links
     WHERE bundle_install_id = _install_id AND child_install_id = _link.child_install_id;

    SELECT * INTO _child FROM public.marketplace_installs WHERE id = _link.child_install_id;
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
    'children', _children);
END $function$;
REVOKE ALL ON FUNCTION public._marketplace_teardown_install(uuid, uuid) FROM PUBLIC;

-- ── 6. Internal helper: recursive install of one node (leaf or bundle) ───────
-- One uniform code path for every node. Applies the node's own manifest.functions
-- skill flags, records exact provenance, writes the install row + ledger, links to
-- its parent bundle (if any), then — if this node is itself a bundle — fans out to
-- each child. Cycle- and depth-guarded via _path. A kb_pack node with no doc ids is
-- created active-but-embedding_pending and flagged deferred_embedding for the edge
-- function (config-only nodes finish fully here). _parent_install_id NULL == the
-- tenant's direct/standalone install (held_directly=true); non-null == fan-out
-- child (held_directly=false, plus a bundle link).
CREATE OR REPLACE FUNCTION public._marketplace_install_node(
  _tenant_id uuid, _item_slug text, _is_owner boolean, _seeded_kb_doc_ids uuid[],
  _installed_by_agent text, _parent_install_id uuid, _path text[]
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
BEGIN
  -- Cycle + depth guard (also catches a bundle that lists itself).
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

  -- §9 per-node visibility — the SAME test as the top level, evaluated for the
  -- installing caller AT EVERY node. A public bundle can NOT drag in a child the
  -- caller can't see.
  --   * Availability (status='listed') is relaxed only for the platform owner
  --     (God may install an unlisted/first-party item).
  --   * The TENANT-SCOPE seam is enforced for EVERYONE, owner included: a
  --     scope='tenant' item installs ONLY into its own visible_to_tenant_id — even
  --     a God install of a public bundle can never fan a child scoped to some OTHER
  --     tenant across the seam (§9 cross-tenant content bleed).
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

  -- ── Already-active row ─────────────────────────────────────────────────────
  IF _was_active THEN
    _pending := COALESCE((_existing.seeded_refs->>'embedding_pending')::boolean, false);

    -- Edge-function finalize: docs are now available for a pending kb_pack install.
    -- NOTE (held_directly is deliberately NOT touched here): the ONLY caller that
    -- supplies doc ids is the marketplace-install edge function completing a
    -- deferred child — its intent is to finish the bundle's child, NOT to assert a
    -- tenant standalone hold. Upgrading held_directly here would wrongly convert a
    -- bundle-only child into a direct hold and defeat the refcount teardown. The
    -- genuine "tenant standalone-installs a still-pending child" case arrives with
    -- NO doc ids, so it falls through to the already_active branch below, which
    -- correctly upgrades held_directly (§13: reversal stays exact).
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

    -- Otherwise a genuine idempotent no-op. NOTE (bundle re-install): an
    -- already-active bundle does NOT re-walk its manifest here, so a bundle whose
    -- current version GAINED a new child is not re-fanned by a plain re-install —
    -- manifest/version changes must route through the update_available path
    -- (a version bump → re-publish → the tenant sees "update available" and
    -- re-installs the new version). Documented, not silent (§13). Two provenance
    -- touch-ups only:
    --  * a direct call on a bundle-only child UPGRADES it to a direct hold, so a
    --    later bundle uninstall won't tear down what the tenant now wants standalone;
    --  * a fan-out onto an already-active child RECORDS the new bundle's hold link.
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

  -- ── Fresh activation (new row, or reactivating uninstalled/disabled) ────────
  FOR _fn IN SELECT * FROM jsonb_array_elements(COALESCE(_ver.install_manifest->'functions','[]'::jsonb))
  LOOP
    _kind := _fn->>'kind';
    IF _kind = 'skill_flag' AND (_fn->>'slug') IS NOT NULL THEN
      PERFORM public.set_tenant_skill(_tenant_id, _fn->>'slug', true);
      _skill_slugs := array_append(_skill_slugs, _fn->>'slug');
    ELSE
      _skipped := _skipped || jsonb_build_array(_fn);
    END IF;
  END LOOP;

  -- Reconcile stray marketplace-tagged docs for this item not in the winning set —
  -- but ONLY when a winning set is actually supplied. A fan-out child (and any
  -- deferred kb_pack install) arrives with EMPTY doc ids; reconciling against the
  -- empty set would delete EVERY marketplace-tagged doc for this item, wiping a
  -- reactivated child's still-embedded docs. When the set is empty we defer the
  -- reconcile to the edge-function FINALIZE branch, which runs it once real doc ids
  -- exist (§13: never destroy embedded knowledge on a no-op path).
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
    'features_keys', '[]'::jsonb,
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
        -- A direct install asserts a direct hold; a fan-out preserves the prior
        -- hold flag (never downgrades a tenant's standalone hold to bundle-only).
        held_directly = CASE WHEN _parent_install_id IS NULL
                             THEN true ELSE public.marketplace_installs.held_directly END,
        installed_by = EXCLUDED.installed_by,
        installed_by_agent = EXCLUDED.installed_by_agent,
        installed_at = now(),
        uninstalled_at = NULL
  RETURNING * INTO _install;

  -- Count only a genuinely-new activation (no prior row, or a prior uninstalled one).
  IF (NOT _had_row) OR _existing.status = 'uninstalled' THEN
    UPDATE public.marketplace_items SET install_count = install_count + 1 WHERE id = _item.id;
  END IF;

  -- §17 per-item install ledger row. A DIRECT install (parent NULL) captures the
  -- sale at the item's own price. A FAN-OUT child (parent NOT NULL) is billed at
  -- ZERO — the tenant made ONE purchase (the top-level bundle), which captured the
  -- money; charging each child its list price too would double-count GMV and
  -- over-credit child vendors. A row is still written per child so per-item install
  -- COUNTS and attribution stay complete; only the money columns are zeroed.
  -- (Paid-bundle vendor revenue-share across children is a Wave 7 / Stripe-Connect
  -- settlement concern — flagged; today every first-party item is free so gross=0.)
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

  -- Record the bundle -> child hold edge.
  IF _parent_install_id IS NOT NULL THEN
    INSERT INTO public.marketplace_install_bundle_links
      (bundle_install_id, child_install_id, tenant_id, child_item_slug)
    VALUES (_parent_install_id, _install.id, _tenant_id, _item.slug)
    ON CONFLICT (bundle_install_id, child_install_id) DO NOTHING;
  END IF;

  -- ── Fan-out: if this node is a bundle, install each child under this install ──
  IF _item.item_type = 'bundle' THEN
    FOR _child_slug IN
      SELECT jsonb_array_elements_text(COALESCE(_ver.install_manifest->'bundle_items','[]'::jsonb))
    LOOP
      -- Children always fan out with empty doc ids: a kb_pack child becomes
      -- embedding_pending and is finalized by the edge function.
      _child_res := public._marketplace_install_node(
        _tenant_id, _child_slug, _is_owner, '{}'::uuid[], _installed_by_agent,
        _install.id, _path || _item.slug);
      _children := _children || jsonb_build_array(_child_res);
      -- This DIRECT child needs embedding → add it (via THIS bundle).
      IF COALESCE((_child_res->>'needs_embedding')::boolean, false) THEN
        _deferred := _deferred || jsonb_build_array(jsonb_build_object(
          'item_slug', _child_res->>'item_slug',
          'install_id', _child_res->>'install_id',
          'via_bundle_install_id', _install.id));
      END IF;
      -- CRITICAL (§13): a child that is ITSELF a bundle carries its own nested
      -- deferrals for its grandchildren. Bubble them up so the top-level flat list
      -- the edge function consumes covers every embedding-pending node at any depth
      -- (each grandchild already carries its own via_bundle_install_id).
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
REVOKE ALL ON FUNCTION public._marketplace_install_node(uuid, text, boolean, uuid[], text, uuid, text[]) FROM PUBLIC;

-- ── 7. Public install RPC (signature preserved) — thin wrapper over the node ─
CREATE OR REPLACE FUNCTION public.install_marketplace_item(
  _tenant_id uuid,
  _item_slug text,
  _seeded_kb_doc_ids uuid[] DEFAULT '{}'::uuid[],
  _installed_by_agent text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _is_owner boolean := public.is_platform_owner();
  _res      jsonb;
  _deferred jsonb;
BEGIN
  -- Authorize the caller against the target tenant — never trust the arg (§9/§13).
  IF NOT (_is_owner OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to install for this tenant' USING ERRCODE = '42501';
  END IF;

  -- ONE tenant-scoped lock serializes the whole (recursive) fan-out and blocks a
  -- concurrent install/uninstall of the same tenant — no per-child lock ordering,
  -- no deadlock when two bundles share a child (see header).
  PERFORM pg_advisory_xact_lock(hashtextextended('mp_install:' || _tenant_id::text, 0));

  _res := public._marketplace_install_node(
    _tenant_id, _item_slug, _is_owner,
    COALESCE(_seeded_kb_doc_ids, '{}'::uuid[]), _installed_by_agent,
    NULL, ARRAY[]::text[]);

  -- Present ONE flat, complete children_deferred_embedding for the edge function:
  -- every embedding-pending node at any depth. The node already aggregated its
  -- descendants; here we ALSO include the TOP node itself when IT is a pending
  -- kb-carrying item (a standalone kb_pack, or a bundle that carries its own
  -- kb_pack — the LOW-2 case), so nothing pending is ever omitted (§13 honesty).
  _deferred := COALESCE(_res->'children_deferred_embedding', '[]'::jsonb);
  IF COALESCE((_res->>'needs_embedding')::boolean, false) THEN
    _deferred := jsonb_build_array(jsonb_build_object(
      'item_slug', _res->>'item_slug',
      'install_id', _res->>'install_id',
      'via_bundle_install_id', NULL))  -- NULL = the tenant's own top-level install
      || _deferred;
  END IF;

  RETURN jsonb_set(_res, '{children_deferred_embedding}', _deferred);
END $function$;
REVOKE ALL ON FUNCTION public.install_marketplace_item(uuid, text, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.install_marketplace_item(uuid, text, uuid[], text) TO authenticated, service_role;

-- ── 8. Public uninstall RPC — release the direct hold, tear down iff refcount 0 ─
CREATE OR REPLACE FUNCTION public.uninstall_marketplace_item(
  _tenant_id uuid,
  _item_slug text
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _item    public.marketplace_items%ROWTYPE;
  _install public.marketplace_installs%ROWTYPE;
  _holds   integer;
  _td      jsonb;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to uninstall for this tenant' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mp_install:' || _tenant_id::text, 0));

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO _install FROM public.marketplace_installs
   WHERE tenant_id = _tenant_id AND item_id = _item.id;
  IF NOT FOUND OR _install.status = 'uninstalled' THEN
    RETURN jsonb_build_object('ok', true, 'was_installed', false, 'item_slug', _item.slug);
  END IF;

  -- Release the tenant's DIRECT hold. If any active bundle still holds this item,
  -- its effects are still needed — retain them (do NOT tear down). This is the
  -- reference count in action: a standalone uninstall of a shared child keeps the
  -- child alive for the bundle, and vice-versa.
  UPDATE public.marketplace_installs SET held_directly = false WHERE id = _install.id;
  _holds := public._marketplace_active_bundle_holds(_install.id);

  IF _holds > 0 THEN
    RETURN jsonb_build_object(
      'ok', true, 'was_installed', true, 'item_slug', _item.slug,
      'retained', true, 'bundle_holds', _holds,
      'retained_reason', format('effects retained: still held by %s active bundle(s)', _holds),
      'skills_disabled', '[]'::jsonb, 'kb_docs_removed', 0);
  END IF;

  _td := public._marketplace_teardown_install(_tenant_id, _install.id);
  RETURN jsonb_build_object(
    'ok', true, 'was_installed', true, 'item_slug', _item.slug,
    'retained', false,
    'skills_disabled', COALESCE(_td->'skills_disabled','[]'::jsonb),
    'kb_docs_removed', COALESCE((_td->>'kb_docs_removed')::int, 0),
    'children_torn_down', COALESCE(_td->'children','[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.uninstall_marketplace_item(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uninstall_marketplace_item(uuid, text) TO authenticated, service_role;

-- ── 9. §10 Paige read seam: the live reference count for an install ─────────
CREATE OR REPLACE FUNCTION public.marketplace_install_refcount(
  _tenant_id uuid, _item_slug text
) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _install public.marketplace_installs%ROWTYPE; _holds int; _bundles jsonb;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to read this tenant''s installs' USING ERRCODE = '42501';
  END IF;
  SELECT mi.* INTO _install FROM public.marketplace_installs mi
    JOIN public.marketplace_items i ON i.id = mi.item_id
   WHERE mi.tenant_id = _tenant_id AND i.slug = _item_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('installed', false, 'item_slug', _item_slug);
  END IF;
  _holds := public._marketplace_active_bundle_holds(_install.id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bundle_install_id', l.bundle_install_id, 'bundle_slug', bi_item.slug)), '[]'::jsonb)
    INTO _bundles
    FROM public.marketplace_install_bundle_links l
    JOIN public.marketplace_installs bi ON bi.id = l.bundle_install_id AND bi.status = 'active'
    JOIN public.marketplace_items bi_item ON bi_item.id = bi.item_id
   WHERE l.child_install_id = _install.id;
  RETURN jsonb_build_object(
    'installed', _install.status = 'active',
    'item_slug', _item_slug,
    'status', _install.status,
    'held_directly', _install.held_directly,
    'active_bundle_holds', _holds,
    'refcount', (CASE WHEN _install.held_directly THEN 1 ELSE 0 END) + _holds,
    'held_by_bundles', _bundles,
    'embedding_pending', COALESCE((_install.seeded_refs->>'embedding_pending')::boolean, false));
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_install_refcount(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_install_refcount(uuid, text) TO authenticated, service_role;

-- ── 10. EDGE-FUNCTION CONTRACT (marketplace-install) — follow-up, not this file ─
-- For a bundle whose install receipt returns children_deferred_embedding = [ {
-- item_slug, install_id, via_bundle_install_id }, ... ], the edge function MUST,
-- for EACH deferred child:
--   1. Embed that child's kb_pack docs (Voyage) into tenant_knowledge_docs, tagged
--      'marketplace:<child_slug>' (the existing kb-ingest path).
--   2. Call install_marketplace_item(_tenant, <child_slug>, <new_doc_ids>, <agent>).
--      The child row already exists (active, embedding_pending=true) and is already
--      linked to the bundle, so this call takes the FINALIZE branch: it fills
--      kb_doc_ids, clears embedding_pending, reconciles orphans, and does NOT change
--      held_directly, re-ledger, or re-count. It must pass the child_slug (NOT the
--      bundle slug) so the finalize targets the child row.
-- A pure config-only bundle (no kb_pack anywhere) returns children_deferred_embedding
-- = [] and needs no edge follow-up. §13: the receipt already told the truth about
-- which children are live vs pending — the edge function closes the pending set.

COMMIT;