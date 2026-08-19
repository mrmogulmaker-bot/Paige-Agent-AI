-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Re-apply the operator-workspace internal_test classification, AFTER the tenant exists.
--
-- DO NOT DELETE THIS AS A DUPLICATE OF 20260818210000. It is deliberately a second, later
-- application of the same UPDATE, and the reason is ORDERING — see below.
--
-- THE DEFECT (a fresh-replay defect, NOT a live prod defect — §13):
--   20260818210000_classify_platform_internal_tenants.sql classifies three platform-scaffolding
--   tenants as `internal_test`, one of which is the Paige Operator Workspace
--   (d1f0a7e2-6c3b-4b9a-9e2d-0a1b2c3d4e5f). But that tenant ROW is created by
--   20260913000000_platform_operator_workspace_tenant.sql, which sorts LATER
--   (20260818210000 < 20260913000000). So on a clean rebuild the chain runs:
--     1. 20260818210000 — UPDATE tenant_revenue_classification … where tenant_id = d1f0a7e2…
--        matches ZERO rows: neither the tenant nor its classification row exists yet.
--     2. 20260913000000 — seeds the d1f0a7e2… row into public.tenants, whose AFTER-INSERT trigger
--        `trg_ensure_tenant_revenue_classification` (20260814000000) creates the classification
--        row at its DEFAULT `revenue_class = 'promotional'`.
--     3. Final state: the operator's own workspace is counted as a `promotional` CUSTOMER on the
--        Fleet Console — precisely the §57 overstatement 20260818210000 exists to prevent.
--   On the CURRENT prod database it happened to come out right: 20260913000000 was applied
--   BEFORE 20260818210000 in wall-clock terms, so the workspace row already existed when the
--   UPDATE ran. Both versions are present in prod `supabase_migrations.schema_migrations`
--   (verified read-only, 2026-08-19). The bug is therefore latent — it only bites a fresh
--   replay (a clean rebuild, a BYO/Phase-3 provision, a branch database).
--
-- WHY A NEW MIGRATION AND NOT A RENAME. 20260818210000 is already applied on prod. Re-timestamping
-- it would make the repo disagree with prod's schema_migrations ledger and invite a re-run. A
-- forward-only history repairs ordering by APPENDING, never by rewriting an applied version.
--
-- SCOPE — the operator workspace ONLY. The other two tenants in 20260818210000 ("Paige Platform
-- Defaults" 5ccc75e0…, "Test Agency Preview" 2de8ca80…) are NOT seeded by any migration; they are
-- live prod rows. On a fresh replay they do not exist at all, so there is nothing to reclassify
-- and no ordering defect to repair for them. Repeating them here would assert a fix that isn't a
-- fix (§13). d1f0a7e2… is the only UUID in that migration whose row is migration-created.
--
-- IDEMPOTENT / NO-OP WHERE ALREADY CORRECT. Same guard as the original: `revenue_class =
-- 'promotional'`. On prod — where the class is already `internal_test` — this matches zero rows
-- and changes nothing. A row an operator has since deliberately classified (`paid`, or already
-- `internal_test`) is likewise left exactly as it is. Nothing is deleted, suspended, renamed, or
-- re-parented; this changes ONE operator-internal classification column (§58).
--
-- §32 — the persisted-apply confirmation (schema_migrations advanced + the row actually carrying
-- the new class) is owed AFTER the deploy-migrations pipeline runs; a rollback proof alone does
-- not make a migration live.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

update public.tenant_revenue_classification c
   set revenue_class = 'internal_test',
       -- Identical reason text to 20260818210000, so both orderings converge on the same row.
       comp_reason   = coalesce(nullif(c.comp_reason, ''), 'Operator workspace — not a customer')
 where c.tenant_id = 'd1f0a7e2-6c3b-4b9a-9e2d-0a1b2c3d4e5f'::uuid
   -- Guard: only move a row that is still on the backfilled default. A row an operator has
   -- since classified deliberately (paid, or already internal_test) is left exactly as it is.
   and c.revenue_class = 'promotional';
