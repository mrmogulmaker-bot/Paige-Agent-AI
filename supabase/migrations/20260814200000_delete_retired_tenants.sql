-- Delete two retired tenants — task #29 Part 2b (owner ruled hard-delete-cascade, Antonio 2026-08-09).
--
--   • Paige Operations       (94af805c-6d21-450d-a50b-bbf4dea7571a, ACTIVE) — a CC test account that
--                             never had browser/web access to verify work.
--   • Claude Studio Dev      (49f07ba6-3e4b-445c-87d6-6a4b7d083c33)         — unused dev tenant, no login.
--
-- §30/§39 FK scan (see docs/audits/2026-08-09-tenant-classification-audit.md): both carry ONLY default
-- provisioning artifacts — ZERO real business data (no clients/deals/messages/contacts/tasks).
--
-- SET-NULL universe (§39 Finding 1 — the prior claim of "2 exceptions" was WRONG). The schema has
-- **21** FKs to tenants with ON DELETE SET NULL, not 2. A PERSISTED prod COUNT of all 21 for both
-- targets (run 2026-08-09, project xygzykjyynhzqytbqnzu) found rows in only THREE:
--   • pipeline_stages (10) and pipelines (2) — real config rows → we DELETE these explicitly first
--     (else the bare tenant delete SET-NULLs them into tenant-less orphans).
--   • profiles.active_tenant_id (2) — each target's SOLE test-user's active-tenant pointer. Here
--     SET NULL is the CORRECT, benign end state (the user belongs to no other tenant; on delete their
--     tenant_members row cascades and their active pointer legitimately clears). We NULL it EXPLICITLY
--     below so the behavior is self-documenting, not reliant on the reader checking FK del-actions.
-- The other 18 SET-NULL tables (paige_audit_log, paige_workflow_runs, paige_pending_approvals, clients,
-- deals, tasks, email_send_log, businesses, …) were all 0 for these dormant test tenants — nothing to
-- clean. The 9 ON DELETE CASCADE tables (+ tenant_revenue_classification, #29) drop with the tenant.
-- Auth users are intentionally NOT deleted (not ordered).
-- NOT the SUSPENDED "Retired Paige Operations" (c7222728) — that one stays (classified internal_test).
--
-- Idempotent: `WHERE … IN (targets)` — a re-run after the rows are gone changes nothing.

begin;

-- Clean the SET NULL relations first (avoid NULL-tenant orphans). Stages reference their pipeline, so
-- stages before pipelines.
delete from public.pipeline_stages
 where tenant_id in ('94af805c-6d21-450d-a50b-bbf4dea7571a','49f07ba6-3e4b-445c-87d6-6a4b7d083c33');
delete from public.pipelines
 where tenant_id in ('94af805c-6d21-450d-a50b-bbf4dea7571a','49f07ba6-3e4b-445c-87d6-6a4b7d083c33');

-- profiles.active_tenant_id is ALSO ON DELETE SET NULL. The 2 sole test-users pointing here
-- legitimately lose their active pointer when the tenant goes; clear it EXPLICITLY (self-documenting
-- — identical to the FK's SET NULL, but visible in the migration rather than implicit). The user rows
-- themselves are NOT touched (auth users are kept, not ordered deleted).
update public.profiles set active_tenant_id = null
 where active_tenant_id in ('94af805c-6d21-450d-a50b-bbf4dea7571a','49f07ba6-3e4b-445c-87d6-6a4b7d083c33');

-- The tenant delete cascades the 9 ON DELETE CASCADE tables (+ the #29 classification row).
delete from public.tenants
 where id in ('94af805c-6d21-450d-a50b-bbf4dea7571a','49f07ba6-3e4b-445c-87d6-6a4b7d083c33');

commit;
