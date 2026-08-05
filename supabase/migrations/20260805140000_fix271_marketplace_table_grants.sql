-- ============================================================================
-- #271 (P0) — fix `permission denied for table marketplace_items` (42501)
--
-- ROOT CAUSE (live-reproduced on prod xygzykjyynhzqytbqnzu):
-- Neither marketplace registry-spine migration (20260714155542 / 20260714270000,
-- the table creators) issued ANY table-privilege GRANT, and Supabase's
-- ALTER DEFAULT PRIVILEGES auto-grant did not fire for this creation flow. Every
-- marketplace_* base table shipped with relacl = NULL — i.e. ONLY the owner
-- (postgres) has any privilege; anon / authenticated / service_role have NONE.
--
-- The failing reader is the service_role `admin` client in
-- supabase/functions/marketplace-install/index.ts (marketplace_items / _versions
-- / _installs) — surfaced as the 400 `permission denied for table
-- marketplace_items` once #269 stopped swallowing it. A table GRANT is checked
-- BEFORE RLS, so the read throws 42501 for service_role even though service_role
-- bypasses RLS. marketplace-checkout-session reads marketplace_items too — same
-- latent 42501 — so this fix covers the whole family (§37).
--
-- THE FIX: restore the standard Supabase grants the sibling tables carry
-- (profiles control row = arwdDxtm for authenticated + service_role). This is
-- design-consistent, NOT a new decision — all RLS read policies on these tables
-- are already authored `TO authenticated` and are §9-correct (mp_items_read /
-- mp_versions_read / mp_installs_rw / mp_vendors_rw / mp_ledger_read), proving the
-- design always intended "standard grants + RLS gating"; the grant was simply
-- never applied.
--
-- §9 SAFE: a GRANT only lets RLS govern; it does NOT weaken tenant isolation. For
-- service_role (which bypasses RLS) the grant just restores the table privilege
-- the edge function needs. For authenticated, RLS continues to scope every row.
-- anon is intentionally NOT granted: no marketplace RLS policy targets anon, and
-- no anon reader exists — granting it would add latent surface for zero benefit.
--
-- §213-uniform: one uniform grant fixes install/browse identically for EVERY
-- privileged tier (God / Agency / Standalone / Sub-account) — the failing read
-- runs as service_role downstream of tenant resolution, so all four failed the
-- same way and all four are fixed the same way. Client/Anonymous remain correctly
-- gated (no surface / 401) — untouched by this grant.
--
-- Idempotent: GRANT is a no-op when the privilege already exists; safe to re-run.
-- ============================================================================

BEGIN;

-- authenticated: standard DML, every row still governed by the existing §9 RLS
-- policies on each table (SELECT scoped to listed+public / this-tenant / this-
-- agency / platform-owner; writes scoped to platform-owner / vendor-admin /
-- tenant-admin).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.marketplace_vendors,
  public.marketplace_items,
  public.marketplace_item_versions,
  public.marketplace_installs,
  public.marketplace_install_ledger
TO authenticated;

-- service_role: full privilege (bypasses RLS) — this is the #271 reader path in
-- the marketplace-install / marketplace-checkout-session edge functions.
GRANT ALL ON
  public.marketplace_vendors,
  public.marketplace_items,
  public.marketplace_item_versions,
  public.marketplace_installs,
  public.marketplace_install_ledger
TO service_role;

COMMIT;
