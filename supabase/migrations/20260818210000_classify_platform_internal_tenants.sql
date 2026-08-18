-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Classify the platform's OWN tenants as internal, so the operator console counts customers.
--
-- WHY. The Fleet Console reports "TENANTS on the platform". Three of the rows it was counting
-- are not tenants at all — they are the PLATFORM'S OWN scaffolding. Counting them makes the
-- operator's own console overstate the platform's size, which is the §57 divergence in
-- miniature: a surface asserting something the God-level record contradicts. `revenue_class`
-- already carries exactly this axis (`internal_test`, added in 20260814000000); the class was
-- simply never moved off the backfilled 'promotional' default.
--
-- THE LINE, owner-stated (2026-08-18): "the real customers are our currently registered
-- tenants, encapsulated inside of the shells that they belong to… the agency accounts with all
-- of their sub-accounts, and the solo accounts." So the test is BELONGING, not naming: anything
-- inside a customer shell IS a tenant of the Super Admin and stays counted, whatever it is
-- called. Only scaffolding that belongs to NO customer shell is set aside.
--
-- WHAT THIS IS NOT. Nothing is deleted, suspended, renamed, or re-parented. This changes ONE
-- operator-internal classification column. Every one of these tenants keeps working exactly as
-- it does today, and the console shows them behind a "Show internal" chip (§58 — a shipped row
-- is never silently removed).
--
-- SCOPE — top-level rows that belong to NO customer shell (each named, with its evidence):
--   • Paige Platform Defaults   — the platform's own default-set fixture, parented to nothing.
--   • Paige Operator Workspace  — the operator's own workspace (the §63 sanctioned example
--                                 target), parented to nothing.
--   • Test Agency Preview       — a preview agency shell of ours, with no sub-accounts and no
--                                 customer above it.
-- Retired Paige Operations is ALREADY internal_test (20260814100000) and is left alone.
--
-- DELIBERATELY NOT TOUCHED — every sub-account of the customer agency, without exception. That
-- includes the two whose names begin "[TEST]" and the two with no comp_reason at all ("Sample
-- Account LTD", "Unknown Name- 1"). They live inside the agency shell, so by the rule above
-- they ARE tenants of the Super Admin and belong on its fleet. Whether any of them is worth
-- keeping is the owner's call to make on a console that shows them — not a call this migration
-- makes by reading their names (§13).
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
    ('2de8ca80-9d94-45ce-8a5c-89583e321479'::uuid, 'Preview agency shell — no customer above it')
  ) as v(tenant_id, reason)
 where c.tenant_id = v.tenant_id
   -- Guard: only move a row that is still on the backfilled default. A row an operator has
   -- since classified deliberately (paid, or already internal_test) is left exactly as it is.
   and c.revenue_class = 'promotional';
