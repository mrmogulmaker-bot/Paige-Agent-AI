-- ============================================================================
-- Marketplace Wave 4 — paige-mcp ACTOR SEAM (service-role explicit-actor overloads)
--
-- WHY THIS EXISTS
-- paige-ai-chat drives the marketplace with the CALLER'S GoTrue JWT, so the
-- tenant-facing RPCs (marketplace_catalog_for_tenant / install_marketplace_item /
-- uninstall_marketplace_item / marketplace_install_refcount) authorize natively on
-- is_tenant_admin(_tenant) → auth.uid(). paige-mcp has NO such JWT: it resolves the
-- actor from an ActorCtx (platform API key or an opaque Paige OAuth token) and calls
-- Postgres with the SERVICE-ROLE client, where auth.uid() is NULL. A naive call to
-- the base RPCs therefore 42501s, and a naive service-role bypass would be a §9 IDOR
-- hole (any actor acting on any tenant).
--
-- THE FIX (defense in depth, §9/§13 — extend, never rebuild §12)
-- Add explicit-actor OVERLOADS (distinct signatures — trailing `_actor_user_id uuid`)
-- that ONLY a service-role caller can reach, and that RE-VERIFY the passed actor is a
-- tenant admin of _tenant_id INSIDE the function. Two independent locks on every
-- overload:
--   (1) GRANT EXECUTE TO service_role ONLY (never authenticated) — an authenticated
--       JWT user can't even reach an overload to smuggle someone else's admin id.
--   (2) A runtime `_marketplace_is_service_role()` gate PLUS
--       `is_tenant_admin_as(_actor_user_id, _tenant_id)` — the actor is authorized,
--       never trusted, against the SAME _tenant_id.
-- The base auth.uid() functions are left UNTOUCHED, so paige-ai-chat's caller-JWT
-- path is unaffected. No table/column/enum changes.
--
-- LIMITATION (documented honestly, §13): the install/uninstall/refcount overloads
-- reuse the existing SECURITY DEFINER helpers (_marketplace_install_node etc.), which
-- still read auth.uid() for the agency-SCOPE visibility branch and the installed_by
-- column. Under the service overload auth.uid() is NULL, so an AGENCY-scoped item is
-- not installable through this seam. Today's marketplace is public, free, first-party
-- items only, so this branch is never exercised; making the node helper actor-aware is
-- deferred to when agency-scoped items ship. The catalog overload DOES swap auth.uid()
-- → _actor_user_id in its own visibility branch (it inlines its body), so reads are
-- correct for agency items.
-- ============================================================================

-- ── 0. Explicit-actor twin of is_tenant_admin (keyed on _actor, not auth.uid) ──
-- Exact mirror of is_tenant_admin (20260629175341...:144): owner/admin membership,
-- active, of _tenant — evaluated for an EXPLICIT actor so a service-role caller can
-- re-verify a resolved actor. service_role-only; never reachable by authenticated.
CREATE OR REPLACE FUNCTION public.is_tenant_admin_as(_actor uuid, _tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
     WHERE tenant_id = _tenant AND user_id = _actor
       AND status = 'active' AND role IN ('owner','admin')
  );
$$;
REVOKE ALL ON FUNCTION public.is_tenant_admin_as(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin_as(uuid, uuid) TO service_role;

-- ── 1. Catalog read overload — explicit actor, service-role-gated ──────────────
-- Mirrors marketplace_catalog_for_tenant(_tenant_id) (20260714310000...:15) with the
-- gate swapped to the two-lock (service-role + actor-admin) and auth.uid() replaced by
-- _actor_user_id in the agency-visibility branch. current_user_tenant_id() is NOT
-- relied on (NULL under service role) — admin membership is proven by is_tenant_admin_as.
CREATE OR REPLACE FUNCTION public.marketplace_catalog_for_tenant(_tenant_id uuid, _actor_user_id uuid)
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
  IF NOT public._marketplace_is_service_role() THEN
    RAISE EXCEPTION 'service-role required for actor-scoped marketplace overload' USING ERRCODE = '42501';
  END IF;
  IF _actor_user_id IS NULL OR NOT public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'actor is not an admin of this tenant' USING ERRCODE = '42501';
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
  WHERE i.status = 'listed' AND (
          i.scope = 'public'
          OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
          OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, _actor_user_id) IS NOT NULL)
        )
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) TO service_role;

