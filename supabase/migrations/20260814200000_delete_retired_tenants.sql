-- Delete two retired tenants — task #29 Part 2b (owner ruled hard-delete-cascade, Antonio 2026-08-09).
--
--   • Paige Operations       (94af805c-6d21-450d-a50b-bbf4dea7571a, ACTIVE) — a CC test account that
--                             never had browser/web access to verify work.
--   • Claude Studio Dev      (49f07ba6-3e4b-445c-87d6-6a4b7d083c33)         — unused dev tenant, no login.
--
-- §30 FK scan (see docs/audits/2026-08-09-tenant-classification-audit.md): both carry ONLY default
-- provisioning artifacts (calendar, channel_connector, paige_actions, tenant_features, 1 member,
-- tenant_provisioning, tenant_email_identities, platform_usage_events, +twilio for Claude Dev) — ZERO
-- real business data (no clients/deals/messages/contacts/tasks). 9 of those FK tables are ON DELETE
-- CASCADE, so the tenant DELETE cleans them automatically. The 2 exceptions — `pipelines` and
-- `pipeline_stages` — are ON DELETE SET NULL, which would ORPHAN their rows (tenant_id → NULL) on a
-- bare tenant delete; so we delete THOSE rows explicitly FIRST. tenant_revenue_classification (#29) is
-- ON DELETE CASCADE and drops with the tenant. Auth users are intentionally NOT deleted (not ordered).
-- NOT the SUSPENDED "Retired Paige Operations" (c7222728) — that one stays (classified internal_test).
--
-- Idempotent: `WHERE … IN (targets)` — a re-run after the rows are gone deletes nothing.

begin;

-- Clean the SET NULL relations first (avoid NULL-tenant orphans). Stages reference their pipeline, so
-- stages before pipelines.
delete from public.pipeline_stages
 where tenant_id in ('94af805c-6d21-450d-a50b-bbf4dea7571a','49f07ba6-3e4b-445c-87d6-6a4b7d083c33');
delete from public.pipelines
 where tenant_id in ('94af805c-6d21-450d-a50b-bbf4dea7571a','49f07ba6-3e4b-445c-87d6-6a4b7d083c33');

-- The tenant delete cascades the 9 ON DELETE CASCADE tables (+ the #29 classification row).
delete from public.tenants
 where id in ('94af805c-6d21-450d-a50b-bbf4dea7571a','49f07ba6-3e4b-445c-87d6-6a4b7d083c33');

commit;
