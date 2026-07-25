-- ═══════════════════════════════════════════════════════════════════════════════
-- Hotfix 2 (§2 funding-toggle bug) — uninstall clears an ORPHAN skill gate.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- THE BUG
-- -------
-- Marketplace toggle-off calls uninstall_marketplace_item(_tenant_id,_item_slug).
-- That RPC only ever turns a skill OFF as a side-effect of tearing down an INSTALL
-- ROW: _marketplace_teardown_install reads the slugs to disable from
-- _inst.seeded_refs->'skill_slugs' — a field on the install row
-- (20260714330000_marketplace_bundle_refcount.sql:296-302). But the funding skill
-- is (correctly, per §2) enabled WITHOUT a marketplace install — via a Playbook /
-- preset / a direct set_tenant_skill write into tenants.features->'enabled_skills'.
-- So for funding there is NO install row. The RPC hits its "no install" branch
-- (20260714330000:709-711 and the 3-arg mirror 20260714235406:181-183), returns
-- {ok:true, was_installed:false} and NEVER touches enabled_skills. The gate stays on,
-- the UI (Marketplace.tsx:159-162 reads enabled_skills) correctly keeps the switch ON,
-- yet the toast lied "switched off" (Marketplace.tsx:241, §13 dishonesty). Toggling
-- funding off did nothing.
--
-- THE FIX (this migration = PART 1; the UI honesty fix in Marketplace.tsx = PART 2)
-- --------------------------------------------------------------------------------
-- Add a FALLBACK to BOTH uninstall overloads' "no active install" branch: resolve the
-- skill slug(s) this item would toggle from the item's published manifest, and — when
-- safe — clear them from enabled_skills, reporting the TRUTH about what happened.
--
-- ITEM → SKILL-SLUG MAPPING (there is NO skill_slug column; the mapping lives in the
-- version manifest — this is exactly how INSTALL resolves it, 20260714330000:499-508):
--     marketplace_items(slug=_item_slug).current_version_id
--       -> marketplace_item_versions.install_manifest->'functions'[ kind='skill_flag' ]->>'slug'
-- For the funding seed (20260714270000:273-275) that manifest is
-- {"functions":[{"kind":"skill_flag","slug":"funding"}]} — so item slug 'funding' maps
-- to skill slug 'funding'. We resolve via the manifest (NOT by assuming item==skill),
-- and it works with no install row because it reads the item/version, not the install.
--
-- GUARDS (§13 honesty — never claim a clear we didn't/can't make):
--   (a) BUNDLE-REFERENCED — if another ACTIVE install still provides this skill via its
--       seeded_refs->'skill_slugs', clearing enabled_skills would wrongly kill a skill a
--       live bundle/install still needs. We reuse the existing detector
--       _marketplace_skill_referenced_elsewhere (20260714330000:238-250), excluding
--       NOTHING (nil uuid — there is no funding install row to exclude; NULL would null
--       out the `id <> _exclude` compare and silently match zero rows). If referenced →
--       RETAIN, do not clear.
--   (b) PLAYBOOK-LOCKED-ON — the funding gate (20260710060000:84-90) is ON if ANY of
--       paige_funding_skill='true' | playbook='funding' | playbook_config->>'slug'='funding'
--       | enabled_skills @> ["funding"]. set_tenant_skill only rewrites enabled_skills;
--       it does NOT touch the three playbook keys. So if the gate is locked on by a
--       playbook key, pruning enabled_skills would NOT turn funding off — we must NOT
--       claim it was cleared. We RETAIN with an honest retained_reason. (Turning a
--       playbook off is a heavier, separate decision — a playbook is not a marketplace
--       skill toggle.)
--
-- WHY WE INLINE THE enabled_skills REWRITE INSTEAD OF CALLING set_tenant_skill (§18):
--   set_tenant_skill is the canonical enabled_skills toggle and normally we would reuse
--   it. But it is SECURITY DEFINER and RE-CHECKS auth as
--   `is_platform_owner() OR is_tenant_admin(_tenant_id)` (20260710060000:15-17) — BOTH
--   auth.uid()-based. The 3-arg actor overload runs under SERVICE_ROLE with NO JWT, so
--   auth.uid() is NULL and BOTH predicates are FALSE → set_tenant_skill would RAISE
--   'not authorized' and break the paige-mcp path. The uninstall RPCs have ALREADY
--   authorized the caller at their top (2-arg: is_platform_owner OR is_tenant_admin;
--   3-arg: service-role + is_tenant_admin_as(actor)). So the shared helper below
--   re-checks NOTHING and inlines the EXACT DISTINCT-filter rewrite set_tenant_skill
--   performs (20260710060000:22-36). This keeps BOTH overloads behaviorally identical
--   (§37 producer parity) and auth-context-agnostic.
--
-- RETURN CONTRACT — ADDITIVE ONLY (§37): every existing key is preserved
-- (ok, was_installed, item_slug, retained, bundle_holds, retained_reason,
-- skills_disabled, kb_docs_removed, children_torn_down). We ADD was_gate_cleared
-- (true ONLY when enabled_skills actually changed AND the gate is now off), plus
-- matched_skill_slugs for audit. The "no install" branch now also carries
-- retained/retained_reason/skills_disabled when the fallback ran.
--
-- SCOPE: MECHANISM ONLY. No data cleanup — funding stays ON for the real tenants
-- (MMA, Antonio Daniel LLC). This migration changes how toggle-off behaves; it does
-- not flip anyone's current funding state.
--
-- Preserves for both overloads: §9 auth, pg_advisory_xact_lock, SECURITY DEFINER,
-- SET search_path='public', and the exact REVOKE/GRANT grants.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Shared internal helper: clear an ORPHAN skill gate (no install row) ─────
-- Caller MUST have already authorized (both uninstall overloads do). This function
-- deliberately performs NO auth check and NEVER calls set_tenant_skill (see header).
CREATE OR REPLACE FUNCTION public._marketplace_clear_orphan_skills(
  _tenant_id uuid,
  _item_slug text
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _slugs        text[];
  _slug         text;
  _feats        jsonb;
  _cleared      text[] := '{}';
  _reasons      text[] := '{}';
  _gate_cleared boolean := false;
  _in_enabled   boolean;
  _bundle_ref   boolean;
  _pb_locked    boolean;
  _new_skills   jsonb;
  _any_retained boolean := false;
BEGIN
  -- Resolve the skill slugs THIS item's CURRENT published version would toggle,
  -- from the manifest (same source install uses). Works with no install row.
  SELECT array_agg(DISTINCT f->>'slug')
    INTO _slugs
    FROM public.marketplace_items i
    JOIN public.marketplace_item_versions v ON v.id = i.current_version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(v.install_manifest->'functions', '[]'::jsonb)) AS f
   WHERE i.slug = _item_slug
     AND f->>'kind' = 'skill_flag'
     AND (f->>'slug') IS NOT NULL;

  IF _slugs IS NULL OR array_length(_slugs, 1) IS NULL THEN
    -- Item maps to no skill flags (e.g. a kb_pack/skin, or an unpublished item) →
    -- nothing to clear. Honest empty result.
    RETURN jsonb_build_object(
      'matched_skill_slugs', '[]'::jsonb,
      'skills_cleared',      '[]'::jsonb,
      'was_gate_cleared',    false,
      'retained',            false,
      'retained_reason',     NULL);
  END IF;

  SELECT COALESCE(t.features, '{}'::jsonb) INTO _feats
    FROM public.tenants t WHERE t.id = _tenant_id;

  FOREACH _slug IN ARRAY _slugs LOOP
    _in_enabled := (COALESCE(_feats->'enabled_skills', '[]'::jsonb) @> to_jsonb(_slug));

    -- Guard (a): still provided by another ACTIVE install? Exclude nothing (nil uuid).
    _bundle_ref := public._marketplace_skill_referenced_elsewhere(
                     _tenant_id, _slug, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Guard (b): funding gate locked ON by a playbook/preset key (NOT enabled_skills).
    _pb_locked := (_slug = 'funding') AND (
           (_feats->>'paige_funding_skill') = 'true'
        OR (_feats->>'playbook') = 'funding'
        OR (_feats->'playbook_config'->>'slug') = 'funding');

    IF _bundle_ref THEN
      _any_retained := true;
      -- Reason is a bare CLAUSE — the UI prepends "<Item name> stays on — ", so we
      -- must NOT repeat the verb or leak the raw skill slug into tenant-facing copy
      -- (§3/§11). Single-slug items (funding) yield one clean clause.
      _reasons := array_append(_reasons,
        'another add-on you have installed still provides it');
    ELSIF _pb_locked THEN
      _any_retained := true;
      _reasons := array_append(_reasons,
        'it''s included with your Funding playbook');
    ELSIF _in_enabled THEN
      -- Inline set_tenant_skill(_tenant_id,_slug,false): rebuild enabled_skills w/o _slug.
      SELECT COALESCE(
               (SELECT jsonb_agg(DISTINCT val)
                  FROM jsonb_array_elements_text(
                    COALESCE(_feats->'enabled_skills', '[]'::jsonb)) AS val
                 WHERE val <> _slug),
               '[]'::jsonb)
        INTO _new_skills;
      UPDATE public.tenants
         SET features = COALESCE(features, '{}'::jsonb)
                        || jsonb_build_object('enabled_skills', _new_skills)
       WHERE id = _tenant_id;
      -- Reflect the write locally so a second slug in this loop sees the update.
      _feats := jsonb_set(COALESCE(_feats, '{}'::jsonb), '{enabled_skills}', _new_skills);
      _cleared := array_append(_cleared, _slug);
      -- Removed from enabled_skills AND (guard-b already false here) → gate is now off.
      _gate_cleared := true;
    ELSE
      -- Not in enabled_skills, not held elsewhere, not playbook-locked → nothing to do.
      NULL;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'matched_skill_slugs', to_jsonb(_slugs),
    'skills_cleared',      to_jsonb(_cleared),
    'was_gate_cleared',    _gate_cleared,
    'retained',            _any_retained,
    'retained_reason',     CASE WHEN array_length(_reasons, 1) IS NOT NULL
                                THEN array_to_string(_reasons, '; ') ELSE NULL END);