-- ── 2. Install overload — explicit actor, service-role-gated ───────────────────
-- Mirrors install_marketplace_item(_tenant_id,_item_slug,_seeded_kb_doc_ids,
-- _installed_by_agent) (20260714330000...:636) verbatim (advisory lock + recursive
-- fan-out via _marketplace_install_node + deferred-embedding assembly), with the
-- caller-authz IF-block swapped for the two-lock gate. _is_owner resolves to false
-- under service role (auth.uid() NULL), so the actor gets normal tenant-admin
-- semantics — exactly what they could do through their own JWT.
CREATE OR REPLACE FUNCTION public.install_marketplace_item(
  _tenant_id uuid,
  _item_slug text,
  _seeded_kb_doc_ids uuid[],
  _installed_by_agent text,
  _actor_user_id uuid
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _is_owner boolean := public.is_platform_owner();  -- false under service role
  _res      jsonb;
  _deferred jsonb;
BEGIN
  IF NOT public._marketplace_is_service_role() THEN
    RAISE EXCEPTION 'service-role required for actor-scoped marketplace overload' USING ERRCODE = '42501';
  END IF;
  IF _actor_user_id IS NULL OR NOT public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'actor is not an admin of this tenant' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mp_install:' || _tenant_id::text, 0));

  _res := public._marketplace_install_node(
    _tenant_id, _item_slug, _is_owner,
    COALESCE(_seeded_kb_doc_ids, '{}'::uuid[]), _installed_by_agent,
    NULL, ARRAY[]::text[]);

  _deferred := COALESCE(_res->'children_deferred_embedding', '[]'::jsonb);
  IF COALESCE((_res->>'needs_embedding')::boolean, false) THEN
    _deferred := jsonb_build_array(jsonb_build_object(
      'item_slug', _res->>'item_slug',
      'install_id', _res->>'install_id',
      'via_bundle_install_id', NULL))
      || _deferred;
  END IF;

  RETURN jsonb_set(_res, '{children_deferred_embedding}', _deferred);
END $function$;
REVOKE ALL ON FUNCTION public.install_marketplace_item(uuid, text, uuid[], text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.install_marketplace_item(uuid, text, uuid[], text, uuid) TO service_role;

-- ── 3. Uninstall overload — explicit actor, service-role-gated ─────────────────
-- Mirrors uninstall_marketplace_item(_tenant_id,_item_slug) (20260714330000...:684)
-- verbatim (release direct hold; tear down iff refcount 0), authz → two-lock gate.
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
    RETURN jsonb_build_object('ok', true, 'was_installed', false, 'item_slug', _item.slug);
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
    'skills_disabled', COALESCE(_td->'skills_disabled','[]'::jsonb),
    'kb_docs_removed', COALESCE((_td->>'kb_docs_removed')::int, 0),
    'children_torn_down', COALESCE(_td->'children','[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.uninstall_marketplace_item(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uninstall_marketplace_item(uuid, text, uuid) TO service_role;

-- ── 4. Refcount overload — explicit actor, service-role-gated ──────────────────
-- Mirrors marketplace_install_refcount(_tenant_id,_item_slug) (20260714330000...:740)
-- verbatim, authz → two-lock gate.
CREATE OR REPLACE FUNCTION public.marketplace_install_refcount(
  _tenant_id uuid, _item_slug text, _actor_user_id uuid
) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _install public.marketplace_installs%ROWTYPE; _holds int; _bundles jsonb;
BEGIN
  IF NOT public._marketplace_is_service_role() THEN
    RAISE EXCEPTION 'service-role required for actor-scoped marketplace overload' USING ERRCODE = '42501';
  END IF;
  IF _actor_user_id IS NULL OR NOT public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'actor is not an admin of this tenant' USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION public.marketplace_install_refcount(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_install_refcount(uuid, text, uuid) TO service_role;
