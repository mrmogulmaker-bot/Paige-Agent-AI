-- ─────────────────────────────────────────────────────────────────────────────
-- Remove the starter auto-provisioner (owner directive, 2026-08-16)
--
-- OWNER RULING: "NEVER MAKE ANYONE DEFAULT TO ANYTHING; the platform must NOT
-- auto-build a business the tenant didn't ask for. EVERYONE goes through Setup and
-- chooses (playbook/pipeline/calendar) via the marketplace/Setup."
--
-- 20260711180000_starter_business_provisioner.sql fired on EVERY new tenant and
-- seeded a GUESSED playbook + a generic "Sales Pipeline" + a draft "Consultation"
-- calendar. This forward migration DELETES that auto-seeding at the source. Every
-- create/update/delete stays fully tenant-CHOSEN in Setup — none of the general-
-- purpose RPCs (set_tenant_playbook / create_pipeline_with_stages / create_calendar)
-- are touched; they remain how a tenant builds these ON DEMAND.
--
-- §37 PRODUCER INVENTORY (verified before dropping): the ONLY callers of the
-- orchestration functions were (a) the AFTER-INSERT trigger and (b) the pg_cron
-- drain — both removed below. Grep across src/** (excluding the generated
-- integrations/supabase/types.ts), supabase/functions/**, and supabase/migrations/**
-- found NO edge function, no Paige/MCP tool, and no paige_action_kinds executor that
-- invokes run_starter_provisioning / seed_starter_business / the queue drainer.
-- run_starter_provisioning carried an `authenticated` grant ("owner re-drives via
-- Paige"), but no such tool was ever wired, so no still-wanted caller breaks.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Stop ALL new-tenant auto-seeding at the source ───────────────────────────
DROP TRIGGER IF EXISTS trg_tenants_seed_starter_business ON public.tenants;

-- ── 2. Unschedule the drain cron (idempotent — no-op if already gone) ────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'starter-provisioning-drain') THEN
    PERFORM cron.unschedule('starter-provisioning-drain');
  END IF;
END $$;

-- ── 3. Drop the orchestration functions that ONLY exist to auto-seed ────────────
-- plpgsql function-to-function calls are late-bound (no pg_depend), so drop order is
-- irrelevant; the trigger (step 1) and cron (step 2) — their only invokers — are gone.
DROP FUNCTION IF EXISTS public.process_starter_provisioning_queue();
DROP FUNCTION IF EXISTS public.run_starter_provisioning(uuid, boolean, text[]);
DROP FUNCTION IF EXISTS public.seed_starter_business(uuid);
DROP FUNCTION IF EXISTS public.trg_seed_starter_business();

-- ── 4. Neutralize the two action kinds that existed ONLY to record the auto tree ─
-- DISABLE (not DELETE): public.paige_actions.action_kind has an FK to
-- paige_action_kinds(slug), and the worker already filed real, audit-bearing action
-- rows under these slugs on prod. Deleting the kinds would violate that FK (or orphan
-- audit history, §58). Disabling removes the exposure — Paige can never offer to
-- auto-build a starter business — while preserving the historical rows (§13).
UPDATE public.paige_action_kinds
   SET enabled = false
 WHERE slug IN ('owner.provision_starter_business', 'owner.provision_step')
   AND tenant_id IS NULL;

-- ── 5. What is deliberately LEFT untouched ───────────────────────────────────────
--  • resolve_starter_playbook_slug(text) — LEFT defined but now unreferenced
--    (harmless; nothing else calls it — subaccount_inheritance only mentions it in a
--    comment). Kept to avoid a needless drop of a pure IMMUTABLE helper.
--  • set_tenant_playbook / create_calendar / create_pipeline_with_stages — KEPT: these
--    are the general-purpose, tenant-CHOSEN RPCs Setup/marketplace drive on demand.
--  • public.tenant_provisioning table — LEFT in place (dropping it is out of scope).
--    Now DORMANT: the trigger no longer writes to it and the drain is unscheduled.
--  • provision_tenant / ensure_provisioning_entitlements — the genuinely-required
--    provisioning (entitlements/subscription/membership) — NOT modified.
