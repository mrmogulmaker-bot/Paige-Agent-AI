-- ============================================================================
-- Wave 3.9 SLICE 2 — tenant-side agency-curation ALLOWLIST visibility branch
-- (#277; §55/§18/§9/§51/§37/§32/§39)
--
-- WHAT: completes the marketplace visibility filter that Slice 0
--   (20260805170000) shipped with the agency-curation branch DEFERRED as a
--   commented placeholder. Slice 0 gates every catalog read by cascading TIER +
--   installer ROLE + publish lifecycle. This slice adds the ONE remaining branch:
--   a SUB-ACCOUNT also sees an item its PARENT AGENCY explicitly curated in for
--   its sub-accounts (an agency_item_allowlist row, enabled_for_subaccounts=true).
--
-- MERGES AFTER SLICE 1 (hard dependency, §13 honesty). This migration references
--   public.agency_item_allowlist, the curation table created by SLICE 1 (parallel
--   crew). The _mp_curated_in() helper is LANGUAGE sql, so Postgres validates the
--   table reference AT CREATE TIME — if this migration is applied BEFORE Slice 1's
--   table exists, `supabase db push` FAILS LOUDLY (relation does not exist), which
--   is the SAFE §32 failure (loud, nothing persisted, fix ordering + re-run) — never
--   a silent half-apply. Sequence: Slice 1 (table) → Slice 2 (this).
--
-- §18 FOUR-QUESTION GATE (grounded, not believed):
--   (1) GREPPED: `mp_items_read` + `marketplace_catalog_for_tenant` +
--       `_mp_tier_cascade_keys` + `current_tenant_tier` in
--       supabase/migrations/20260805170000_marketplace_items_tier_metadata_substrate.sql
--       (the Slice 0 substrate — the ONE home of the visibility filter); and the
--       tenant catalog consumer src/pages/admin/Marketplace.tsx (renders ONLY the
--       tier-filtered RPC output, no client-side type/tier logic).
--   (2) SIBLINGS (named): Slice 0 substrate (tier/role/publish filter + the two
--       resolvers current_tenant_tier / _mp_caller_role_keys / _mp_tier_cascade_keys);
--       Slice 1 agency_item_allowlist (the curation table this branch reads). The
--       Slice 0 policy carried an explicit commented placeholder for THIS branch.
--   (3) WHY EXTEND vs new home: this EXTENDS the existing filter — it adds ONE
--       OR-branch to the SAME policy + the SAME two RPC overloads. It is NOT a new
--       surface, table, or picker. The curation TABLE is Slice 1's home (§12); the
--       read-side branch belongs where the read already lives (Slice 0's filter).
--   (4) TYPE/SHAPE DECISION is made SERVER-SIDE (RLS + SECURITY DEFINER RPC resolve
--       the caller's tenant/tier/role/parent-agency), NEVER a human pre-classifying
--       (§18/§36). No caller ever passes their own tier, role, or "show me curated."
--
-- THE FULL RULE (this slice's deliverable). An item is visible to a NON-owner caller
--   IFF: status='listed' AND publish_status='approved' AND (role gate) AND (
--       -- NORMAL PATH: the caller's OWN tier + the §9 public/tenant/agency scope
--       ( available_to_tiers ?| cascade(current_tenant_tier)  AND  scope match )
--     OR
--       -- CURATED PATH: an explicit per-item grant from the parent agency to a
--       -- sub-account. Tier-INDEPENDENT by design — that is the entire point of
--       -- curation: an Academy/Enterprise agency hands a SPECIFIC item down to a
--       -- Solo sub-account it otherwise could not see (§17 growth atom). It does
--       -- NOT elevate the sub-account's tier — ONLY the curated item is granted.
--       _mp_curated_in(item, caller_tenant)
--   )
--   The role gate + approved + listed bind BOTH paths (they are AND-ed above the
--   disjunction). The tier cascade binds ONLY the normal path. Layer-2 (§51): the
--   sub-account resolves its OWN tier via current_tenant_tier() (zero parent bleed);
--   the curated branch adds ONLY the specifically-curated item, never the parent's
--   whole higher-tier catalog.
--
-- §32.b PROVEN pre-push (real authenticated jwt.claims matrix, self-aborting
--   BEGIN..ROLLBACK on prod xygzykjyynhzqytbqnzu): Solo standalone → Solo items only;
--   Academy owner → Academy+Solo; Enterprise → all; Solo sub-account under an Academy
--   agency → (a) curated Academy item enabled=TRUE becomes visible, (b) FALSE/absent
--   stays hidden, and NO bleed to OTHER un-curated Academy items. Outputs pasted in PR.
--
-- §39 PEER NOTE (why _mp_curated_in is SECURITY DEFINER): the RLS read runs in the
--   CALLER's context. If the allowlist EXISTS were inlined into mp_items_read, it
--   would hit agency_item_allowlist's OWN RLS (Slice 1) — and if that RLS does not
--   grant a sub-account read of its PARENT agency's curation rows, the inline check
--   would wrongly return FALSE and the curated item would stay hidden. A SECURITY
--   DEFINER helper bypasses the allowlist's RLS and returns a bare boolean (no row
--   contents leak), so the visibility decision is correct regardless of the curation
--   table's RLS posture. It cannot be an IDOR: it returns only "is this item curated
--   for this tenant's governing agency" — no sender address, no partner list, no data.
-- ============================================================================

BEGIN;

-- ── 1. Curated-in resolver — the ONE home (§12) for the agency-curation branch ──
-- Returns TRUE iff _tenant_id is a SUB-ACCOUNT (its parent is an agency/enterprise)
-- AND its governing agency has an agency_item_allowlist row for _item_id with
-- enabled_for_subaccounts = true. The governing-agency subquery MIRRORS the pattern
-- already used by _mp_caller_role_keys (Slice 0): an INNER JOIN to the parent, gated
-- to account_type IN ('agency','enterprise'). For a STANDALONE tenant (no parent) or
-- an AGENCY itself (top-level, parent NULL), the subquery yields NULL, so
-- `agency_tenant_id = NULL` is never true (agency_tenant_id is NOT NULL) → FALSE.
-- Hence the "caller is a sub-account" condition is encoded structurally — the branch
-- can only ever GRANT extra visibility to a genuine sub-account (fail-safe, §9).
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
    WHERE a.marketplace_item_id     = _item_id
      AND a.enabled_for_subaccounts = true
      AND a.agency_tenant_id = (
            -- governing agency of _tenant_id, ONLY when _tenant is a sub-account
            SELECT par.id
            FROM public.tenants t
            JOIN public.tenants par ON par.id = t.parent_tenant_id
            WHERE t.id = _tenant_id
              AND par.account_type IN ('agency','enterprise')
          )
  );
$$;
REVOKE ALL ON FUNCTION public._mp_curated_in(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._mp_curated_in(uuid, uuid) TO authenticated, service_role;

-- ── 2. READ RLS — add the curated OR-branch (replaces Slice 0's placeholder) ─────
-- The role + publish + listed gates are UNCHANGED and bind BOTH paths. Tier now
-- gates ONLY the normal path; the curated path is tier-independent (a per-item grant).
-- §9 scope (public/tenant/agency) is PRESERVED verbatim inside the normal path.
DROP POLICY IF EXISTS mp_items_read ON public.marketplace_items;
CREATE POLICY mp_items_read ON public.marketplace_items
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (
      status = 'listed'                                          -- PRESERVED §9 gate
      AND publish_status = 'approved'                            -- publish lifecycle
      AND installable_by_role ?| public._mp_caller_role_keys()   -- installer-role gate (both paths)
      AND (
        -- NORMAL PATH: own-tier cascade AND preserved §9 public/tenant/agency scope
        (
          available_to_tiers ?| public._mp_tier_cascade_keys(public.current_tenant_tier())
          AND (
               scope = 'public'
            OR (scope = 'tenant' AND visible_to_tenant_id = public.current_user_tenant_id())
            OR (scope = 'agency' AND public.agency_team_role(visible_to_agency_id, auth.uid()) IS NOT NULL)
          )
        )
        -- CURATED PATH: parent agency curated this specific item in for its
        -- sub-accounts (Slice 2 · §55). Tier-independent, additive — a sub-account
        -- sees ONLY the curated item, never the parent's whole higher-tier catalog.
        OR public._mp_curated_in(id, public.current_user_tenant_id())
      )
    )
  );

-- ── 3. Browse-RPC parity — IDENTICAL branch on BOTH overloads (§37 consumer) ──────
-- The catalog RPC is SECURITY DEFINER (bypasses table RLS), so it MUST carry the
-- same curated OR-branch or it would HIDE curated items the direct read now shows
-- (a parity break). Response contract (RETURNS TABLE) is UNCHANGED — rows are only
-- widened by the curated grant. Tier resolves via current_tenant_tier(_tenant_id)
-- (never request input); curated via _mp_curated_in(i.id, _tenant_id).
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
         AND i.publish_status = 'approved'                                          -- parity
         AND i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, auth.uid())  -- parity: role (both paths)
         AND (
              -- NORMAL PATH: own-tier cascade + preserved §9 scope
              (
                i.available_to_tiers ?| public._mp_tier_cascade_keys(public.current_tenant_tier(_tenant_id))
                AND (
                     i.scope = 'public'
                     OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
                     OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, auth.uid()) IS NOT NULL)
                   )
              )
              -- CURATED PATH: parity with the table read
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
    AND i.publish_status = 'approved'                                               -- parity
    AND i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, _actor_user_id)  -- parity: role (both paths)
    AND (
         -- NORMAL PATH: own-tier cascade + preserved §9 scope
         (
           i.available_to_tiers ?| public._mp_tier_cascade_keys(public.current_tenant_tier(_tenant_id))
           AND (
                i.scope = 'public'
                OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
                OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, _actor_user_id) IS NOT NULL)
              )
         )
         -- CURATED PATH: parity with the table read
         OR public._mp_curated_in(i.id, _tenant_id)
       )
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) TO service_role;

COMMIT;
