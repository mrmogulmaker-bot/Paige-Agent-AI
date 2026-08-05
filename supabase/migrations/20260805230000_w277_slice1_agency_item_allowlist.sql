-- ============================================================================
-- Wave 3.9 SLICE 1 — Agency curation ALLOWLIST + notification trigger + RPC
-- (#277; §9/§18/§12/§10/§32/§37/§51)
--
-- WHAT: the AGENCY-side curation substrate that Slice 0 flagged and deferred
--   (§55 in 20260805170000). An agency OWNER decides which approved Marketplace
--   items their SUB-ACCOUNTS may see/install. This slice ships:
--     (A) public.agency_item_allowlist — the per-(agency,item) curation row.
--     (B) a trigger that, on a NEW approved marketplace_items row, seeds a
--         pending (enabled_for_subaccounts=false) allowlist row for every
--         eligible agency AND files ONE operator notification to review it.
--     (C) public.set_agency_item_allowlist(...) — the ONE callable curation
--         seam (§10): the React toggle is one caller, Paige is another.
--
-- WHO IS THIS FOR (§9): the AGENCY OPERATOR (a parent tenant that owns
--   sub-accounts) — NOT the platform operator, and NOT the sub-account. The
--   agency curates; the sub-account only READS its parent's curation. God/Super
--   Admin sees all. Cross-agency reads/writes are DENIED.
--
-- SCOPE HONESTY (§13/§32): this slice ships the curation TABLE + writer + reader
--   substrate. It does NOT yet wire the additive OR-branch into Slice 0's
--   mp_items_read / marketplace_catalog_for_tenant (the "a sub-account also sees
--   an item its parent agency enabled" visibility grant). That consumption is a
--   SEPARATE, independently-provable change (its own §32 catalog-visibility proof
--   + §37 consumer inventory) and is flagged here, matching Slice 0's own note
--   that the branch is ADDITIVE and fails SAFE when omitted (a sub-account sees
--   slightly LESS until it lands, never more — it can never loosen §9).
--
-- NOTIFICATION HOME (§18/§12): the real prod notifications table is
--   public.paige_admin_notifications (the brief's "admin_notifications" is its
--   informal name). We EXTEND it — no second notification system. It is a GLOBAL
--   operator feed (no per-tenant column; RLS = admin/coach), so we file ONE
--   summary row per newly-approved item (title "New Marketplace item pending
--   Agency review", link → /agency/marketplace), NOT N identical global rows per
--   agency (§12 — do not spam a shared feed). The per-agency granularity lives in
--   the allowlist rows themselves, which IS the review queue.
--
-- AUTHORITY (§9, grounded 2026-08-05 on prod): curation WRITE authority derives
--   SOLELY from the caller's real agency role via the existing helper
--   public.agency_team_role(_agency, _actor) — never the request body. That
--   helper returns 'agency_owner' for the immutable tenant OWNER of an agency and
--   the agency_team_members.agency_role otherwise. Curation is a management act,
--   so we gate on the management tier IN ('agency_owner','agency_admin') — the
--   same tier agency_can_manage_child grants child control to. A plain
--   sub-account owner has role NULL over its parent agency (verified: user
--   443e94a3 → NULL vs PME) → can never write. Slice 0's _mp_caller_role_keys
--   treats ANY agency role as the 'agency_owner' catalog KEY; that is a READ
--   visibility key, deliberately looser than this WRITE gate.
--
-- §51 TIER MATRIX (per-tier outcome, all six rows):
--   God/Super Admin  — full access (is_platform_owner()).
--   Agency           — INSERT/UPDATE/DELETE + SELECT its OWN agency's rows.
--   Standalone Tenant— role NULL over any agency → no write; SELECT only if it is
--                      itself a sub-account (has an agency parent), else none.
--   Sub-account      — READ-ONLY its PARENT agency's rows; no write.
--   Client           — not authenticated into this surface; RLS denies (no role,
--                      no matching parent agency) → 0 rows, no write.
--   Anonymous        — no GRANT reaches anon; denied at the grant layer.
-- ============================================================================

BEGIN;

-- ── A. The curation table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agency_item_allowlist (
  agency_tenant_id        uuid        NOT NULL REFERENCES public.tenants(id)           ON DELETE CASCADE,
  marketplace_item_id     uuid        NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  enabled_for_subaccounts boolean     NOT NULL DEFAULT false,
  reviewed_at             timestamptz NULL,
  reviewed_by             uuid        NULL,
  PRIMARY KEY (agency_tenant_id, marketplace_item_id)
);

COMMENT ON TABLE public.agency_item_allowlist IS
  'Wave 3.9 Slice 1 (#277): per-(agency,item) curation. An agency owner sets enabled_for_subaccounts to decide which approved Marketplace items its sub-accounts may see/install. enabled=false + reviewed_at NULL = pending review.';

-- Reverse index so "which agencies enabled item X" (future catalog consumption)
-- and the CASCADE cleanup are index-assisted.
CREATE INDEX IF NOT EXISTS agency_item_allowlist_item_idx
  ON public.agency_item_allowlist (marketplace_item_id);
-- Pending-review partial index powers the agency Review Queue cheaply.
CREATE INDEX IF NOT EXISTS agency_item_allowlist_pending_idx
  ON public.agency_item_allowlist (agency_tenant_id)
  WHERE reviewed_at IS NULL;

-- Grant + RLS model (#271): GRANT lets RLS govern; we do NOT rely on REVOKE.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_item_allowlist TO authenticated, service_role;

ALTER TABLE public.agency_item_allowlist ENABLE ROW LEVEL SECURITY;
-- NOTE (deliberate): plain ENABLE (no FORCE) — the codebase norm. The SECURITY
-- DEFINER seams (the trigger's cross-agency seed INSERT, and set_agency_item_allowlist)
-- run as the table owner and are exempt from RLS by the table-owner rule, which is
-- exactly what lets the trigger seed a row for EVERY agency while each of those
-- functions enforces its OWN §9 authority check in-body. Direct authenticated
-- table access (the belt) is fully governed by the policies below.

-- ── A.1 READ RLS — agency operator (own agency) + sub-account (parent) + God ──
DROP POLICY IF EXISTS agency_item_allowlist_select ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_select ON public.agency_item_allowlist
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    -- the agency operator reads its OWN agency's curation (owner/admin tier)
    OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
    -- a SUB-ACCOUNT reads (read-only) its PARENT agency's curation. If the caller's
    -- tenant has no parent (a standalone), the subquery is NULL and `= NULL` is
    -- never true → 0 rows (fails safe, §9).
    OR agency_tenant_id = (
         SELECT t.parent_tenant_id FROM public.tenants t
          WHERE t.id = public.current_user_tenant_id()
       )
  );

-- ── A.2 WRITE RLS — agency owner/admin of THIS agency, or God ────────────────
-- Split per-command so each verb states its own USING/WITH CHECK explicitly.
DROP POLICY IF EXISTS agency_item_allowlist_insert ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_insert ON public.agency_item_allowlist
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_owner()
    OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
  );

DROP POLICY IF EXISTS agency_item_allowlist_update ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_update ON public.agency_item_allowlist
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_owner()
    OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
  );

DROP POLICY IF EXISTS agency_item_allowlist_delete ON public.agency_item_allowlist;
CREATE POLICY agency_item_allowlist_delete ON public.agency_item_allowlist
  FOR DELETE TO authenticated
  USING (
    public.is_platform_owner()
    OR public.agency_team_role(agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin')
  );

-- ── B. Notification trigger — new approved item -> seed pending rows + notify ─
-- SECURITY DEFINER so it can write allowlist rows (for every agency) and the
-- operator feed regardless of which SECURITY DEFINER operator RPC inserted the
-- item. Fires only when the NEW row is 'approved' (the state a sub-account could
-- ever see), so a draft/in_review item does not spam the queue.
CREATE OR REPLACE FUNCTION public.tg_agency_allowlist_on_item_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- (1) seed a PENDING (enabled_for_subaccounts=false, unreviewed) row for every
  --     eligible agency. ON CONFLICT DO NOTHING = idempotent + never clobbers an
  --     agency's existing decision on a re-approval.
  INSERT INTO public.agency_item_allowlist (agency_tenant_id, marketplace_item_id, enabled_for_subaccounts)
  SELECT t.id, NEW.id, false
    FROM public.tenants t
   WHERE t.account_type IN ('agency','enterprise')
  ON CONFLICT (agency_tenant_id, marketplace_item_id) DO NOTHING;

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

-- ── C. Curation RPC — the ONE callable seam (§10) ────────────────────────────
-- Authority derives from auth.uid() + the agency helper, NEVER the request body
-- (§9). UPSERTs the flag and stamps reviewer provenance (reviewed_at/_by).
CREATE OR REPLACE FUNCTION public.set_agency_item_allowlist(
  _agency_tenant_id   uuid,
  _marketplace_item_id uuid,
  _enabled            boolean
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
  -- over _agency_tenant_id. `is_platform_owner() OR (NULL IN (...))` evaluates to
  -- NULL, and a bare `IF NOT NULL` does NOT raise — so an un-COALESCEd guard would
  -- FAIL OPEN and let any caller curate ANY agency (a §9 IDOR the SECURITY DEFINER
  -- body would execute because it bypasses the table's RLS). COALESCE(...,false)
  -- collapses the NULL to a hard deny. (The RLS policies above are already NULL-safe
  -- because RLS treats a NULL predicate as deny; this imperative guard is not, hence
  -- the explicit COALESCE. Caught by the §39 adversarial proof: without it, a
  -- cross-agency and a sub-account RPC write both leaked.)
  IF NOT (
    public.is_platform_owner()
    OR COALESCE(
         public.agency_team_role(_agency_tenant_id, auth.uid()) IN ('agency_owner','agency_admin'),
         false)
  ) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can curate this agency''s Marketplace'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.agency_item_allowlist AS a
    (agency_tenant_id, marketplace_item_id, enabled_for_subaccounts, reviewed_at, reviewed_by)
  VALUES
    (_agency_tenant_id, _marketplace_item_id, _enabled, now(), auth.uid())
  ON CONFLICT (agency_tenant_id, marketplace_item_id) DO UPDATE
    SET enabled_for_subaccounts = EXCLUDED.enabled_for_subaccounts,
        reviewed_at             = now(),
        reviewed_by             = auth.uid()
  RETURNING a.* INTO _row;

  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.set_agency_item_allowlist(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_agency_item_allowlist(uuid, uuid, boolean) TO authenticated, service_role;

COMMIT;
