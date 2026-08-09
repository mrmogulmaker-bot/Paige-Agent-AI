-- Tenant topology corrections + revenue-class refinement — task #29 Part 2a/2d
-- (owner rulings, Antonio 2026-08-09). Data-only; §51-safe; reversible.
--
-- §30 PRE-CHECKS RUN BEFORE WRITING THIS (all clean — see the audit report):
--   • parent_tenant_id column exists on tenants (confirmed).
--   • PME already parents Acme/Northstar/Antonio Daniel LLC; MMA is the 4th — none of the
--     four has its OWN children, so no §51 grandchild/nested-agency violation.
--   • The §51 CHECK `tenants_subaccount_not_agency` (parent IS NULL OR account_type NOT IN
--     ('agency','enterprise')) is SATISFIED by every change here — the four are set to
--     'sub_account' (a non-manager type), PME stays 'agency' with a NULL parent.
--
-- NOT in this migration (owner-decision-gated): the DELETE of "Paige Operations" (active) +
-- "Claude Studio Dev". Both carry default-provisioning-artifact rows (see audit report FK scan);
-- the owner's rule requires his per-tenant delete-method choice (cascade vs soft-delete) before a
-- destructive DELETE ships. Surfaced to Antonio; folded in on his ruling.

begin;

-- ── Part 2a — topology corrections (Antonio's real org chart) ────────────────────────────────
-- Project Mogul Enterprise Inc (29a7c77f) is the AGENCY; the four below are its SUB-ACCOUNTS.
-- Mogul Maker Academy needs BOTH the parent link and the type; the other three already carry the
-- parent (is_child) and only need the account_type corrected off the wrong 'standalone'.
update public.tenants
   set account_type = 'sub_account',
       parent_tenant_id = '29a7c77f-386a-4060-bf3e-e93de48f742e'
 where id = 'd8a0a880-1bed-43af-9b5d-e23c4db93106';   -- Mogul Maker Academy

update public.tenants
   set account_type = 'sub_account'
 where id in (
   '0334408a-9578-481d-86ba-fbaa00a6b173',            -- [TEST] Acme Consulting
   'f22e625e-f9d0-4467-b298-76c848def329',            -- [TEST] Northstar Advisors
   'e7f1b157-61df-4954-8096-b4b71009bad8'             -- Antonio Daniel LLC
 )
   and parent_tenant_id = '29a7c77f-386a-4060-bf3e-e93de48f742e';  -- guard: only if already PME's child

-- First Sterling Capital + Mogul Credit Company are already 'standalone' (verified) — no change.
-- PME is already 'agency' — no change.

-- ── Part 2d — revenue-class refinement (into the operator-only table from 20260814000000) ─────
-- Backfill already set every tenant 'promotional'. Refine the two that differ from that default:
--   • Retired Paige Operations (SUSPENDED) → internal_test (retired, archived).
-- and stamp Antonio's real comp_reasons on the dogfood/test/promo accounts (operator-internal note).
update public.tenant_revenue_classification
   set revenue_class = 'internal_test',
       comp_reason = 'Retired — already suspended, archived'
 where tenant_id = 'c7222728-e0b6-4ce2-bc2a-401560edd603';         -- Retired Paige Operations

update public.tenant_revenue_classification set comp_reason = v.reason
from (values
  ('29a7c77f-386a-4060-bf3e-e93de48f742e'::uuid, 'Owner parent agency — dogfood'),
  ('d8a0a880-1bed-43af-9b5d-e23c4db93106'::uuid, 'Owner coaching brand — dogfood'),
  ('e7f1b157-61df-4954-8096-b4b71009bad8'::uuid, 'Owner holding co — dogfood'),
  ('0334408a-9578-481d-86ba-fbaa00a6b173'::uuid, 'Test tenant — sub-account of the parent agency'),
  ('f22e625e-f9d0-4467-b298-76c848def329'::uuid, 'Test tenant — sub-account of the parent agency'),
  ('7eaf8859-91b5-429a-92f1-b78c17eed38f'::uuid, 'Solo promotional account'),
  ('cc41dbf4-bfa9-4afd-b09a-a0f718fd1f58'::uuid, 'Owner credit/funding service — dogfood')
) as v(tenant_id, reason)
where public.tenant_revenue_classification.tenant_id = v.tenant_id
  and public.tenant_revenue_classification.revenue_class = 'promotional';

commit;
