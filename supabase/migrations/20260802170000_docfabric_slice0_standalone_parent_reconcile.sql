-- Document Fabric — Slice 0: reconcile mislabeled standalone tenants (#589)
--
-- Three tenants carry account_type='standalone' while pointing at the operator
-- tenant (29a7c77f) via parent_tenant_id — a contradictory seam state (§9/§51):
-- a "standalone" tenant should not have a parent. Clear the parent so they become
-- true top-level standalone tenants, aligning the data to the tier model.
--
-- Antonio Daniel LLC (e7f1b157) is DELIBERATELY EXCLUDED. Its owner (ddf3da7c)
-- already owns the operator tenant "Project Mogul Enterprise Inc" (already
-- top-level), so clearing its parent would violate the partial unique index
-- tenants_one_toplevel_per_owner (one parentless tenant per owner). It is tracked
-- as its own follow-up: reassign owner_user_id to Antonio's real user, then clear.
-- (Owner ruling 2026-08-02.)
--
-- The 3 targets below are constraint-safe (proven pre-merge via BEGIN..ROLLBACK):
--   [TEST] Acme Consulting     (owner_user_id NULL — excluded from the index)
--   [TEST] Northstar Advisors  (owner_user_id NULL — excluded from the index)
--   Mogul Maker Academy        (owner b3b0d5a9, owns only this tenant)
--
-- Idempotent: a re-run matches 0 rows (parent already NULL) and re-passes the check.

UPDATE public.tenants
SET parent_tenant_id = NULL
WHERE id IN (
  '0334408a-9578-481d-86ba-fbaa00a6b173',  -- [TEST] Acme Consulting
  'f22e625e-f9d0-4467-b298-76c848def329',  -- [TEST] Northstar Advisors
  'd8a0a880-1bed-43af-9b5d-e23c4db93106'   -- Mogul Maker Academy
)
AND account_type = 'standalone'
AND parent_tenant_id = '29a7c77f-386a-4060-bf3e-e93de48f742e';

-- §13/§32 self-verification: the 3 targets must now be parentless.
DO $$
DECLARE
  _still_parented int;
  _antonio_parent uuid;
BEGIN
  SELECT count(*) INTO _still_parented
  FROM public.tenants
  WHERE id IN (
    '0334408a-9578-481d-86ba-fbaa00a6b173',
    'f22e625e-f9d0-4467-b298-76c848def329',
    'd8a0a880-1bed-43af-9b5d-e23c4db93106'
  ) AND parent_tenant_id IS NOT NULL;

  IF _still_parented <> 0 THEN
    RAISE EXCEPTION 'Slice0 reconcile: expected 0 of the 3 targets still parented, found %', _still_parented;
  END IF;

  -- The carve-out (Antonio Daniel LLC) is intentionally left parented at this
  -- migration's apply time; informational only (a later follow-up clears it).
  SELECT parent_tenant_id INTO _antonio_parent
  FROM public.tenants WHERE id = 'e7f1b157-61df-4954-8096-b4b71009bad8';
  IF _antonio_parent IS NULL THEN
    RAISE NOTICE 'Slice0 reconcile: Antonio Daniel LLC parent already cleared (carve-out follow-up applied).';
  END IF;
END $$;
