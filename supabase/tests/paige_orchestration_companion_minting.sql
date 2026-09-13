-- Layer C · C5 slice 2 (+ fix-forward 20270304000000) — companion-minting, readable description, ledger-proven
-- direct-approve guard, cancellation-sync, durable reconciler (RPC-return-truthful), and the idempotent backfill.
-- Behavioural proof against the schema `supabase db reset` replayed from zero (house pgTAP style; synthetic
-- opaque fixtures; the enclosing transaction is ALWAYS rolled back — no production/customer records).
--
-- Fixtures are seeded with the fixture tables' FK constraints dropped + their USER triggers disabled (owner-
-- privilege, inside the rolled-back txn — CI's session does not honor session_replication_role), so exact
-- timestamps and orphan states can be constructed without a full parent graph; the TRIGGERS UNDER TEST are
-- then RE-ENABLED and exercised via real INSERT/UPDATE, and the reconciler is called as the cron/service
-- context (auth.uid() NULL) exactly as pg_cron invokes it.
begin;
select plan(45);

-- Seed the tenant in NORMAL mode (triggers ON) so its account_number-assignment trigger fires.
insert into public.tenants(id, slug, name, status, account_type, account_number_prefix, features) values
  ('11111111-1111-4111-8111-111111111111', 'paige-c5s2-proof-tenant', 'Paige C5S2 Proof Tenant', 'active', 'standalone', 'PC5', '{}'::jsonb);

-- OWNER-privilege seeding (see header): drop FK constraints + disable USER triggers on the fixture tables so
-- held/ambiguous/orphan rows insert with synthetic ids + explicit timestamps and the mint does not auto-fire.
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
alter table public.paige_act_executions    disable trigger user;
alter table public.paige_pending_approvals disable trigger user;

-- Native events (processing_state='done' = the orphan case the sweeper cannot re-drive).
insert into public.paige_native_events(id, event_key, tenant_id, subject_table, subject_id, dedup_key, processing_state) values
  ('1e000001-0000-4000-8000-000000000001','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-1','done'),
  ('1e000002-0000-4000-8000-000000000002','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-2','done'),
  ('1e000003-0000-4000-8000-000000000003','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-3','done'),
  ('1e000004-0000-4000-8000-000000000004','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000001-0000-4000-8000-000000000001','dk-4','done'),
  ('1e000005-0000-4000-8000-000000000005','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000005-0000-4000-8000-000000000005','dk-5','done'),
  ('1e000006-0000-4000-8000-000000000006','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000006-0000-4000-8000-000000000006','dk-6','done'),
  ('1e000007-0000-4000-8000-000000000007','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000007-0000-4000-8000-000000000007','dk-7','done'),
  ('1e000008-0000-4000-8000-000000000008','contact.created','11111111-1111-4111-8111-111111111111','clients','c0000008-0000-4000-8000-000000000008','dk-8','done'),
  ('1e00000b-0000-4000-8000-00000000000b','contact.created','11111111-1111-4111-8111-111111111111','clients','c000000b-0000-4000-8000-00000000000b','dk-b','done'),
  ('1e00000c-0000-4000-8000-00000000000c','contact.created','11111111-1111-4111-8111-111111111111','clients','c000000c-0000-4000-8000-00000000000c','dk-c','done');

-- L1..L3: held acts seeded at accepted_for_execution (mint disabled); transitioned to approval_pending after
-- triggers re-enable, firing the mint. detail carries the engine's snapshot + risk.
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, detail) values
  ('ad000001-0000-4000-8000-000000000001','1e000001-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001','ac000001-0000-4000-8000-000000000001',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','accepted_for_execution','idem-1','corr-1', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','engaged'), 'risk','high')),
  ('ad000002-0000-4000-8000-000000000002','1e000002-0000-4000-8000-000000000002','a0000002-0000-4000-8000-000000000002','ac000002-0000-4000-8000-000000000002',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','accepted_for_execution','idem-2','corr-2', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','won'), 'risk','ordinary')),
  ('ad000003-0000-4000-8000-000000000003','1e000003-0000-4000-8000-000000000003','a0000003-0000-4000-8000-000000000003','ac000003-0000-4000-8000-000000000003',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','accepted_for_execution','idem-3','corr-3', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','lead')));

