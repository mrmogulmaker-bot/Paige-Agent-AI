-- Systems Check L2 hotfix — grant service_role DML on the four paige_systems_check_* tables.
--
-- ROOT CAUSE (found by the L2 §32.c headless live-drive, 2026-08-10 — the exact defect class §32
-- exists to catch: a green proof is NOT a working runtime):
--   The L1 migration (20260816000000_systems_check_layer1.sql) granted table privileges to the
--   `authenticated` role but NOT to `service_role`. The runner core (systems-check-runner.ts) reads
--   the catalog and writes run/finding rows through the SERVICE-ROLE edge client (adminClient()), so
--   at runtime it hit:  permission denied for table paige_systems_check_registry.
--   The BEGIN..ROLLBACK §32.b proofs never surfaced this because they ran as the table OWNER, never
--   as service_role — so the privilege gap was invisible until the function was actually invoked.
--
-- service_role bypasses RLS but STILL needs table-level GRANTs. Every other Paige table grants
-- service_role full DML (e.g. paige_owner_memory: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,
-- UPDATE); these four tables were the outlier. This restores parity.
--
-- §9/§51 UNCHANGED: FORCE RLS + the existing tenant/owner policies still gate every `authenticated`
-- read/write. service_role is the trusted server writer the runner core already self-scopes by
-- tenantId — granting it DML does not widen any tenant's access, it only lets the server writer
-- reach the tables it was always meant to.
-- Idempotent: GRANT is a no-op if the privilege already exists.

begin;

grant select, insert, update, delete on
  public.paige_systems_check_registry,
  public.paige_systems_check_run,
  public.paige_systems_check_finding,
  public.paige_systems_check_baseline
  to service_role;

-- Same defect, THREE more read-only dependencies: the runner modules read these tenant tables via the
-- service-role client, and all three had NO service_role grant (42501 permission denied at runtime —
-- surfaced by the same §32.c drive; enumerated by checking service_role grants across every table the
-- runners `.from()`, so this is the COMPLETE grant set, not a one-at-a-time patch):
--   • tenant_workflows        — external_automation_detected (automation_wired)
--   • tenant_mcp_connections  — external_automation_detected (automation_wired)
--   • tenant_email_identities — comms_configured
-- The runners only READ them, so SELECT suffices (minimal privilege, §13). §9/§51 unchanged — each table
-- keeps its own RLS; service_role is the trusted server reader the runner already scopes by tenant_id.
-- (The other tables the runners read — clients, growth_pages, pipelines, pipeline_stages, signup_intake,
--  tenant_phone_numbers, tenants — already grant service_role full DML; these three were the outliers.)
grant select on public.tenant_workflows        to service_role;
grant select on public.tenant_mcp_connections  to service_role;
grant select on public.tenant_email_identities to service_role;

commit;
