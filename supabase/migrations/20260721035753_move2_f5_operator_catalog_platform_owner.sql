-- Move 2 · F5 — operator-catalog tables: narrow the global has_role('admin') MANAGE bypass to
-- is_platform_owner() ONLY (super_admin operator). No tenant_id, no agency clause — these are
-- PLATFORM reference data (§9 operator layer), not tenant-owned rows.
--   funding_offers, lender_products, lender_bureau_preferences,
--   + grep-swept siblings folded in by the compliance §18 pass:
--   vendor_offers (twin of funding_offers), naics_codes (finance-adjacent reference consumed by
--   funding_offers), disclosure_templates (disclosure catalog). All 6 verified to have ZERO
--   tenant/user/owner scoping columns (information_schema) = pure operator catalog.
--
-- GROUNDING (§18): each table has a standalone admin MANAGE policy (has_role('admin'), the global
-- bypass — a tenant admin could edit the PLATFORM's funding/lender/vendor/disclosure catalog) + an
-- open READ policy (is_active=true / true). Move 2 narrows ONLY the admin MANAGE bypass to the operator
-- (is_platform_owner() = super_admin). The READ policies are LEFT UNTOUCHED, so tenants keep viewing
-- the active catalog — no read regression. lender_bureau_preferences carries THREE separate admin
-- policies (insert/update/delete) — all three narrowed (compliance Finding 1).
--
-- DATA-SAFETY: funding_offers 0 rows; lender_products 50; lender_bureau_preferences 20; vendor_offers/
-- naics_codes/disclosure_templates = platform reference/seed data — all read via the untouched READ
-- policies. Narrowing MANAGE to the operator loses no data and no legitimate read; it only removes
-- tenant admins' ability to WRITE the platform catalog, which is the intended §9 correction.
--
-- §2 NOTE (flagged, NOT fixed here — separate product decision, overlaps #176/#360): the authenticated
-- READ of the funding/lender catalog is visible to ALL authenticated users regardless of the tenant's
-- funding opt-in. That is a §2 catalog-visibility question, distinct from this admin-bypass security
-- fix; left for the funding-opt-in work, not force-changed inside a Move-2 narrowing.

-- =========================================================================================
-- funding_offers — admin MANAGE ALL → is_platform_owner()
-- =========================================================================================
ALTER POLICY "Admins can manage funding offers" ON public.funding_offers
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- =========================================================================================
-- lender_products — admin MANAGE ALL → is_platform_owner()
-- =========================================================================================
ALTER POLICY "Admins can manage lender products" ON public.lender_products
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- =========================================================================================
-- lender_bureau_preferences — admin DELETE/INSERT/UPDATE → is_platform_owner()
-- =========================================================================================
ALTER POLICY "Admins can delete bureau preferences" ON public.lender_bureau_preferences
  USING (public.is_platform_owner());
ALTER POLICY "Admins can insert bureau preferences" ON public.lender_bureau_preferences
  WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins can update bureau preferences" ON public.lender_bureau_preferences
  USING (public.is_platform_owner());

-- =========================================================================================
-- vendor_offers — admin MANAGE ALL → is_platform_owner() (twin of funding_offers)
-- =========================================================================================
ALTER POLICY "Admins can manage vendor offers" ON public.vendor_offers
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- =========================================================================================
-- naics_codes — admin MANAGE ALL → is_platform_owner() (finance-adjacent reference)
-- =========================================================================================
ALTER POLICY "Admins can manage NAICS codes" ON public.naics_codes
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- =========================================================================================
-- disclosure_templates — admin MANAGE ALL → is_platform_owner() (disclosure catalog)
-- =========================================================================================
ALTER POLICY "Admins can manage disclosures" ON public.disclosure_templates
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());
