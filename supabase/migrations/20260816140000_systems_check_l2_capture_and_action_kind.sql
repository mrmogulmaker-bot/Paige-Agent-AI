-- Systems Check MVP — Layer 2: §38 capture fields + the remediation action-kind (task #80, follows
--   20260816000000_systems_check_layer1.sql). This migration is the DATA half of L2; the runner CORE
--   (_shared/systems-check-runner.ts) + the 10 runner modules + the 3 flavor edge fns are code.
--
-- WHAT THIS MIGRATION DOES (all additive, idempotent, §2-clean, §9 tenant-authored capture fields):
--   (a) Two §38 PROCESSOR-AGNOSTIC capture columns on tenants (payment_processor_declared,
--       payment_methods_declared) so checks #9/#10 read a tenant-DECLARED field instead of assuming Stripe.
--       (Social handles for check #3 need NO DDL — they live at tenants.features->'social_handles', a jsonb
--        key on the already-present tenants.features column; see §38 note below.)
--   (b) The §38 CORRECTION to registry row #10 (payment_method_options): flip its runner_key +
--       data_source off the Stripe-native read onto the processor-agnostic declared-field read.
--   (c) The 'systems.remediate' platform-default action-kind so a failed check can be filed onto the
--       action bus (SPINE #1) and drafted → routed to the owner (§16 confirm lane / §36 draft-first).
--
-- §38 (owner-locked): every tenant-side Systems Check must be PROCESSOR/VENDOR-AGNOSTIC — a runner never
--   assumes what a tenant uses for anything Paige does not own (payments, comms, calendar, storage); it
--   reads a tenant-DECLARED field. Per-processor deep-verify (reading a connected Stripe account's live
--   methods) is a POST-MVP Playbook slice, NOT the MVP default. Assumption-baking is a §38 violation
--   regardless of build-cost. This migration is the schema side of that correction (master-doc §10 miss #28).
--
-- §9 — these are TENANT-authored capture fields on the tenants table; they inherit tenants' RLS (no policy
--   change). A tenant declares its own processor/methods; the operator never seeds a vertical default here.
-- §2 — no credit/funding/lender vocabulary anywhere. 'bank_merchant'/'quickbooks_payments'/'ach'/'wire' are
--   generic service-business payment facts, not consumer credit.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) §38 processor-agnostic capture columns on tenants.
--     • payment_processor_declared — WHICH processor the tenant says they use (single choice). Checked
--       against a closed enum set OR null (not-yet-declared). Check #9 passes when it is NOT 'not_yet'.
--     • payment_methods_declared   — WHICH methods the tenant says they accept (multi). text[] with an
--       array-containment CHECK so every element is in the allowed set. Check #10 passes when length>=1.
--     Social handles (check #3) deliberately need NO column: they live at tenants.features->'social_handles'
--     (jsonb) — tenants.features is already a jsonb column (added 20260629181820), so §18 says extend that
--     config-as-data home rather than add a sibling column. The runner reads features->'social_handles'.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.tenants
  add column if not exists payment_processor_declared text,
  add column if not exists payment_methods_declared  text[] not null default '{}'::text[];

-- Closed enum for the single-choice processor (idempotent: drop-then-add so a re-run stays clean).
alter table public.tenants drop constraint if exists tenants_payment_processor_declared_chk;
alter table public.tenants
  add constraint tenants_payment_processor_declared_chk
  check (
    payment_processor_declared is null
    or payment_processor_declared in
       ('stripe','paypal','square','bank_merchant','quickbooks_payments','manual','not_yet')
  );

-- Array-subset guard: every declared method must be in the allowed set (empty array trivially passes).
alter table public.tenants drop constraint if exists tenants_payment_methods_declared_chk;
alter table public.tenants
  add constraint tenants_payment_methods_declared_chk
  check (
    payment_methods_declared <@
      array['cards','ach','zelle','wire','check','cash','bank_transfer','crypto','other']::text[]
  );

comment on column public.tenants.payment_processor_declared is
  '§38 processor-agnostic Systems Check capture: which processor the tenant declares they use (stripe|paypal|square|bank_merchant|quickbooks_payments|manual|not_yet), or null if not yet declared. Check #9 (payment_processor_connected) passes when this is set and NOT ''not_yet''. Paige never assumes Stripe (§38).';
comment on column public.tenants.payment_methods_declared is
  '§38 processor-agnostic Systems Check capture: which payment methods the tenant declares they accept (subset of cards|ach|zelle|wire|check|cash|bank_transfer|crypto|other). Check #10 (payment_method_options) passes when length>=1. Not read from any processor API (§38 — per-processor deep-verify is post-MVP).';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) §38 CORRECTION to registry row #10 — flip off the Stripe-native read onto the declared-field read.
--     L1 seeded check_id='payment_method_options' with runner_key='stripe_payment_methods_read' +
--     data_source='external_vendor' (the pre-§38 Stripe assumption). Correct it in place, idempotently.
--     (Master-doc §10 miss #28: Stripe-native → processor-agnostic.)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
update public.paige_systems_check_registry
   set runner_key  = 'payment_methods_declared',
       data_source = 'native_seam',
       updated_at  = now()
 where check_id = 'payment_method_options'
   and (runner_key <> 'payment_methods_declared' or data_source <> 'native_seam');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) The 'systems.remediate' platform-default action-kind (paige_action_kinds, SPINE #1).
--     A failed check files onto the bus AS this kind; the runner core overrides p_to_department per
--     finding so it routes to the owning desk (§16). Shape copied from the org-departments seed
--     (20260720200830) — a platform default (tenant_id NULL), coaching-generic, §2-clean.
--
--     autonomy_lane='confirm' (🟡 §16 AI-Drafted/Human-Approved): Paige drafts the fix, the owner
--       approves — draft-first (§36), never auto-executed.
--     executor='record_only' + requires_approval=false: the fix is a drafted WORK ITEM that holds in
--       the queue as a suggestion for the owner (advance_action holds a confirm-lane record_only draft at
--       'drafted') — NOT a customer send, so it is NOT 'send_via_approval'. The schema guardrails hold
--       (send_via_approval⇒requires_approval; auto⇒record_only/workflow), so 'auto-send' stays
--       unrepresentable. draft_subagent_slug is NULL — the runner core forges the draft directly.
--     from='operations_pmo' (the systems-check desk detected it) / to='technology_automation' (a sensible
--       default; overridden per finding to the failed check's owning department).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.paige_action_kinds
 (slug,label,description,default_from_department,default_to_department,executor,requires_approval,approval_type,draft_subagent_slug,default_autonomy_lane,default_priority) values
 ('systems.remediate',
  'Systems check remediation',
  'Paige drafts a fix for a failed Systems Check and files it to the owning department for the owner to review and approve.',
  'operations_pmo','technology_automation','record_only',false,'other',NULL,'confirm','normal')
on conflict (slug) do nothing;

commit;
