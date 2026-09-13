-- Layer C · C5 slice 2 — companion-minting + cancellation-sync + direct-approve guard + durable reconciler.
-- Behavioural proof against the schema `supabase db reset` replayed from zero (house pgTAP style; synthetic
-- opaque fixtures; the enclosing transaction is ALWAYS rolled back — no production/customer records).
--
-- Fixtures are seeded with the fixture tables' FK constraints dropped + their USER triggers disabled (owner-
-- privilege, inside the rolled-back txn — CI's session does not honor session_replication_role), so exact
-- timestamps and orphan states can be constructed without a full parent graph; the TRIGGERS UNDER TEST are
-- then RE-ENABLED and exercised via real INSERT/UPDATE, and the reconciler is called as the cron/service
-- context (auth.uid() NULL) exactly as pg_cron invokes it.
begin;
select plan(34);

-- ── Fixture ids ───────────────────────────────────────────────────────────────────────────────────────
-- tenant, events (E1..E8), acts (AC1..AC8), ledger rows (AD1..AD8), clients (C1,C5..C8).
-- E4/AD4 is an already-EXECUTED act (the cancellation no-clobber control). E5..E8 are reconciler orphans.

-- Seed the tenant in NORMAL mode (triggers ON) so its account_number-assignment trigger fires — the exact
-- column set + mode the passing contract tests use. `account_number` is NOT NULL and trigger-assigned;
-- seeding it with triggers disabled would suppress that trigger and the insert would violate NOT NULL.
-- tenants is a root table (no inbound FK deps here), so a triggers-on insert is safe and done up front.
insert into public.tenants(id, slug, name, status, account_type, account_number_prefix, features) values
  ('11111111-1111-4111-8111-111111111111', 'paige-c5s2-proof-tenant', 'Paige C5S2 Proof Tenant', 'active', 'standalone', 'PC5', '{}'::jsonb);

-- CI's supabase-test-db session does not honor session_replication_role (it is superuser-gated), so seed
-- WITHOUT a full parent graph using OWNER-privilege operations instead (postgres owns these tables): drop the
-- FK constraints on the three fixture tables and disable their USER triggers while seeding, so held/ambiguous
-- rows can be inserted with synthetic un-parented ids + explicit timestamps and the mint does not auto-fire.
-- Everything here is inside the enclosing BEGIN…ROLLBACK, so these schema changes revert with the transaction.
do $$
declare r record;
begin
  for r in
    select conrelid::regclass::text as tbl, conname
      from pg_constraint
     where contype = 'f'
       and conrelid in ('public.paige_act_executions'::regclass,
                        'public.paige_native_events'::regclass,
                        'public.paige_journey_stage_transitions'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.paige_act_executions    disable trigger user;   -- mint + touch(updated_at) off while seeding
alter table public.paige_pending_approvals disable trigger user;   -- policy/notify/sync/guard off while seeding

-- Native events (processing_state='done' = the orphan case the sweeper cannot re-drive).
insert into public.paige_native_events(id, event_key, tenant_id, subject_table, subject_id, dedup_key, processing_state) values
  ('1e000001-0000-4000-8000-000000000001','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-1','done'),
  ('1e000002-0000-4000-8000-000000000002','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-2','done'),
  ('1e000003-0000-4000-8000-000000000003','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-3','done'),
  ('1e000004-0000-4000-8000-000000000004','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-4','done'),
  ('1e000005-0000-4000-8000-000000000005','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000005-0000-4000-8000-000000000005','dk-5','done'),
  ('1e000006-0000-4000-8000-000000000006','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000006-0000-4000-8000-000000000006','dk-6','done'),
  ('1e000007-0000-4000-8000-000000000007','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000007-0000-4000-8000-000000000007','dk-7','done'),
  ('1e000008-0000-4000-8000-000000000008','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000008-0000-4000-8000-000000000008','dk-8','done');

-- L1..L3: held acts seeded at accepted_for_execution (NO companion yet — the mint trigger is disabled during
-- seeding). They are transitioned into approval_pending after the triggers are re-enabled below, which fires
-- the mint. detail carries the engine's snapshot + risk.
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, detail) values
  ('ad000001-0000-4000-8000-000000000001','1e000001-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001','ac000001-0000-4000-8000-000000000001',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','accepted_for_execution','idem-1','corr-1', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','engaged'), 'risk','high')),
  ('ad000002-0000-4000-8000-000000000002','1e000002-0000-4000-8000-000000000002','a0000002-0000-4000-8000-000000000002','ac000002-0000-4000-8000-000000000002',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','accepted_for_execution','idem-2','corr-2', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','won'), 'risk','ordinary')),
  ('ad000003-0000-4000-8000-000000000003','1e000003-0000-4000-8000-000000000003','a0000003-0000-4000-8000-000000000003','ac000003-0000-4000-8000-000000000003',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','accepted_for_execution','idem-3','corr-3', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','lead')));