END $function$;
REVOKE ALL ON FUNCTION public._marketplace_clear_orphan_skills(uuid, text) FROM PUBLIC;
-- Internal helper only; invoked by the SECURITY DEFINER overloads below. No GRANT.

-- ── 2. 2-arg overload (authenticated caller) — add the orphan-clear fallback ────
-- Verbatim body of 20260714330000:684-737; ONLY the "no install" branch changes.
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
  _orphan  jsonb;
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
    -- HOTFIX 2: no install to tear down → attempt the orphan skill-gate clear.
    _orphan := public._marketplace_clear_orphan_skills(_tenant_id, _item.slug);
    RETURN jsonb_build_object('ok', true, 'was_installed', false, 'item_slug', _item.slug)
        || jsonb_build_object(
             'was_gate_cleared',    (_orphan->>'was_gate_cleared')::boolean,
             'skills_disabled',     COALESCE(_orphan->'skills_cleared', '[]'::jsonb),
             'retained',            (_orphan->>'retained')::boolean,
             'retained_reason',     _orphan->>'retained_reason',
             'matched_skill_slugs', COALESCE(_orphan->'matched_skill_slugs', '[]'::jsonb));
  END IF;

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
    'skills_disabled', COALESCE(_td->'skills_disabled', '[]'::jsonb),
    'kb_docs_removed', COALESCE((_td->>'kb_docs_removed')::int, 0),
    'children_torn_down', COALESCE(_td->'children', '[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.uninstall_marketplace_item(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uninstall_marketplace_item(uuid, text) TO authenticated, service_role;

-- ── 3. 3-arg actor overload (service-role) — SAME fallback, kept in lockstep ────
-- §37 parity: paige-mcp (paige-mcp/index.ts:4413) calls THIS overload. If only the
-- 2-arg were patched, the MCP path would silently keep the old broken behavior.
-- Verbatim body of 20260714235406:152-203; ONLY the "no install" branch changes.
CREATE OR REPLACE FUNCTION public.uninstall_marketplace_item(
  _tenant_id uuid,
  _item_slug text,
  _actor_user_id uuid
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _item    public.marketplace_items%ROWTYPE;
  _install public.marketplace_installs%ROWTYPE;
  _holds   integer;
  _td      jsonb;
  _orphan  jsonb;
BEGIN
  IF NOT public._marketplace_is_service_role() THEN
    RAISE EXCEPTION 'service-role required for actor-scoped marketplace overload' USING ERRCODE = '42501';
  END IF;
  IF _actor_user_id IS NULL OR NOT public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'actor is not an admin of this tenant' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mp_install:' || _tenant_id::text, 0));

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO _install FROM public.marketplace_installs
   WHERE tenant_id = _tenant_id AND item_id = _item.id;
  IF NOT FOUND OR _install.status = 'uninstalled' THEN
    -- HOTFIX 2: mirror the 2-arg fallback exactly (the helper is auth-context-agnostic,
    -- which is why we inline the rewrite instead of calling set_tenant_skill under
    -- service-role — see header).
    _orphan := public._marketplace_clear_orphan_skills(_tenant_id, _item.slug);
    RETURN jsonb_build_object('ok', true, 'was_installed', false, 'item_slug', _item.slug)
        || jsonb_build_object(
             'was_gate_cleared',    (_orphan->>'was_gate_cleared')::boolean,
             'skills_disabled',     COALESCE(_orphan->'skills_cleared', '[]'::jsonb),
             'retained',            (_orphan->>'retained')::boolean,
             'retained_reason',     _orphan->>'retained_reason',
             'matched_skill_slugs', COALESCE(_orphan->'matched_skill_slugs', '[]'::jsonb));
  END IF;

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
    'skills_disabled', COALESCE(_td->'skills_disabled', '[]'::jsonb),
    'kb_docs_removed', COALESCE((_td->>'kb_docs_removed')::int, 0),
    'children_torn_down', COALESCE(_td->'children', '[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.uninstall_marketplace_item(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uninstall_marketplace_item(uuid, text, uuid) TO service_role;