-- L4: an already-EXECUTED held act + its still-pending companion (cancellation no-clobber control).
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, settled_at, detail) values
  ('ad000004-0000-4000-8000-000000000004','1e000004-0000-4000-8000-000000000004','a0000004-0000-4000-8000-000000000004','ac000004-0000-4000-8000-000000000004',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','executed','idem-4','corr-4', now(), '{}'::jsonb);
insert into public.paige_pending_approvals(type, draft_content, category, tenant_id, source, status, risk_level, metadata) values
  ('other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending','medium',
   jsonb_build_object('source','paige_orchestration','event_id','1e000004-0000-4000-8000-000000000004','act_id','ac000004-0000-4000-8000-000000000004'));

-- L5..L8: reconciler orphans (ambiguous, event done). L8 is fresh → excluded by the 10-min bar.
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, detail, created_at, updated_at, dispatched_at) values
  ('ad000005-0000-4000-8000-000000000005','1e000005-0000-4000-8000-000000000005','a0000005-0000-4000-8000-000000000005','ac000005-0000-4000-8000-000000000005',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-5','corr-5', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','engaged')), now()-interval '20 minutes', now()-interval '20 minutes', now()-interval '20 minutes'),
  ('ad000006-0000-4000-8000-000000000006','1e000006-0000-4000-8000-000000000006','a0000006-0000-4000-8000-000000000006','ac000006-0000-4000-8000-000000000006',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-6','corr-6', '{}'::jsonb, now()-interval '25 hours', now()-interval '20 minutes', now()-interval '25 hours'),
  ('ad000007-0000-4000-8000-000000000007','1e000007-0000-4000-8000-000000000007','a0000007-0000-4000-8000-000000000007','ac000007-0000-4000-8000-000000000007',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-7','corr-7', '{}'::jsonb, now()-interval '20 minutes', now()-interval '20 minutes', now()-interval '20 minutes'),
  ('ad000008-0000-4000-8000-000000000008','1e000008-0000-4000-8000-000000000008','a0000008-0000-4000-8000-000000000008','ac000008-0000-4000-8000-000000000008',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','ambiguous','idem-8','corr-8', '{}'::jsonb, now(), now(), now());

-- Companions (pending) for the reconciler orphans resolved (L5 + L6).
insert into public.paige_pending_approvals(type, draft_content, category, tenant_id, source, status, risk_level, metadata) values
  ('other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending','medium',
   jsonb_build_object('source','paige_orchestration','event_id','1e000005-0000-4000-8000-000000000005','act_id','ac000005-0000-4000-8000-000000000005')),
  ('other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending','medium',
   jsonb_build_object('source','paige_orchestration','event_id','1e000006-0000-4000-8000-000000000006','act_id','ac000006-0000-4000-8000-000000000006'));

-- The landed transition for L5 (contact = the event subject, source_event = the act's correlation_ref).
insert into public.paige_journey_stage_transitions(contact_id, to_stage_id, source_event) values
  ('c0000005-0000-4000-8000-000000000005', 1, 'corr-5');

-- LB: an already-EXECUTED held act + a pending companion — the guard's "approve LIVES when the ledger is
-- resolved" control (the sanctioned service-role executor path).
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, settled_at, detail) values
  ('ad00000b-0000-4000-8000-00000000000b','1e00000b-0000-4000-8000-00000000000b','a000000b-0000-4000-8000-00000000000b','ac00000b-0000-4000-8000-00000000000b',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','executed','idem-b','corr-b', now(), '{}'::jsonb);
insert into public.paige_pending_approvals(id, type, draft_content, category, tenant_id, source, status, metadata) values
  ('9a00000b-0000-4000-8000-00000000000b','other','{}'::jsonb,'crm.advance_journey_stage','11111111-1111-4111-8111-111111111111','paige_orchestration','pending',
   jsonb_build_object('source','paige_orchestration','event_id','1e00000b-0000-4000-8000-00000000000b','act_id','ac00000b-0000-4000-8000-00000000000b'));

-- LC: a held act at approval_pending with NO companion (mint disabled at seed) — the BACKFILL orphan.
insert into public.paige_act_executions
  (id, event_id, automation_id, act_id, act_position, tenant_id, adapter_kind, capability_key, effective_lane, outcome, idempotency_key, correlation_ref, detail) values
  ('ad00000c-0000-4000-8000-00000000000c','1e00000c-0000-4000-8000-00000000000c','a000000c-0000-4000-8000-00000000000c','ac00000c-0000-4000-8000-00000000000c',1,'11111111-1111-4111-8111-111111111111','native','crm.advance_journey_stage','confirm','approval_pending','idem-c','corr-c', jsonb_build_object('snapshot_args', jsonb_build_object('stage_slug','nurtured')));

-- A NON-orchestration approval (the direct-approve guard must NOT touch it).
insert into public.paige_pending_approvals(id, type, draft_content, category, tenant_id, source, status, metadata) values
  ('9a000001-0000-4000-8000-000000000001','cs_draft','{}'::jsonb,'followup','11111111-1111-4111-8111-111111111111','paige_action_bus','pending','{}'::jsonb);

-- §59 cancellation-sync fixtures + memberships.
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

-- Re-enable the user triggers — now exercise the seams under test.
alter table public.paige_act_executions    enable trigger user;
alter table public.paige_pending_approvals enable trigger user;

-- ══ (A) MINT: transitioning a ledger row into approval_pending mints exactly one READABLE companion ══════
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
-- READABLE OUTPUT (finding #1): no more "(no summary)".
select is((select draft_content->>'subject' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'Advance Journey Stage', 'mint readable: draft_content.subject humanizes the capability_key');
select is((select summary from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'Advance Journey Stage', 'mint readable: summary is the readable subject (ApprovalRow shows it, not "(no summary)")');
select ok((select draft_content->>'preview' like '%stage slug: engaged%' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'mint readable: draft_content.preview renders the snapshot args');
select ok((select draft_content->>'body' like '%Paige needs your approval%' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'mint readable: draft_content.body explains the action to approve');
select is((select metadata->>'event_id' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          '1e000001-0000-4000-8000-000000000001', 'mint: metadata.event_id carried');
select is((select metadata->>'act_execution_id' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'ad000001-0000-4000-8000-000000000001', 'mint: metadata.act_execution_id carried');
select is((select metadata->>'capability_id' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'crm.advance_journey_stage', 'mint: metadata.capability_id carried');
select is((select metadata->'snapshot_args'->>'stage_slug' from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'engaged', 'mint: metadata.snapshot_args carried (the immutable governed args)');
select ok((select submitted_by_user_id is null from public.paige_pending_approvals where metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          'mint: submitted_by_user_id NULL (proposed by Paige autonomously)');
-- the content helper also folds in a subject (client) label when present — proved directly (no clients fixture needed).
select is((select public.paige_orchestration_approval_content('crm.advance_journey_stage','{"stage_slug":"engaged"}'::jsonb,'Jane Client')->>'subject'),
          'Advance Journey Stage for Jane Client', 'content helper: names the record (client) in the subject');

-- risk mapping: 'ordinary' and absent both map to medium.
update public.paige_act_executions set outcome='approval_pending' where id='ad000002-0000-4000-8000-000000000002';
update public.paige_act_executions set outcome='approval_pending' where id='ad000003-0000-4000-8000-000000000003';
select is((select risk_level from public.paige_pending_approvals where metadata->>'act_id'='ac000002-0000-4000-8000-000000000002'),
          'medium', 'mint: risk_level medium mapped from detail.risk=ordinary');
select is((select risk_level from public.paige_pending_approvals where metadata->>'act_id'='ac000003-0000-4000-8000-000000000003'),
          'medium', 'mint: risk_level medium mapped when detail.risk absent');

-- ══ (B) IDEMPOTENCY ═════════════════════════════════════════════════════════════════════════════════════
update public.paige_act_executions set detail = detail || '{"redrain":true}'::jsonb where id='ad000001-0000-4000-8000-000000000001';
select is((select count(*)::int from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000001-0000-4000-8000-000000000001'),
          1, 'idempotency: a re-derive (outcome stays approval_pending) never double-mints');
select ok((select (tgtype & 4) > 0 and (tgtype & 16) > 0 from pg_trigger where tgname='trg_paige_mint_orchestration_approval'),
          'mint trigger is wired AFTER INSERT OR UPDATE (fires on the real INSERT prod path too)');

-- ══ (C) CANCELLATION-SYNC ═══════════════════════════════════════════════════════════════════════════════
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
set request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
update public.paige_pending_approvals set status='rejected' where id='9a000009-0000-4000-8000-000000000009';
reset request.jwt.claim.sub;
select is((select outcome::text from public.paige_act_executions where id='ad000009-0000-4000-8000-000000000009'),
          'approval_pending', 'cancellation-sync §59: a cross-tenant JWT caller does NOT cancel the held act (safe degrade)');
set request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
update public.paige_pending_approvals set status='rejected' where id='9a00000a-0000-4000-8000-00000000000a';
reset request.jwt.claim.sub;
select is((select outcome::text from public.paige_act_executions where id='ad00000a-0000-4000-8000-00000000000a'),
          'cancelled', 'cancellation-sync §59: an active member of the act''s tenant DOES cancel the held act');

-- ══ (D) DIRECT-APPROVE GUARD — LEDGER-PROVEN, no client-writable bypass (finding #2) ════════════════════
-- (D1) a JWT/browser caller may NEVER flip an orchestration approval to approved — even forging act_outcome.
set request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
select throws_ok(
  $$ update public.paige_pending_approvals set status='approved', metadata = metadata || '{"act_outcome":"executed"}'::jsonb where source='paige_orchestration' and metadata->>'act_id'='ac000003-0000-4000-8000-000000000003' $$,
  '42501', NULL,
  'guard (forged JWT write): a JWT caller cannot self-approve an orchestration act even with a forged metadata.act_outcome');
reset request.jwt.claim.sub;
-- (D2) even the service role cannot approve while the LEDGER act is not resolved (ac000003 is approval_pending).
select throws_ok(
  $$ update public.paige_pending_approvals set status='approved', metadata = metadata || '{"act_outcome":"executed"}'::jsonb where source='paige_orchestration' and metadata->>'act_id'='ac000003-0000-4000-8000-000000000003' $$,
  '42501', NULL,
  'guard (ledger cross-check): approval refused while the canonical ledger act is not terminal, forged act_outcome notwithstanding');
-- (D3) the sanctioned path LIVES: service role, ledger act executed (ad00000b) → approve allowed.
select lives_ok(
  $$ update public.paige_pending_approvals set status='approved', metadata = metadata || '{"act_outcome":"executed"}'::jsonb where id='9a00000b-0000-4000-8000-00000000000b' $$,
  'guard: service-role approve is allowed when the canonical ledger act is executed (the executor path)');
-- (D4) a NON-orchestration approval is unaffected.
select lives_ok(
  $$ update public.paige_pending_approvals set status='approved' where id='9a000001-0000-4000-8000-000000000001' $$,
  'guard: a NON-orchestration approval is unaffected (fast no-op)');

-- ══ (E) DURABLE RECONCILER — advances via the monotonic RPC and stamps the companion from its ACTUAL return ═
select public.paige_reconcile_orchestration_acts();

select is((select outcome::text from public.paige_act_executions where id='ad000005-0000-4000-8000-000000000005'),
          'executed', 'reconciler: a landed correlation transition advances the orphan to executed');
select is((select status from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000005-0000-4000-8000-000000000005'),
          'approved', 'reconciler: the executed orphan''s companion is stamped approved (§70 inbox stays truthful)');
select is((select metadata->>'act_outcome' from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000005-0000-4000-8000-000000000005'),
          'executed', 'reconciler (finding #3): companion act_outcome = the RPC''s ACTUAL executed outcome');
select is((select outcome::text from public.paige_act_executions where id='ad000006-0000-4000-8000-000000000006'),
          'failed', 'reconciler: >24h with no stamped transition advances to failed');
select is((select metadata->>'act_outcome' from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac000006-0000-4000-8000-000000000006'),
          'failed', 'reconciler (finding #3): the failed orphan''s companion carries act_outcome=failed (tracks the ledger, never a stale requested value)');
select is((select refusal_code from public.paige_act_executions where id='ad000006-0000-4000-8000-000000000006'),
          'reconcile_exhausted', 'reconciler: the failed orphan records reconcile_exhausted');
select is((select outcome::text from public.paige_act_executions where id='ad000007-0000-4000-8000-000000000007'),
          'ambiguous', 'reconciler: a recent (<24h) unconfirmed orphan is left ambiguous for a later tick');
select is((select outcome::text from public.paige_act_executions where id='ad000008-0000-4000-8000-000000000008'),
          'ambiguous', 'reconciler: a FRESH (not-yet-stale) row is excluded by the 10-min staleness bar');
set request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
select throws_ok(
  $$ select public.paige_reconcile_orchestration_acts() $$,
  '42501', NULL,
  'reconciler: refuses a JWT caller (§59 in-body guard) — cron/service-role only');
reset request.jwt.claim.sub;

-- ══ (F) BACKFILL — a held act that predates the mint gets an idempotent companion (finding #4) ═══════════
-- The orphan ad00000c is approval_pending with NO companion (mint was disabled at seed and it was never
-- transitioned). Confirm the gap, then run the migration's backfill statement and confirm a readable companion
-- appears exactly once — and that a second run is a no-op (idempotent).
select is((select count(*)::int from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac00000c-0000-4000-8000-00000000000c'),
          0, 'backfill precondition: the pre-mint held act has NO companion');

-- (the backfill statement — byte-for-byte the migration's, so this proves the migration''s own query)
insert into public.paige_pending_approvals (
  type, draft_content, summary, category, contact_id, conversation_id, tenant_id,
  source, status, risk_level, submitted_by_user_id, metadata
)
select
  'other', ct.content, ct.content->>'subject', ae.capability_key, null, null, ae.tenant_id,
  'paige_orchestration', 'pending',
  case when (ae.detail->>'risk') = 'high' then 'high' else 'medium' end, null,
  jsonb_build_object('source','paige_orchestration','event_id',ae.event_id,'act_id',ae.act_id,
    'act_execution_id',ae.id,'automation_id',ae.automation_id,'capability_id',ae.capability_key,
    'snapshot_args',ae.detail->'snapshot_args','backfilled',true)
from public.paige_act_executions ae
left join public.paige_native_events ev on ev.id = ae.event_id
left join public.clients c on ev.subject_table = 'clients' and c.id = ev.subject_id
cross join lateral (
  select public.paige_orchestration_approval_content(
    ae.capability_key, ae.detail->'snapshot_args',
    case when ev.subject_table = 'clients'
         then nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
         else null end) as content) ct
where ae.outcome = 'approval_pending'
  and not exists (select 1 from public.paige_pending_approvals pa
                   where pa.source='paige_orchestration'
                     and (pa.metadata->>'event_id') = ae.event_id::text
                     and (pa.metadata->>'act_id')   = ae.act_id::text)
on conflict ((metadata->>'event_id'), (metadata->>'act_id')) where source = 'paige_orchestration'
do nothing;

select is((select count(*)::int from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac00000c-0000-4000-8000-00000000000c'),
          1, 'backfill: exactly one companion minted for the pre-existing held act');
select is((select summary from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac00000c-0000-4000-8000-00000000000c'),
          'Advance Journey Stage', 'backfill: the backfilled companion carries the readable summary');
select ok((select (metadata->>'backfilled')::boolean from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac00000c-0000-4000-8000-00000000000c'),
          'backfill: the companion is marked backfilled=true (auditable provenance)');

-- second run — idempotent (NOT EXISTS + ON CONFLICT DO NOTHING): still exactly one.
insert into public.paige_pending_approvals (
  type, draft_content, summary, category, contact_id, conversation_id, tenant_id,
  source, status, risk_level, submitted_by_user_id, metadata
)
select
  'other', ct.content, ct.content->>'subject', ae.capability_key, null, null, ae.tenant_id,
  'paige_orchestration', 'pending',
  case when (ae.detail->>'risk') = 'high' then 'high' else 'medium' end, null,
  jsonb_build_object('source','paige_orchestration','event_id',ae.event_id,'act_id',ae.act_id,
    'act_execution_id',ae.id,'automation_id',ae.automation_id,'capability_id',ae.capability_key,
    'snapshot_args',ae.detail->'snapshot_args','backfilled',true)
from public.paige_act_executions ae
left join public.paige_native_events ev on ev.id = ae.event_id
left join public.clients c on ev.subject_table = 'clients' and c.id = ev.subject_id
cross join lateral (
  select public.paige_orchestration_approval_content(
    ae.capability_key, ae.detail->'snapshot_args',
    case when ev.subject_table = 'clients'
         then nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
         else null end) as content) ct
where ae.outcome = 'approval_pending'
  and not exists (select 1 from public.paige_pending_approvals pa
                   where pa.source='paige_orchestration'
                     and (pa.metadata->>'event_id') = ae.event_id::text
                     and (pa.metadata->>'act_id')   = ae.act_id::text)
on conflict ((metadata->>'event_id'), (metadata->>'act_id')) where source = 'paige_orchestration'
do nothing;

select is((select count(*)::int from public.paige_pending_approvals where source='paige_orchestration' and metadata->>'act_id'='ac00000c-0000-4000-8000-00000000000c'),
          1, 'backfill: a second run is idempotent (still exactly one companion)');

select * from finish();
rollback;
