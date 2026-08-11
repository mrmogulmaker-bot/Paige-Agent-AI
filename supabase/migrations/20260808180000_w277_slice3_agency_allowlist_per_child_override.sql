-- ============================================================================
-- Wave 3.9 SLICE 3 — Agency curation PER-SUB-ACCOUNT override grain
-- (#277; §9/§18/§12/§10/§32/§37/§39/§51/§55)
--
-- WHAT: extends the SAME agency_item_allowlist table (Slice 1, 20260805230000)
--   with an OPTIONAL per-sub-account override grain. Today an agency's curation is
--   ONE agency-wide row per (agency,item): enabled_for_subaccounts flips the item
--   on/off for ALL of that agency's sub-accounts at once. This slice lets an agency
--   owner ALSO make a per-child exception WITHOUT a new table, a new picker, or a
--   new notification (§18/§55):
--     • sub_account_tenant_id NULL  = the agency-WIDE DEFAULT row (unchanged shape).
--     • sub_account_tenant_id NON-NULL = a per-CHILD OVERRIDE row for exactly that
--       sub-account.
--   Effective visibility EVERYWHERE = COALESCE(override.enabled, default.enabled,
--   false): a child's own override WINS; else the agency default; else fail-CLOSED
--   hidden.
--
-- WHO IS THIS FOR (§9): the AGENCY OPERATOR (a parent tenant that owns
--   sub-accounts). The agency curates the default AND the per-child exceptions; the
--   sub-account only READS (its parent's default + its OWN override, never a
--   sibling's). God sees all. Cross-agency + cross-sibling reads/writes DENIED.
--
-- §18 FOUR-QUESTION GATE (grounded):
--   (1) GREPPED: agency_item_allowlist DDL + set_agency_item_allowlist +
--       tg_agency_allowlist_on_item_approved + agency_curation_catalog (Slice 1,
--       20260805230000); _mp_curated_in + mp_items_read + both
--       marketplace_catalog_for_tenant overloads (Slice 2, 20260807020000);
--       _agency_allowlist_target_is_agency (Slice 1); the §51 child-never-agency
--       invariant (20260807230000).
--   (2) SIBLINGS: the agency-wide curation row + its writer/reader/trigger (Slice 1);
--       the tenant-side curated resolver (_mp_curated_in, Slice 2). This slice is a
--       finer GRAIN on the SAME table + the SAME seams — not a new surface.
--   (3) WHY EXTEND (not a new table): §55/§18 forbid a second curation home. The
--       override is one nullable column + two partial unique indexes on the ONE
--       existing table; every reader/writer already funnels through
--       _mp_curated_in / set_agency_item_allowlist, so the grain lands in the homes
--       that already own it.
--   (4) TYPE/SHAPE DECISION server-side: effective flag is resolved by the SECURITY
--       DEFINER resolver (_mp_curated_in) and the reader RPC; no caller passes
--       "show override" — the UI names a child, the DB folds override-over-default.
--
-- §51 TIER MATRIX (per-tier outcome, all six rows — override grain):
--   God/Super Admin  — full access (is_platform_owner()).
--   Agency           — writes DEFAULT rows + per-child OVERRIDE rows for its OWN
--                      children (grain guard: _agency_owns_child); reads its own.
--   Standalone Tenant— role NULL over any agency → no write; SELECT only if itself a
--                      sub-account (has an agency parent).
--   Sub-account      — READ-ONLY: its parent agency's DEFAULT row + its OWN override
--                      row; NEVER a sibling's override (tightened SELECT policy).
--   Client           — no role, no matching parent agency → 0 rows, no write.
--   Anonymous        — no GRANT reaches anon; denied at the grant layer.
--
-- §55 GUARDRAILS (explicit non-scope): NO new sub-account-management surface, NO
--   per-CLIENT grain, NO override tier-elevation (curation stays tier-independent and
--   never lifts a sub-account's own tier), NO per-child TRIGGER seeding (the trigger
--   still seeds DEFAULT rows only), NO second notification, NO second table, NO
--   copy-from-sibling.
--
-- §37 PRODUCER/CONSUMER INVENTORY (contract changes in this migration):
--   • set_agency_item_allowlist gains a 4th param (_sub_account_tenant_id DEFAULT
--     NULL). The old 3-arg signature is DROPPED and replaced by the 4-arg with a
--     DEFAULT so every existing 3-arg caller resolves unchanged to the agency-wide
--     path (frontend AgencyMarketplace toggle, Paige seam). Verified: a 3-positional
--     or 3-named call binds the default → NULL → identical behavior to Slice 1.
--   • _mp_curated_in signature UNCHANGED (uuid, uuid) — RLS mp_items_read and BOTH
--     marketplace_catalog_for_tenant overloads inherit the new override resolution
--     with zero body edits (they already call _mp_curated_in). This is the ONLY
--     reader change.
--   • Trigger response/return UNCHANGED; only its ON CONFLICT target moves to the
--     partial default index.
--
-- §32.b PROOF OBJECTS (for the pre-push BEGIN..ROLLBACK + §39 peer read):
--   ALTER agency_item_allowlist (+sub_account_tenant_id); drop pkey; +default_ux
--   /override_ux/subacct_idx; +_agency_owns_child; CREATE OR REPLACE _mp_curated_in,
--   set_agency_item_allowlist(4-arg), tg_agency_allowlist_on_item_approved; rewrite
--   agency_item_allowlist_select/_insert/_update/_delete; +agency_curation_catalog_for_subaccount.
-- ============================================================================

BEGIN;

-- ── 1. Add the OPTIONAL per-sub-account override grain column ─────────────────
-- NULL = agency-wide default row (Slice 1 shape). NON-NULL = per-child override.
-- CASCADE so deleting a sub-account tenant removes only its override rows (the
-- agency default row, sub_account_tenant_id NULL, is untouched).
ALTER TABLE public.agency_item_allowlist
  ADD COLUMN IF NOT EXISTS sub_account_tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.agency_item_allowlist.sub_account_tenant_id IS
  'Wave 3.9 Slice 3 (#277): NULL = agency-wide DEFAULT row; NON-NULL = per-child OVERRIDE for exactly this sub-account. Effective flag = COALESCE(override.enabled, default.enabled, false).';

-- ── 2. Replace the single (agency,item) PK with two partial unique indexes ────
-- The old PK cannot coexist with per-child rows (it forbids a second row for the
-- same (agency,item)). Split into: ONE default row per (agency,item) + ONE override
-- row per (agency,item,child). Existing rows all have sub_account_tenant_id NULL, so
-- they migrate cleanly into default_ux (they were already unique on (agency,item)).
ALTER TABLE public.agency_item_allowlist
  DROP CONSTRAINT IF EXISTS agency_item_allowlist_pkey;

-- ONE agency-wide default per (agency,item).
CREATE UNIQUE INDEX IF NOT EXISTS agency_item_allowlist_default_ux
  ON public.agency_item_allowlist (agency_tenant_id, marketplace_item_id)
  WHERE sub_account_tenant_id IS NULL;

-- ONE per-child override per (agency,item,child).
CREATE UNIQUE INDEX IF NOT EXISTS agency_item_allowlist_override_ux
  ON public.agency_item_allowlist (agency_tenant_id, marketplace_item_id, sub_account_tenant_id)
  WHERE sub_account_tenant_id IS NOT NULL;

-- Reverse lookup "which overrides target child X" + index-assisted CASCADE cleanup.
CREATE INDEX IF NOT EXISTS agency_item_allowlist_subacct_idx
  ON public.agency_item_allowlist (sub_account_tenant_id)
  WHERE sub_account_tenant_id IS NOT NULL;

-- ── 3. NEW predicate: does _agency own _child as a (non-manager) sub-account ──
-- §51 (child NEVER agency): _child must be a real sub-account of _agency — parented
-- to _agency AND not itself an agency/enterprise. SECURITY DEFINER so RLS on tenants
-- cannot make it wrongly return FALSE for a caller who can't see the child row. Bare
-- boolean out (no row leak) — not an IDOR. This is the ONE home (§18) for the grain
-- guard, used by the write RPC, the write RLS policies, and the per-child reader.
CREATE OR REPLACE FUNCTION public._agency_owns_child(_agency_tenant_id uuid, _child_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants c
     WHERE c.id = _child_tenant_id
       AND c.parent_tenant_id = _agency_tenant_id
       AND c.account_type NOT IN ('agency','enterprise')
  );
$$;
REVOKE ALL ON FUNCTION public._agency_owns_child(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._agency_owns_child(uuid, uuid) TO authenticated, service_role;

-- ── 4. Rewrite _mp_curated_in — override-over-default effective resolution ────
-- ONLY reader change (§18): signature UNCHANGED, so RLS + both catalog RPCs inherit
-- it. Effective flag now = COALESCE(override(child).enabled, default(NULL).enabled,
-- false) — override WINS, else agency default, else fail-CLOSED. The §9 scope-fold
-- (curated item must be legitimately visible to the GOVERNING AGENCY) is UNCHANGED.
CREATE OR REPLACE FUNCTION public._mp_curated_in(
  _item_id   uuid,
  _tenant_id uuid DEFAULT public.current_user_tenant_id()
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_items i
    JOIN LATERAL (
      -- governing agency of _tenant_id, ONLY when _tenant is a sub-account of an
      -- agency/enterprise (mirrors the _mp_caller_role_keys parent pattern, Slice 0).
      SELECT par.id AS agency_id
      FROM public.tenants t
      JOIN public.tenants par ON par.id = t.parent_tenant_id
      WHERE t.id = _tenant_id
        AND par.account_type IN ('agency','enterprise')
    ) g ON true
    WHERE i.id = _item_id
      -- effective flag: per-child override WINS, else agency-wide default, else false.
      AND COALESCE(
            (SELECT ov.enabled_for_subaccounts
               FROM public.agency_item_allowlist ov
              WHERE ov.marketplace_item_id   = _item_id
                AND ov.agency_tenant_id      = g.agency_id
                AND ov.sub_account_tenant_id = _tenant_id),
            (SELECT df.enabled_for_subaccounts
               FROM public.agency_item_allowlist df
              WHERE df.marketplace_item_id     = _item_id
                AND df.agency_tenant_id        = g.agency_id
                AND df.sub_account_tenant_id IS NULL),
            false
          ) = true
      -- §9 SCOPE-FOLD (UNCHANGED): a curated grant may only reveal an item that is
      -- public, or tenant-scoped to the governing agency, or agency-scoped to it.
      AND (
           i.scope = 'public'
        OR (i.scope = 'tenant' AND i.visible_to_tenant_id = g.agency_id)
        OR (i.scope = 'agency' AND i.visible_to_agency_id = g.agency_id)
      )
  );
$$;
REVOKE ALL ON FUNCTION public._mp_curated_in(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._mp_curated_in(uuid, uuid) TO authenticated, service_role;

-- ── 5. READ RLS — tighten the sub-account branch to default + OWN override ────
-- God + agency owner/admin-of-own-agency UNCHANGED. Sub-account branch TIGHTENED: a
-- child sees its parent agency's DEFAULT row (sub_account_tenant_id NULL) + its OWN
-- override row ONLY — NEVER a sibling's override (§51 sub-account isolation).
DROP POLICY IF EXISTS agency_item_allowlist_select ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_select ON public.agency_item_allowlist
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    -- the agency operator reads its OWN agency's curation (owner/admin tier)
    OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
    -- a SUB-ACCOUNT reads (read-only) its PARENT agency's DEFAULT row + its OWN
    -- override only. If the caller's tenant has no parent (a standalone), the
    -- subquery is NULL and `= NULL` is never true → 0 rows (fails safe, §9).
    OR (
         agency_tenant_id = (
           SELECT t.parent_tenant_id FROM public.tenants t
            WHERE t.id = public.current_user_tenant_id()
         )
         AND (
           sub_account_tenant_id IS NULL
           OR sub_account_tenant_id = public.current_user_tenant_id()
         )
       )
  );

-- ── 6. WRITE RLS — add the per-child GRAIN GUARD to every write policy ────────
-- Grain guard: a row may exist ONLY if it is the agency-wide default
-- (sub_account_tenant_id IS NULL) OR its child is a real sub-account of this agency
-- (_agency_owns_child) — so an owner cannot write an override for a sibling agency's
-- child or a non-child tenant. The §51 target-is-agency guard (Slice 1) is PRESERVED.
DROP POLICY IF EXISTS agency_item_allowlist_insert ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_insert ON public.agency_item_allowlist
  FOR INSERT TO authenticated
  WITH CHECK (
    -- §51: a curation row may exist ONLY for a real agency/enterprise parent.
    public._agency_allowlist_target_is_agency(agency_tenant_id)
    -- Slice 3 grain guard: default row, or an override for a real OWN child.
    AND (
      sub_account_tenant_id IS NULL
      OR public._agency_owns_child(agency_tenant_id, sub_account_tenant_id)
    )
    AND (
      public.is_platform_owner()
      OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
    )
  );

DROP POLICY IF EXISTS agency_item_allowlist_update ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_update ON public.agency_item_allowlist
  FOR UPDATE TO authenticated
  USING (
    (
      public.is_platform_owner()
      OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
    )
    -- grain guard on the EXISTING row.
    AND (
      sub_account_tenant_id IS NULL
      OR public._agency_owns_child(agency_tenant_id, sub_account_tenant_id)
    )
  )
  WITH CHECK (
    -- §51: the row must remain scoped to a real agency/enterprise parent.
    public._agency_allowlist_target_is_agency(agency_tenant_id)
    -- grain guard on the RESULTING row.
    AND (
      sub_account_tenant_id IS NULL
      OR public._agency_owns_child(agency_tenant_id, sub_account_tenant_id)
    )
    AND (
      public.is_platform_owner()
      OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
    )
  );

DROP POLICY IF EXISTS agency_item_allowlist_delete ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_delete ON public.agency_item_allowlist
  FOR DELETE TO authenticated
  USING (
    (
      public.is_platform_owner()
      OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
    )
    -- grain guard on the row being deleted.
    AND (
      sub_account_tenant_id IS NULL
      OR public._agency_owns_child(agency_tenant_id, sub_account_tenant_id)
    )
  );

-- ── 7. Trigger — target the DEFAULT partial index on conflict (seed defaults) ─
-- Seeds a PENDING agency-WIDE DEFAULT row (sub_account_tenant_id NULL) per approved
-- item, for every agency — NO per-child seeding (§55). ON CONFLICT now names the
-- partial default index. The notification body is UNCHANGED (one summary row, §18).
CREATE OR REPLACE FUNCTION public.tg_agency_allowlist_on_item_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- (1) seed a PENDING (enabled_for_subaccounts=false, unreviewed) DEFAULT row for
  --     every eligible agency. sub_account_tenant_id defaults NULL (agency-wide).
  --     ON CONFLICT on the partial default index = idempotent + never clobbers an
  --     agency's existing decision on a re-approval.
  INSERT INTO public.agency_item_allowlist (agency_tenant_id, marketplace_item_id, enabled_for_subaccounts)
  SELECT t.id, NEW.id, false
    FROM public.tenants t
   WHERE t.account_type IN ('agency','enterprise')
  ON CONFLICT (agency_tenant_id, marketplace_item_id) WHERE sub_account_tenant_id IS NULL DO NOTHING;

  -- (2) file ONE operator notification (§18 EXTEND paige_admin_notifications; the
  --     global feed has no agency column, so one summary row — not N duplicates).
  INSERT INTO public.paige_admin_notifications (severity, title, body, link_to, source_workflow_key)
  VALUES (
    'info',
    'New Marketplace item pending Agency review',
    format('%s is approved and awaiting each agency''s decision on whether their sub-accounts can use it.',
           COALESCE(NULLIF(NEW.name, ''), NEW.slug, 'A new item')),
    '/agency/marketplace',
    'agency_marketplace_curation'
  );

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_agency_allowlist_on_item_approved() FROM public;

DROP TRIGGER IF EXISTS trg_agency_allowlist_on_item_approved ON public.marketplace_items;
CREATE TRIGGER trg_agency_allowlist_on_item_approved
  AFTER INSERT ON public.marketplace_items
  FOR EACH ROW
  WHEN (NEW.publish_status = 'approved')
  EXECUTE FUNCTION public.tg_agency_allowlist_on_item_approved();

-- ── 8. Curation RPC — 4-arg (add optional _sub_account_tenant_id) ────────────
-- §37: DROP the old 3-arg and replace with a 4-arg carrying a DEFAULT so every
-- existing 3-arg caller (frontend toggle, Paige seam) resolves to the agency-wide
-- (default-row) path with ZERO code change. When _sub_account_tenant_id is NON-NULL,
-- write a per-child OVERRIDE row after enforcing _agency_owns_child. Authority
-- (owner/admin) + §51 target-is-agency gates PRESERVED verbatim from Slice 1.
DROP FUNCTION IF EXISTS public.set_agency_item_allowlist(uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_agency_item_allowlist(
  _agency_tenant_id      uuid,
  _marketplace_item_id   uuid,
  _enabled               boolean,
  _sub_account_tenant_id uuid DEFAULT NULL
)
RETURNS public.agency_item_allowlist
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.agency_item_allowlist;
BEGIN
  IF _agency_tenant_id IS NULL OR _marketplace_item_id IS NULL OR _enabled IS NULL THEN
    RAISE EXCEPTION 'agency, item, and enabled are all required' USING ERRCODE = '22023';
  END IF;

  -- §9 authority gate: God, or an owner/admin of THIS agency. auth.uid() only.
  -- NULL-SAFE (CRITICAL): agency_team_role() returns NULL for a caller with no role
  -- over _agency_tenant_id; the bare `IF NOT (... NULL ...)` would FAIL OPEN, so
  -- COALESCE(...,false) collapses the NULL to a hard deny. (Preserved from Slice 1.)
  IF NOT (
    public.is_platform_owner()
    OR COALESCE(
         public.agency_team_role(_agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin'),
         false)
  ) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can curate this agency''s Marketplace'
      USING ERRCODE = '42501';
  END IF;

  -- §51: agency_team_role returns 'agency_owner' for a STANDALONE owner over its OWN
  -- id too, so constrain the target to a real agency/enterprise parent.
  IF NOT public._agency_allowlist_target_is_agency(_agency_tenant_id) THEN
    RAISE EXCEPTION 'Curation is only available for agency accounts'
      USING ERRCODE = '42501';
  END IF;

  IF _sub_account_tenant_id IS NULL THEN
    -- Agency-WIDE default row (Slice 1 path, unchanged behavior).
    INSERT INTO public.agency_item_allowlist AS a
      (agency_tenant_id, marketplace_item_id, sub_account_tenant_id,
       enabled_for_subaccounts, reviewed_at, reviewed_by)
    VALUES
      (_agency_tenant_id, _marketplace_item_id, NULL,
       _enabled, now(), auth.uid())
    ON CONFLICT (agency_tenant_id, marketplace_item_id) WHERE sub_account_tenant_id IS NULL
    DO UPDATE
      SET enabled_for_subaccounts = EXCLUDED.enabled_for_subaccounts,
          reviewed_at             = now(),
          reviewed_by             = auth.uid()
    RETURNING a.* INTO _row;
  ELSE
    -- Per-CHILD override row. §51 grain guard: the child must be a real sub-account
    -- of THIS agency, else insufficient_privilege (matches the write RLS grain guard).
    IF NOT public._agency_owns_child(_agency_tenant_id, _sub_account_tenant_id) THEN
      RAISE EXCEPTION 'That sub-account is not owned by this agency'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.agency_item_allowlist AS a
      (agency_tenant_id, marketplace_item_id, sub_account_tenant_id,
       enabled_for_subaccounts, reviewed_at, reviewed_by)
    VALUES
      (_agency_tenant_id, _marketplace_item_id, _sub_account_tenant_id,
       _enabled, now(), auth.uid())
    ON CONFLICT (agency_tenant_id, marketplace_item_id, sub_account_tenant_id) WHERE sub_account_tenant_id IS NOT NULL
    DO UPDATE
      SET enabled_for_subaccounts = EXCLUDED.enabled_for_subaccounts,
          reviewed_at             = now(),
          reviewed_by             = auth.uid()
    RETURNING a.* INTO _row;
  END IF;

  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.set_agency_item_allowlist(uuid, uuid, boolean, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.set_agency_item_allowlist(uuid, uuid, boolean, uuid) TO authenticated, service_role;

-- ── 9. Per-sub-account curation reader — effective + default + is_override ────
-- Same gates as agency_curation_catalog (God OR owner/admin of THIS agency; §51
-- target-is-agency) PLUS _agency_owns_child(_agency, _sub_account). Tier/role/scope
-- bound to the AGENCY id (independent of active context — the §39 seam Slice 1
-- closed). LEFT JOINs the default row + the child's override row and returns the
-- effective flag so the per-child UI toggle renders inherit-vs-override at a glance.
CREATE OR REPLACE FUNCTION public.agency_curation_catalog_for_subaccount(
  _agency_tenant_id      uuid,
  _sub_account_tenant_id uuid
)
RETURNS TABLE(
  item_id           uuid,
  slug              text,
  name              text,
  tagline           text,
  description       text,
  category          text,
  icon              text,
  item_type         text,
  default_enabled   boolean,
  is_override       boolean,
  effective_enabled boolean,
  reviewed          boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _agency_tenant_id IS NULL OR _sub_account_tenant_id IS NULL THEN
    RAISE EXCEPTION 'agency and sub-account are required' USING ERRCODE = '22023';
  END IF;

  -- §9 authority: God, or an owner/admin of THIS agency (auth.uid() only, NULL-safe).
  IF NOT (
    public.is_platform_owner()
    OR COALESCE(
         public.agency_team_role(_agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin'),
         false)
  ) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can view this agency''s curation catalog'
      USING ERRCODE = '42501';
  END IF;

  -- §51: curation exists only for a real agency/enterprise parent.
  IF NOT public._agency_allowlist_target_is_agency(_agency_tenant_id) THEN
    RAISE EXCEPTION 'Curation is only available for agency accounts'
      USING ERRCODE = '42501';
  END IF;

  -- §51 grain: the named sub-account must be a real OWN child of this agency.
  IF NOT public._agency_owns_child(_agency_tenant_id, _sub_account_tenant_id) THEN
    RAISE EXCEPTION 'That sub-account is not owned by this agency' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.slug,
    i.name,
    i.tagline,
    i.description,
    i.category,
    i.icon,
    i.item_type::text,
    COALESCE(d.enabled_for_subaccounts, false)                              AS default_enabled,
    (o.marketplace_item_id IS NOT NULL)                                     AS is_override,
    COALESCE(o.enabled_for_subaccounts, d.enabled_for_subaccounts, false)   AS effective_enabled,
    ((o.reviewed_at IS NOT NULL) OR (d.reviewed_at IS NOT NULL))            AS reviewed
  FROM public.marketplace_items i
  LEFT JOIN public.agency_item_allowlist d
         ON d.marketplace_item_id     = i.id
        AND d.agency_tenant_id        = _agency_tenant_id
        AND d.sub_account_tenant_id IS NULL
  LEFT JOIN public.agency_item_allowlist o
         ON o.marketplace_item_id     = i.id
        AND o.agency_tenant_id        = _agency_tenant_id
        AND o.sub_account_tenant_id   = _sub_account_tenant_id
  WHERE i.status = 'listed'
    AND i.publish_status = 'approved'
    -- tier/role/scope resolved against the AGENCY id, NOT current_user_tenant_id().
    AND i.available_to_tiers  ?| public._mp_tier_cascade_keys(public.current_tenant_tier(_agency_tenant_id))
    AND i.installable_by_role ?| public._mp_caller_role_keys(_agency_tenant_id, auth.uid())
    AND (
         i.scope = 'public'
         OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _agency_tenant_id)
         OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, auth.uid()) IS NOT NULL)
       )
  ORDER BY i.category, i.name;
END;
$$;
REVOKE ALL ON FUNCTION public.agency_curation_catalog_for_subaccount(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.agency_curation_catalog_for_subaccount(uuid, uuid) TO authenticated, service_role;

-- ── §37 CONSUMER FIX: keep the AGENCY-WIDE reader single-row per item ─────────
-- The cardinality change above (1 default + N per-child override rows per
-- (agency,item)) silently breaks Slice 1's agency-wide reader
-- `agency_curation_catalog`: its LEFT JOIN matched on (item, agency) only, so the
-- moment a per-child OVERRIDE row exists it FANS OUT — the item renders once per
-- override row and `enabled_for_subaccounts` is read non-deterministically from
-- whichever row the planner returns (an override's flag masquerading as the
-- agency-wide default). This is the frozen agency-wide shelf (AgencyMarketplace
-- `scope==='agency'` grid), so it MUST keep returning exactly one row per item with
-- the DEFAULT flag. Fix = CREATE OR REPLACE with the live body verbatim + a single
-- added predicate `AND a.sub_account_tenant_id IS NULL` so the join only ever binds
-- the agency-wide default row. Body otherwise byte-identical to prod (gates, tier/
-- role/scope-bound-to-agency, ORDER BY all preserved). (Slice 3 §37/§39/compliance.)
CREATE OR REPLACE FUNCTION public.agency_curation_catalog(_agency_tenant_id uuid)
 RETURNS TABLE(item_id uuid, slug text, name text, tagline text, description text, category text, icon text, item_type text, enabled_for_subaccounts boolean, reviewed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _agency_tenant_id IS NULL THEN
    RAISE EXCEPTION 'agency is required' USING ERRCODE = '22023';
  END IF;

  -- §9 authority: God, or an owner/admin of THIS agency (auth.uid() only — never a prop).
  IF NOT (
    public.is_platform_owner()
    OR COALESCE(
         public.agency_team_role(_agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin'),
         false)
  ) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can view this agency''s curation catalog'
      USING ERRCODE = '42501';
  END IF;

  -- §51: curation exists only for a real agency/enterprise parent.
  IF NOT public._agency_allowlist_target_is_agency(_agency_tenant_id) THEN
    RAISE EXCEPTION 'Curation is only available for agency accounts'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.slug,
    i.name,
    i.tagline,
    i.description,
    i.category,
    i.icon,
    i.item_type::text,
    COALESCE(a.enabled_for_subaccounts, false) AS enabled_for_subaccounts,
    (a.reviewed_at IS NOT NULL)                AS reviewed
  FROM public.marketplace_items i
  LEFT JOIN public.agency_item_allowlist a
         ON a.marketplace_item_id  = i.id
        AND a.agency_tenant_id     = _agency_tenant_id
        AND a.sub_account_tenant_id IS NULL   -- Slice 3: bind ONLY the agency-wide default row (no override fan-out)
  WHERE i.status = 'listed'
    AND i.publish_status = 'approved'
    -- tier/role/scope resolved against the AGENCY id, NOT current_user_tenant_id().
    AND i.available_to_tiers  ?| public._mp_tier_cascade_keys(public.current_tenant_tier(_agency_tenant_id))
    AND i.installable_by_role ?| public._mp_caller_role_keys(_agency_tenant_id, auth.uid())
    AND (
         i.scope = 'public'
         OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _agency_tenant_id)
         OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, auth.uid()) IS NOT NULL)
       )
  ORDER BY i.category, i.name;
END;
$function$;

COMMIT;
