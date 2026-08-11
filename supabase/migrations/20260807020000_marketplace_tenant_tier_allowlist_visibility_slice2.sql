-- ============================================================================
-- Wave 3.9 SLICE 2 — tenant-side agency-curation ALLOWLIST visibility branch
-- (#277; §55/§18/§9/§51/§37/§32/§39)
--
-- WHAT: completes the marketplace visibility filter that Slice 0
--   (20260805170000) shipped with the agency-curation branch DEFERRED as a
--   commented placeholder. Slice 0 gates every catalog read by cascading TIER +
--   installer ROLE + publish lifecycle. This slice adds the ONE remaining branch:
--   a SUB-ACCOUNT also sees an item its PARENT AGENCY explicitly curated in for
--   its sub-accounts (a public.agency_item_allowlist row, enabled_for_subaccounts
--   = true — the table Slice 1 / 20260805230000 created and this depends on).
--
-- DEPENDS ON SLICE 1 (hard, §13). This migration references
--   public.agency_item_allowlist (Slice 1, 20260805230000, LIVE on prod). Its
--   timestamp (20260807020000) is AFTER Slice 1's, and _mp_curated_in is
--   LANGUAGE sql so Postgres validates the table reference AT CREATE TIME — if ever
--   applied before Slice 1 exists it FAILS LOUDLY (relation does not exist), the
--   SAFE §32 failure (nothing half-applies), never a silent miss.
--
-- §18 FOUR-QUESTION GATE (grounded):
--   (1) GREPPED: mp_items_read + both marketplace_catalog_for_tenant overloads +
--       _mp_tier_cascade_keys + current_tenant_tier + _mp_caller_role_keys in the
--       Slice 0 substrate (20260805170000) — the ONE home of the visibility filter;
--       public.agency_item_allowlist DDL (Slice 1, 20260805230000).
--   (2) SIBLINGS: Slice 0 filter (tier/role/publish/scope); Slice 1 curation table +
--       its agency_curation_catalog read (the AGENCY-side shelf). This slice is the
--       TENANT-side (sub-account) consumption of that same curation.
--   (3) WHY EXTEND: adds ONE OR-branch to the SAME policy + the SAME two RPC
--       overloads. Not a new surface/table/picker. Slice 0 left an explicit
--       placeholder for exactly this branch (§55-deferred).
--   (4) TYPE/SHAPE DECISION server-side (RLS + SECURITY DEFINER resolvers derive
--       tenant/tier/role/parent-agency); no caller passes tier/role/"show curated".
--
-- THE FULL RULE. An item is visible to a NON-owner caller IFF status='listed' AND
--   publish_status='approved' AND (installer-role gate) AND (
--       ( available_to_tiers ?| cascade(current_tenant_tier) AND §9-scope )  -- NORMAL
--     OR _mp_curated_in(item, caller_tenant)                                 -- CURATED
--   ). Role+approved+listed bind BOTH paths (AND-ed above the disjunction). Tier
--   binds ONLY the normal path — curation is tier-INDEPENDENT by design (an
--   Academy/Enterprise agency hands a SPECIFIC item to a Solo sub-account it could
--   not otherwise see, §17 growth atom). It never elevates the sub-account's tier —
--   only the curated item is granted. Layer-2 (§51): the sub-account resolves its
--   OWN tier via current_tenant_tier() (zero parent bleed).
--
-- §39 PEER-GATE SHOULD-FIX FOLDED IN (§9): the curated branch DELIBERATELY bypasses
--   the normal §9 scope gate (that is how a curated item reaches a sub-account whose
--   own scope would hide it). But Slice 1's set_agency_item_allowlist RPC does NOT
--   validate that the curated item is even visible to the agency — so a rogue
--   allowlist row for an item scoped to an UNRELATED tenant/agency would, under a
--   naive curated branch, leak that item to the agency's sub-accounts. _mp_curated_in
--   therefore folds a scope check bound to the GOVERNING AGENCY: a curated grant may
--   only reveal an item that is public, or tenant-scoped to the governing agency, or
--   agency-scoped to the governing agency. Proven below (a cross-tenant-scoped curated
--   item stays HIDDEN from the sub-account).
--
-- §39 PEER NOTE (why _mp_curated_in is SECURITY DEFINER): the RLS read runs in the
--   CALLER's context; inlining an agency_item_allowlist EXISTS would hit that table's
--   OWN RLS and could wrongly return FALSE for a sub-account. A SECURITY DEFINER
--   helper returns a bare boolean (no row contents leak) so the decision is correct
--   regardless of the curation table's RLS. Not an IDOR: it answers only "is this
--   item curated-in for this tenant's governing agency" — no data returned.
--
-- §32.b PROVEN pre-push (real authenticated jwt.claims + SECURITY DEFINER unit calls,
--   self-aborting BEGIN..ROLLBACK on prod xygzykjyynhzqytbqnzu, real Slice 1 table):
--   Solo sub-account under an Academy agency → curated Academy item enabled=TRUE
--   becomes visible (count = solo_count+1, item present), FALSE/absent stays hidden,
--   NO bleed to other un-curated Academy items; a cross-tenant-scoped curated item
--   stays HIDDEN (scope-fold); Solo standalone → Solo only; Academy agency owner →
--   Academy+Solo (normal path); no-parent tenant → curated always FALSE. Outputs in PR.
-- ============================================================================

BEGIN;

-- ── 1. Curated-in resolver — the ONE home (§12) for the agency-curation branch ──
-- TRUE iff _tenant_id is a SUB-ACCOUNT (parent is an agency/enterprise) AND its
-- governing agency has an enabled allowlist row for _item_id AND that item is itself
-- legitimately visible to the governing agency (§9 scope-fold). Standalone/agency
-- callers have no governing-agency row → the LATERAL yields no row → FALSE (fail-safe).
CREATE OR REPLACE FUNCTION public._mp_curated_in(
  _item_id   uuid,
  _tenant_id uuid DEFAULT public.current_user_tenant_id()
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_item_allowlist a
    JOIN public.marketplace_items    i ON i.id = a.marketplace_item_id
    JOIN LATERAL (
      -- governing agency of _tenant_id, ONLY when _tenant is a sub-account of an
      -- agency/enterprise (mirrors the _mp_caller_role_keys parent pattern, Slice 0).
      SELECT par.id AS agency_id
      FROM public.tenants t
      JOIN public.tenants par ON par.id = t.parent_tenant_id
      WHERE t.id = _tenant_id
        AND par.account_type IN ('agency','enterprise')
    ) g ON true
    WHERE a.marketplace_item_id     = _item_id
      AND a.enabled_for_subaccounts = true
      AND a.agency_tenant_id        = g.agency_id
      -- §9 SCOPE-FOLD (§39 SHOULD-FIX): the curated item must be legitimately visible
      -- to the GOVERNING AGENCY — curation cannot reveal an item scoped to some OTHER
      -- tenant/agency (Slice 1's write RPC does not validate item scope).
      AND (
           i.scope = 'public'
        OR (i.scope = 'tenant' AND i.visible_to_tenant_id = g.agency_id)
        OR (i.scope = 'agency' AND i.visible_to_agency_id = g.agency_id)
      )
  );
$$;
REVOKE ALL ON FUNCTION public._mp_curated_in(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._mp_curated_in(uuid, uuid) TO authenticated, service_role;

-- ── 2. READ RLS — add the curated OR-branch (replaces Slice 0's placeholder) ─────
-- Role + publish + listed gates UNCHANGED and bind BOTH paths. Tier now gates ONLY
-- the normal path; §9 scope PRESERVED verbatim inside the normal path.
DROP POLICY IF EXISTS mp_items_read ON public.marketplace_items;
CREATE POLICY mp_items_read ON public.marketplace_items
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (
      status = 'listed'
      AND publish_status = 'approved'
      AND installable_by_role ?| public._mp_caller_role_keys()
      AND (
        (
          available_to_tiers ?| public._mp_tier_cascade_keys(public.current_tenant_tier())
          AND (
               scope = 'public'
            OR (scope = 'tenant' AND visible_to_tenant_id = public.current_user_tenant_id())
            OR (scope = 'agency' AND public.agency_team_role(visible_to_agency_id, auth.uid()) IS NOT NULL)
          )
        )
        OR public._mp_curated_in(id, public.current_user_tenant_id())
      )
    )
  );

-- ── 3. Browse-RPC parity — IDENTICAL branch on BOTH overloads (§37 consumer) ──────
-- The catalog RPCs are SECURITY DEFINER (bypass table RLS), so they MUST carry the
-- same curated OR-branch or they would HIDE curated items the direct read now shows.
-- Response contract (RETURNS TABLE) UNCHANGED — rows only widened by the curated grant.
CREATE OR REPLACE FUNCTION public.marketplace_catalog_for_tenant(_tenant_id uuid)
 RETURNS TABLE (
   slug text, item_type public.marketplace_item_type, name text, tagline text,
   description text, category text, icon text, pricing_model text, price_cents integer,
   requires_embedding boolean, installed boolean, install_status text, version text
 )
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_platform_owner()
    OR public.is_tenant_admin(_tenant_id)
    OR _tenant_id = public.current_user_tenant_id()
  ) THEN
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
     OR (i.status = 'listed'
         AND i.publish_status = 'approved'
         AND i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, auth.uid())
         AND (
              (
                i.available_to_tiers ?| public._mp_tier_cascade_keys(public.current_tenant_tier(_tenant_id))
                AND (
                     i.scope = 'public'
                     OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
                     OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, auth.uid()) IS NOT NULL)
                   )
              )
              OR public._mp_curated_in(i.id, _tenant_id)
            ))
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid) TO authenticated, service_role;

-- Service-role, actor-scoped overload (Paige's headless agent). tier by _tenant_id,
-- role/agency by _actor_user_id, curated by _tenant_id — NEVER read from request input.
CREATE OR REPLACE FUNCTION public.marketplace_catalog_for_tenant(_tenant_id uuid, _actor_user_id uuid)
 RETURNS TABLE (
   slug text, item_type public.marketplace_item_type, name text, tagline text,
   description text, category text, icon text, pricing_model text, price_cents integer,
   requires_embedding boolean, installed boolean, install_status text, version text
 )
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  WHERE i.status = 'listed'
    AND i.publish_status = 'approved'
    AND i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, _actor_user_id)
    AND (
         (
           i.available_to_tiers ?| public._mp_tier_cascade_keys(public.current_tenant_tier(_tenant_id))
           AND (
                i.scope = 'public'
                OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
                OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, _actor_user_id) IS NOT NULL)
              )
         )
         OR public._mp_curated_in(i.id, _tenant_id)
       )
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) TO service_role;

COMMIT;
