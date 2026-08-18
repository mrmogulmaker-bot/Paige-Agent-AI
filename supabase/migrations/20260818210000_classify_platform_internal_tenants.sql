-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Classify the platform's OWN tenants as internal, so the operator console counts customers.
--
-- WHY. The Fleet Console reports "TENANTS on the platform". Five of the rows it was counting
-- are not customers at all — they are our own fixtures and test accounts. Counting them makes
-- the operator's own console overstate the platform's size, which is the §57 divergence in
-- miniature: a surface asserting something the God-level record contradicts. `revenue_class`
-- already carries exactly this axis (`internal_test`, added in 20260814000000), and three of
-- these rows already carry a `comp_reason` that SAYS they are test tenants — the class was
-- simply never moved off the backfilled 'promotional' default.
--
-- WHAT THIS IS NOT. Nothing is deleted, suspended, renamed, or re-parented. This changes ONE
-- operator-internal classification column. Every one of these tenants keeps working exactly as
-- it does today, and the console shows them behind a "Show internal" chip (§58 — a shipped row
-- is never silently removed).
--
-- SCOPE (each named, with the evidence for calling it internal):
--   • Paige Platform Defaults        — the platform's own default-set fixture, not a customer.
--   • Paige Operator Workspace       — the operator's own workspace (the §63 sanctioned target
--                                      for examples), not a customer.
--   • Test Agency Preview            — a preview/test agency.
--   • [TEST] Northstar Advisors      — already carries comp_reason 'Test tenant — …'.
--   • [TEST] Acme Consulting         — already carries comp_reason 'Test tenant — …'.
-- Retired Paige Operations is ALREADY internal_test (20260814100000) and is left alone.
--
-- DELIBERATELY NOT TOUCHED. Two of the agency's sub-accounts ("Sample Account LTD",
-- "Unknown Name- 1") look like leftovers but carry no evidence either way — each has a real
-- active member and no test marker. Misclassifying a real account as internal would hide a
-- customer from the fleet, which is worse than showing one row too many, so they stay visible
-- and are raised for an owner ruling instead of guessed at (§13).
--
-- §32 — the persisted-apply confirmation (schema_migrations advanced + the rows actually
-- carrying the new class) is owed AFTER the deploy-migrations pipeline runs; a rollback proof
-- alone does not make a migration live.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

update public.tenant_revenue_classification c
   set revenue_class = 'internal_test',
       comp_reason   = coalesce(nullif(c.comp_reason, ''), v.reason)
  from (values
    ('5ccc75e0-cd90-427d-85c5-a443c205800f'::uuid, 'Platform default-set fixture — not a customer'),
    ('d1f0a7e2-6c3b-4b9a-9e2d-0a1b2c3d4e5f'::uuid, 'Operator workspace — not a customer'),
    ('2de8ca80-9d94-45ce-8a5c-89583e321479'::uuid, 'Test agency — not a customer'),
    ('f22e625e-f9d0-4467-b298-76c848def329'::uuid, 'Test tenant — not a customer'),
    ('0334408a-9578-481d-86ba-fbaa00a6b173'::uuid, 'Test tenant — not a customer')
  ) as v(tenant_id, reason)
 where c.tenant_id = v.tenant_id
   -- Guard: only move a row that is still on the backfilled default. A row an operator has
   -- since classified deliberately (paid, or already internal_test) is left exactly as it is.
   and c.revenue_class = 'promotional';