-- L4: an already-EXECUTED held act + its still-pending companion (the cancellation no-clobber control).
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, settled_at, detail) values
  ('ad000004-0000-4000-8000-000000000004','1e000004-0000-4000-8000-000000000004','a0000004-0000-4000-8000-000000000004','ac000004-0000-4000-8000-000000000004',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','executed','idem-4','corr-4', now(), '{}'::jsonb);
insert into public.paige_pending_approvals(type, draft_content, category, tenant_id, source, status, risk_level, metadata) values
  ('other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending','medium',
   jsonb_build_object('source','paige_orchestration','event_id','1e000004-0000-4000-8000-000000000004','act_id','ac000004-0000-4000-8000-000000000004'));

-- L5..L8: reconciler orphans (ambiguous, event done). updated_at backdated past the 10-min staleness bar
-- (except L8, which is fresh → must be EXCLUDED). created_at controls the 24h hard-fail deadline.
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, detail, created_at, updated_at, dispatched_at) values
  ('ad000005-0000-4000-8000-000000000005','1e000005-0000-4000-8000-000000000005','a0000005-0000-4000-8000-000000000005','ac000005-0000-4000-8000-000000000005',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-5','corr-5', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','engaged')), now()-interval '20 minutes', now()-interval '20 minutes', now()-interval '20 minutes'),
  ('ad000006-0000-4000-8000-000000000006','1e000006-0000-4000-8000-000000000006','a0000006-0000-4000-8000-000000000006','ac000006-0000-4000-8000-000000000006',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-6','corr-6', '{}'::jsonb, now()-interval '25 hours', now()-interval '20 minutes', now()-interval '25 hours'),
  ('ad000007-0000-4000-8000-000000000007','1e000007-0000-4000-8000-000000000007','a0000007-0000-4000-8000-000000000007','ac000007-0000-4000-8000-000000000007',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-7','corr-7', '{}'::jsonb, now()-interval '20 minutes', now()-interval '20 minutes', now()-interval '20 minutes'),
  ('ad000008-0000-4000-8000-000000000008','1e000008-0000-4000-8000-000000000008','a0000008-0000-4000-8000-000000000008','ac000008-0000-4000-8000-000000000008',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-8','corr-8', '{}'::jsonb, now(), now(), now());

-- Companions (pending) for the reconciler orphans that will be resolved (L5 + L6).
insert into public.paige_pending_approvals(type, draft_content, category, tenant_id, source, status, risk_level, metadata) values
  ('other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending','medium',
   jsonb_build_object('source','paige_orchestration','event_id','1e000005-0000-4000-8000-000000000005','act_id','ac000005-0000-4000-8000-000000000005')),
  ('other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending','medium',
   jsonb_build_object('source','paige_orchestration','event_id','1e000006-0000-4000-8000-000000000006','act_id','ac000006-0000-4000-8000-000000000006'));

-- The landed transition for L5 (contact = the event subject, source_event = the act's correlation_ref).
insert into public.paige_journey_stage_transitions(contact_id, to_stage_id, source_event) values
  ('c0000005-0000-4000-8000-000000000005', 1, 'corr-5');

-- A NON-orchestration approval (the direct-approve guard must NOT touch it).
insert into public.paige_pending_approvals(id, type, draft_content, category, tenant_id, source, status, metadata) values
  ('9a000001-0000-4000-8000-000000000001','cs_draft','{}'::jsonb,'followup','11111111-1111-4111-8111-111111111111','paige_action_bus','pending','{}'::jsonb);

-- §59 cancellation-sync guard fixtures: two held acts + companions in tenant …1111, and an ACTIVE membership
-- for the legit approver (…7777) but NONE for the foreign caller (…8888). (event_id FKs bypassed in replica.)
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, detail) values
  ('ad000009-0000-4000-8000-000000000009','1e000009-0000-4000-8000-000000000009','a0000009-0000-4000-8000-000000000009','ac000009-0000-4000-8000-000000000009',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','approval_pending','idem-9','corr-9', '{}'::jsonb),
  ('ad00000a-0000-4000-8000-00000000000a','1e00000a-0000-4000-8000-00000000000a','a000000a-0000-4000-8000-00000000000a','ac00000a-0000-4000-8000-00000000000a',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','approval_pending','idem-a','corr-a', '{}'::jsonb);
insert into public.paige_pending_approvals(id, type, draft_content, category, tenant_id, source, status, metadata) values
  ('9a000009-0000-4000-8000-000000000009','other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending',
   jsonb_build_object('source','paige_orchestration','event_id','1e000009-0000-4000-8000-000000000009','act_id','ac000009-0000-4000-8000-000000000009')),
  ('9a00000a-0000-4000-8000-00000000000a','other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending',
   jsonb_build_object('source','paige_orchestration','event_id','1e00000a-0000-4000-8000-00000000000a','act_id','ac00000a-0000-4000-8000-00000000000a'));
insert into public.tenant_members(user_id, tenant_id, status) values
  ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','active');

-- Re-enable the user triggers — now exercise the seams under test (mint on the UPDATE→approval_pending;
-- cancellation-sync + direct-approve guard on companion status UPDATEs). The FK constraints stay dropped for
-- the remainder of this transaction (reverted at ROLLBACK); the reconciler/guards read rows, not FKs.
alter table public.paige_act_executions    enable trigger user;
alter table public.paige_pending_approvals enable trigger user;

-- ══ (A) MINT: transitioning a ledger row into approval_pending mints exactly one companion ══════════════
update public.paige_act_executions set outcome='approval_pending' where id='ad000001-0000-4000-8000-000000000001';

select is((select count(*)::int from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          1, 'mint: exactly one companion approval for the held act');
select is((select type from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'other', 'mint: type is other (valid CHECK enum for a native held act)');
select is((select category from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'crm.advance_journey_stage', 'mint: category is the capability_key');
select is((select source from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'paige_orchestration', 'mint: source is paige_orchestration');
select is((select status from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'pending', 'mint: status pending');
select is((select risk_level from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'high', 'mint: risk_level high mapped from detail.risk=high');
select ok((select contact_id is null from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'mint: contact_id is NULL (§9 — the held act never leaks into the client portal)');
select is((select draft_content::text from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          '{}', 'mint: draft_content is empty object');
select is((select metadata->>'event_id' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          '1e000001-0000-4000-8000-000000000001', 'mint: metadata.event_id carried');
select is((select metadata->>'act_execution_id' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'ad000001-0000-4000-8000-000000000001', 'mint: metadata.act_execution_id carried');
select is((select metadata->>'capability_id' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'crm.advance_journey_stage', 'mint: metadata.capability_id carried');
select is((select metadata->'snapshot_args'->>'stage_slug' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'engaged', 'mint: metadata.snapshot_args carried (the immutable governed args the reviewer sees)');
select ok((select submitted_by_user_id is null from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'mint: submitted_by_user_id NULL (proposed by Paige autonomously; no submitting human)');

-- risk mapping: 'ordinary' and absent both map to medium.
update public.paige_act_executions set outcome='approval_pending' where id='ad000002-0000-4000-8000-000000000002';
update public.paige_act_executions set outcome='approval_pending' where id='ad000003-0000-4000-8000-000000000003';
select is((select risk_level from public.paige_pending_approvals where metadata->>'act_id'='ac000002-0000-4000-8000-000000000002'),
          'medium', 'mint: risk_level medium mapped from detail.risk=ordinary');
select is((select risk_level from public.paige_pending_approvals where metadata->>'act_id'='ac000003-0000-4000-8000-000000000003'),
          'medium', 'mint: risk_level medium mapped when detail.risk absent');

-- ══ (B) IDEMPOTENCY: a re-derive that leaves outcome at approval_pending does not double-mint ═══════════
update public.paige_act_executions set detail = detail || '{"redrain":true}'::jsonb where id='ad000001-0000-4000-8000-000000000001';
select is((select count(*)::int from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          1, 'idempotency: a re-derive (outcome stays approval_pending) never double-mints');
select ok((select (tgtype & 4) > 0 and (tgtype & 16) > 0 from pg_trigger where tgname='trg_paige_mint_orchestration_approval'),
          'mint trigger is wired AFTER INSERT OR UPDATE (fires on the real INSERT prod path too)');

-- ══ (C) CANCELLATION-SYNC: an inbox reject/skip settles a still-held act to cancelled, never clobbers ═══
update public.paige_pending_approvals set status='rejected' where source='paige_orchestration' and metadata->>'act_id'='ac000001-0000-4000-8000-000000000001';
select is((select outcome::text from public.paige_act_executions where id='ad000001-0000-4000-8000-000000000001'),
          'cancelled', 'cancellation-sync: reject settles the held act to cancelled');
select ok((select refusal_code = 'approval_rejected' from public.paige_act_executions where id='ad000001-0000-4000-8000-000000000001'),
          'cancellation-sync: refusal_code records the decline reason');
update public.paige_pending_approvals set status='skipped' where source='paige_orchestration' and metadata->>'act_id'='ac000002-0000-4000-8000-000000000002';
select is((select outcome::text from public.paige_act_executions where id='ad000002-0000-4000-8000-000000000002'),
          'cancelled', 'cancellation-sync: skip settles the held act to cancelled');
update public.paige_pending_approvals set status='rejected' where source='paige_orchestration' and metadata->>'act_id'='ac000004-0000-4000-8000-000000000004';
select is((select outcome::text from public.paige_act_executions where id='ad000004-0000-4000-8000-000000000004'),
          'executed', 'cancellation-sync: reject does NOT clobber an already-executed act (guarded on approval_pending)');

-- §59 in-body caller-scope guard: a JWT caller NOT in the act's tenant cannot cancel it (the weak table RLS
-- may let them flip the status, but the ledger effect is refused); an active member of the tenant can.
set request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';   -- foreign admin, not a member of …1111
update public.paige_pending_approvals set status='rejected' where id='9a000009-0000-4000-8000-000000000009';
reset request.jwt.claim.sub;
select is((select outcome::text from public.paige_act_executions where id='ad000009-0000-4000-8000-000000000009'),
          'approval_pending', 'cancellation-sync §59: a cross-tenant JWT caller does NOT cancel the held act (safe degrade)');
set request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';   -- active member of …1111
update public.paige_pending_approvals set status='rejected' where id='9a00000a-0000-4000-8000-00000000000a';
reset request.jwt.claim.sub;
select is((select outcome::text from public.paige_act_executions where id='ad00000a-0000-4000-8000-00000000000a'),
          'cancelled', 'cancellation-sync §59: an active member of the act''s tenant DOES cancel the held act');

-- ══ (D) DIRECT-APPROVE GUARD: an orchestration approval reaches approved ONLY with an act_outcome stamp ═
select throws_ok(
  $$ update public.paige_pending_approvals set status='approved' where source='paige_orchestration' and metadata->>'act_id'='ac000003-0000-4000-8000-000000000003' $$,
  '42501', NULL,
  'direct-approve guard: an orchestration approval cannot be approved without the executor''s act_outcome stamp');
select lives_ok(
  $$ update public.paige_pending_approvals set status='approved', metadata = metadata || '{"act_outcome":"executed"}'::jsonb where source='paige_orchestration' and metadata->>'act_id'='ac000003-0000-4000-8000-000000000003' $$,
  'direct-approve guard: an orchestration approval WITH act_outcome (the executor path) is allowed');
select lives_ok(
  $$ update public.paige_pending_approvals set status='approved' where id='9a000001-0000-4000-8000-000000000001' $$,
  'direct-approve guard: a NON-orchestration approval is unaffected (fast no-op)');

-- ══ (E) DURABLE RECONCILER: orphaned advanceable native acts the sweeper cannot re-drive ═══════════════
select public.paige_reconcile_orchestration_acts();

select is((select outcome::text from public.paige_act_executions where id='ad000005-0000-4000-8000-000000000005'),
          'executed', 'reconciler: a landed correlation transition advances the orphan to executed');
select is((select status from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000005-0000-4000-8000-000000000005'),
          'approved', 'reconciler: the companion approval is stamped approved (§70 inbox stays truthful)');
select is((select metadata->>'act_outcome' from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000005-0000-4000-8000-000000000005'),
          'executed', 'reconciler: the companion carries act_outcome=executed');
select is((select outcome::text from public.paige_act_executions where id='ad000006-0000-4000-8000-000000000006'),
          'failed', 'reconciler: >24h with no stamped transition advances to failed (never a silent forever-ambiguous)');
select is((select refusal_code from public.paige_act_executions where id='ad000006-0000-4000-8000-000000000006'),
          'reconcile_exhausted', 'reconciler: the failed orphan records reconcile_exhausted');
select is((select outcome::text from public.paige_act_executions where id='ad000007-0000-4000-8000-000000000007'),
          'ambiguous', 'reconciler: a recent (<24h) unconfirmed orphan is left ambiguous for a later tick');
select is((select outcome::text from public.paige_act_executions where id='ad000008-0000-4000-8000-000000000008'),
          'ambiguous', 'reconciler: a FRESH (not-yet-stale) row is excluded by the 10-min staleness bar');

-- in-body §59 guard: a JWT caller (auth.uid() non-null) is refused even though the SQL is otherwise valid.
set request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
select throws_ok(
  $$ select public.paige_reconcile_orchestration_acts() $$,
  '42501', NULL,
  'reconciler: refuses a JWT caller (§59 in-body guard) — cron/service-role only');
reset request.jwt.claim.sub;

select * from finish();
rollback;
