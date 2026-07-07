-- =============================================================================
-- SPRINT P.S.M — Phase 2 — FK Harness Smoke Test  [PASSED 2026-07-06]
-- =============================================================================
-- Proves the Approach B mechanism against real constraints before the body run.
-- RESULT: fks_restored = 5; DISABLE/ENABLE TRIGGER USER ran at owner privilege
--         with NO 42501 (the wall that blocked DISABLE TRIGGER ALL). Committed.
-- Scope: the 5 inbound FKs pointing at the 8 loaded pilot tables. The pilot
--        tables themselves carry 0 outbound FKs (hard confirmation of the
--        FK-free pilot). Atomic: any failure rolls back, restoring all FKs.
-- =============================================================================

BEGIN;

-- (1) DISABLE/ENABLE TRIGGER USER at owner privilege — the 42501 question.
ALTER TABLE public.subscription_plans DISABLE TRIGGER USER;
ALTER TABLE public.subscription_plans ENABLE TRIGGER USER;

-- (2) DROP the 5 inbound FKs that point at loaded parent tables.
ALTER TABLE public."clients" DROP CONSTRAINT IF EXISTS "clients_journey_stage_id_fkey";
ALTER TABLE public."paige_journey_stage_transitions" DROP CONSTRAINT IF EXISTS "paige_journey_stage_transitions_from_stage_id_fkey";
ALTER TABLE public."paige_journey_stage_transitions" DROP CONSTRAINT IF EXISTS "paige_journey_stage_transitions_to_stage_id_fkey";
ALTER TABLE public."platform_subscriptions" DROP CONSTRAINT IF EXISTS "platform_subscriptions_plan_id_fkey";
ALTER TABLE public."tenant_agreement_versions" DROP CONSTRAINT IF EXISTS "tenant_agreement_versions_base_template_id_fkey";

-- (3) RE-ADD them (re-add IS the integrity gate) — validates against populated parents.
ALTER TABLE public."clients" ADD CONSTRAINT "clients_journey_stage_id_fkey" FOREIGN KEY (journey_stage_id) REFERENCES paige_journey_stages(id);
ALTER TABLE public."paige_journey_stage_transitions" ADD CONSTRAINT "paige_journey_stage_transitions_from_stage_id_fkey" FOREIGN KEY (from_stage_id) REFERENCES paige_journey_stages(id);
ALTER TABLE public."paige_journey_stage_transitions" ADD CONSTRAINT "paige_journey_stage_transitions_to_stage_id_fkey" FOREIGN KEY (to_stage_id) REFERENCES paige_journey_stages(id);
ALTER TABLE public."platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES platform_subscription_plans(id);
ALTER TABLE public."tenant_agreement_versions" ADD CONSTRAINT "tenant_agreement_versions_base_template_id_fkey" FOREIGN KEY (base_template_id) REFERENCES agreement_templates(id);

-- (4) Prove all 5 are back.
SELECT count(*) AS fks_restored FROM pg_constraint WHERE contype='f' AND conname IN ('clients_journey_stage_id_fkey','paige_journey_stage_transitions_from_stage_id_fkey','paige_journey_stage_transitions_to_stage_id_fkey','platform_subscriptions_plan_id_fkey','tenant_agreement_versions_base_template_id_fkey');
COMMIT;
