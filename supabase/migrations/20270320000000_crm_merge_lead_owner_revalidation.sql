-- DEPLOY-HISTORY RECONCILIATION (§32/§13) — retained so local migration history matches prod.
--
-- This version (20270320000000) is ALREADY RECORDED in prod's supabase_migrations.schema_migrations:
-- during #1259's deploy (run #273) the CLI's recording INSERT committed once, then a retry hit a
-- duplicate-key on that same row and the run reported failure — so `db-live` never advanced and the
-- intended persistence was never confirmed. #1264 then renumbered this migration to 20270321000000 and
-- DELETED this file, which made `supabase db push` refuse with:
--   "Remote migration versions not found in local migrations directory: 20270320000000
--    ... supabase migration repair --status reverted 20270320000000"
-- because a version recorded on remote no longer had a local file (a local↔remote history mismatch).
--
-- Restoring this file (byte-identical SQL body below) clears that mismatch: `db push` sees the version
-- recorded on remote AND present locally, so it SKIPS it (already-recorded migrations are never
-- re-applied). The identical function body is (re)applied and its persistence GUARANTEED by the sibling
-- migration 20270321000000, which is present on main but NOT yet recorded on prod — so it applies fresh
-- on the next deploy. This avoids relying on the unproven assumption that run #273 committed the DDL.
-- On a fresh database (CI database-contract) both files apply in order as idempotent CREATE OR REPLACE;
-- the pgTAP matrix (plan 143) is unchanged.
--
-- ===================== original reviewed migration body (unchanged) =====================
-- Forward security migration (§9/§59/§37/§32): revalidate lead_owner_user_id on contact.merge.
--
-- Fix-forward over 20270204000000 (already applied to prod; NOT edited here). During contact.merge,
-- a loser's lead_owner_user_id could transfer to the survivor without server-side revalidation that
-- the owner is an active member of the contact's tenant. public.can_access_contact() uses that field
-- in financial-RLS access decisions, so an inherited stale/removed/cross-tenant owner would silently
-- regain access to the survivor's financial data (Codex -qwJ / task_5e2f8f2f).
--
-- This CREATE OR REPLACE reproduces public.execute_crm_command byte-for-byte from 20270204000000
-- (function + its grant/revoke/comment) with exactly three additive edits, all inside the
-- contact.merge branch:
--   1) declare v_lead_owner_id / v_lead_owner_transferred;
--   2) after the existing coach revalidation, revalidate a TRANSFERRED lead_owner_user_id against
--      active same-tenant membership under lock and RAISE CRM_LEAD_OWNER_FORBIDDEN (42501) before any
--      write if it is not active (fail-closed, atomic -- the whole transaction rolls back);
--   3) the survivor UPDATE applies the precomputed, revalidated v_lead_owner_id.
-- No other behavior changes. Roles are intentionally unrestricted (lead owners are legitimately reps,
-- not only coaches); active same-tenant membership is the invariant. cs_primary_user_id is not
-- transferred by merge; linked_user_id remains gated by CRM_MERGE_IDENTITY_RESOLUTION_REQUIRED and
-- CRM_MERGE_IDENTITY_CONFLICT and is out of this narrow fix's scope.

create or replace function public.execute_crm_command(
  _tenant_id uuid,_actor_id uuid,_command jsonb,_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a text:=nullif(pg_catalog.btrim(_command->>'action'),''); p public.crm_command_previews%rowtype;
  c public.clients%rowtype; loser public.clients%rowtype; t public.tasks%rowtype; d public.deals%rowtype;
  deps jsonb; now_snap jsonb; v_result jsonb; readback jsonb; run_id uuid; changed int; target_count int;
  resolutions jsonb; owner_id uuid; field text; choice text; v_capability text; v_prior_auto_stub text; v_transfer_email boolean; v_loser_email_cleared boolean; v_lead_owner_id uuid; v_lead_owner_transferred boolean;
  v_hash text; v_cached public.crm_command_results%rowtype; effective_command jsonb;
  v_active_tenant uuid; v_actor_role text; v_autonomy_mode text; v_approval_channel text:=nullif(_command->>'approval_channel','');
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then raise exception 'CRM_INTERNAL_EXECUTOR_REQUIRED' using errcode='42501'; end if;
  if _tenant_id is null or _actor_id is null or a is null or coalesce(pg_catalog.btrim(_idempotency_key),'')='' or pg_catalog.length(_idempotency_key)>200 or pg_catalog.jsonb_typeof(_command)<>'object' then raise exception 'CRM_COMMAND_INVALID' using errcode='22023'; end if;
  perform 1 from public.tenants tenant_row where tenant_row.id=_tenant_id and tenant_row.status in ('trial','active','past_due') for update;
  if not found then raise exception 'CRM_TENANT_SUSPENDED' using errcode='42501'; end if;
  select profile_row.active_tenant_id into v_active_tenant from public.profiles profile_row where profile_row.user_id=_actor_id for update;
  if not found or v_active_tenant is distinct from _tenant_id then raise exception 'CRM_ACTIVE_ACCOUNT_CHANGED' using errcode='42501'; end if;
  select tm.role into v_actor_role from public.tenant_members tm
    where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin','coach') for update;
  if not found then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  effective_command:=public.crm_effective_command(_command);
  v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(effective_command::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-command:'||_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key,0));
  select * into v_cached from public.crm_command_results r where r.tenant_id=_tenant_id and r.actor_user_id=_actor_id and r.idempotency_key=_idempotency_key for update;
  if found then
    if v_cached.command_hash<>v_hash then raise exception 'CRM_IDEMPOTENCY_REUSE' using errcode='22023'; end if;
    -- Reuse the one cached-result authorization path so service-side retries cannot bypass
    -- current record access after a coach reassignment.
    return public.read_crm_command_result(_tenant_id,_actor_id,_command,_idempotency_key);
  end if;
  v_capability:=case a
    when 'contact.create' then 'crm_create_contact' when 'contact.update' then 'crm_update_contact'
    when 'contact.archive' then 'crm_archive_contact' when 'contact.restore' then 'crm_restore_contact'
    when 'contact.link_company' then 'crm_link_contact_company' when 'contact.unlink_company' then 'crm_unlink_contact_company'
    when 'contact.assign_coach' then 'crm_assign_coach' when 'contact.assign_owner' then 'crm_assign_contact_owner'
    when 'contact.merge' then 'crm_merge_contacts' when 'contact.hard_delete' then 'crm_hard_delete_contact'
    when 'contact.bulk_update' then 'crm_bulk_update_contacts' when 'company.create' then 'crm_create_company'
    when 'company.update' then 'crm_update_company' when 'company.archive' then 'crm_archive_company'
    when 'company.restore' then 'crm_restore_company' when 'task.create' then 'crm_create_task'
    when 'task.update' then 'crm_update_task' when 'task.assign' then 'crm_assign_task'
    when 'task.reschedule' then 'crm_reschedule_task' when 'task.complete' then 'crm_complete_task'
    when 'task.reopen' then 'crm_reopen_task' when 'task.cancel' then 'crm_cancel_task'
    when 'task.delete' then 'crm_delete_task' when 'activity.log' then 'crm_log_activity'
    when 'deal.create' then 'deal_create' when 'deal.update' then 'crm_update_deal'
    when 'deal.assign_owner' then 'crm_assign_deal_owner' when 'deal.assign_contact' then 'crm_assign_deal_contact'
    when 'deal.move' then 'deal_move_stage' when 'deal.close' then 'crm_close_deal'
    when 'deal.reopen' then 'crm_reopen_deal' when 'deal.delete' then 'crm_delete_deal' else null end;
  if v_capability is null then raise exception 'CRM_ACTION_UNAVAILABLE' using errcode='0A000'; end if;
  if v_approval_channel is null or v_approval_channel not in ('operator_card','standing_autonomy_setting') then raise exception 'CRM_AUTHORITY_REQUIRED' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tool-autonomy:'||_tenant_id::text||':'||v_capability,0));
  select ta.mode into v_autonomy_mode from public.tenant_tool_autonomy ta where ta.tenant_id=_tenant_id and ta.tool_key=v_capability;
  v_autonomy_mode:=coalesce(v_autonomy_mode,'confirm');
  if v_autonomy_mode='off' or (v_autonomy_mode='confirm' and v_approval_channel<>'operator_card') then raise exception 'CRM_AUTONOMY_REFUSED' using errcode='42501'; end if;
  if a in ('contact.assign_coach','contact.assign_owner','contact.merge','contact.hard_delete','contact.bulk_update','task.assign','task.cancel','task.delete','deal.assign_owner','deal.assign_contact','deal.close','deal.reopen','deal.delete')
    and v_approval_channel<>'operator_card' then raise exception 'CRM_APPROVAL_REQUIRED' using errcode='42501'; end if;
  if a in ('contact.create','contact.update','contact.archive','contact.restore','contact.link_company','contact.unlink_company','company.create','company.update','company.archive','company.restore','task.create','task.update','task.assign','task.reschedule','task.complete','task.reopen','task.cancel','activity.log','deal.create','deal.update','deal.move','deal.close','deal.reopen') then
    return public.execute_crm_command_reversible(_tenant_id,_actor_id,_command,_idempotency_key);
  end if;
  if not exists(select 1 from public.tenant_members tm where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin')) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;

  if a in ('contact.assign_coach','contact.assign_owner') then
    select * into c from public.clients where id=(_command->>'contact_id')::uuid and tenant_id=_tenant_id for update;
    if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002'; end if;
    if c.updated_at is distinct from (_command->>'expected_updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
    owner_id:=nullif(_command->>'owner_user_id','')::uuid;
    if owner_id is not null then
      perform 1 from public.tenant_members tm where tm.tenant_id=_tenant_id and tm.user_id=owner_id and tm.status='active' and (a='contact.assign_owner' or tm.role in ('owner','admin','coach')) for update;
      if not found then raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode='42501'; end if;
    end if;
    if a='contact.assign_coach' then
      perform pg_catalog.set_config('app.suppress_contact_assignment_notification','on',true);
      update public.clients set assigned_coach_user_id=owner_id,updated_at=pg_catalog.clock_timestamp() where id=c.id returning * into c;
    else update public.clients set lead_owner_user_id=owner_id,updated_at=pg_catalog.clock_timestamp() where id=c.id returning * into c; end if;
    readback:=pg_catalog.jsonb_build_object('id',c.id,'client_ref',c.account_number,'assigned_coach_user_id',c.assigned_coach_user_id,'lead_owner_user_id',c.lead_owner_user_id,'updated_at',c.updated_at,'external_effect',false,'notification_sent',false);
  elsif a in ('deal.assign_owner','deal.assign_contact') then
    return public.execute_crm_command_reversible(_tenant_id,_actor_id,effective_command,_idempotency_key);
  else
    if coalesce(_command->>'preview_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'CRM_PREVIEW_REQUIRED' using errcode='22023'; end if;
    select * into p from public.crm_command_previews where id=(_command->>'preview_id')::uuid and tenant_id=_tenant_id and actor_user_id=_actor_id and action=a and consumed_at is null and expires_at>pg_catalog.now() for update;
    if not found then raise exception 'CRM_PREVIEW_INVALID_OR_EXPIRED' using errcode='42501'; end if;
    update public.crm_command_previews set consumed_at=pg_catalog.clock_timestamp() where id=p.id;
    if a='task.delete' then
      select * into t from public.tasks where id=(p.target_snapshot->>'task_id')::uuid and tenant_id=_tenant_id for update;
      if not found or coalesce(t.updated_at,t.created_at) is distinct from (p.target_snapshot->>'updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      delete from public.tasks where id=t.id and tenant_id=_tenant_id;
      if exists(select 1 from public.tasks where id=t.id) then raise exception 'CRM_ABSENCE_READBACK_FAILED' using errcode='P0002'; end if;
      readback:=pg_catalog.jsonb_build_object('id',t.id,'absent',true,'deleted_count',1);
    elsif a='deal.delete' then
      select * into d from public.deals where id=(p.target_snapshot->>'deal_id')::uuid and tenant_id=_tenant_id for update;
      if not found or d.version<>(p.target_snapshot->>'version')::bigint then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      if exists(select 1 from public.paige_invoices where deal_id=d.id and tenant_id is distinct from _tenant_id) then raise exception 'CRM_CROSS_TENANT_DEPENDENCY' using errcode='42501'; end if;
      perform 1 from public.tasks where deal_id=d.id and tenant_id=_tenant_id for update;
      perform 1 from public.paige_invoices where deal_id=d.id and tenant_id=_tenant_id for update;
      perform 1 from public.deal_activities where deal_id=d.id for update;
      perform 1 from public.stage_automation_events where deal_id=d.id and tenant_id=_tenant_id for update;
      perform 1 from public.pipeline_move_approvals where deal_id=d.id and tenant_id=_tenant_id for update;
      perform 1 from public.pipeline_deal_outcomes where deal_id=d.id and tenant_id=_tenant_id for update;
      deps:=pg_catalog.jsonb_build_object('tasks',(select count(*) from public.tasks where deal_id=d.id and tenant_id=_tenant_id),'invoices',(select count(*) from public.paige_invoices where deal_id=d.id and tenant_id=_tenant_id),'activities',(select count(*) from public.deal_activities where deal_id=d.id),'automation_events',(select count(*) from public.stage_automation_events where deal_id=d.id and tenant_id=_tenant_id),'move_approvals',(select count(*) from public.pipeline_move_approvals where deal_id=d.id and tenant_id=_tenant_id),'outcomes',(select count(*) from public.pipeline_deal_outcomes where deal_id=d.id and tenant_id=_tenant_id));
      now_snap:=public.crm_deal_dependency_snapshot(_tenant_id,d.id);
      if deps is distinct from p.target_snapshot->'dependency_counts' or now_snap is distinct from p.target_snapshot->'dependency_set' then raise exception 'CRM_DEPENDENCY_CONFLICT' using errcode='40001'; end if;
      update public.tasks set deal_id=null,updated_at=pg_catalog.clock_timestamp() where deal_id=d.id and tenant_id=_tenant_id;
      update public.paige_invoices set deal_id=null,updated_at=pg_catalog.clock_timestamp() where deal_id=d.id and tenant_id=_tenant_id;
      delete from public.deals where id=d.id and tenant_id=_tenant_id;
      if exists(select 1 from public.deals where id=d.id) then raise exception 'CRM_ABSENCE_READBACK_FAILED' using errcode='P0002'; end if;
      readback:=pg_catalog.jsonb_build_object('id',d.id,'absent',true,'deleted_count',1,'dependency_counts',deps);
    elsif a='contact.hard_delete' then
      select * into c from public.clients where id=(p.target_snapshot->>'contact_id')::uuid and tenant_id=_tenant_id for update;
      if not found or c.updated_at is distinct from (p.target_snapshot->>'updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      deps:=public.crm_contact_dependency_snapshot(c.id);
      if c.linked_user_id is not null or deps is distinct from p.target_snapshot->'dependency_snapshot' or (deps->>'total')::bigint<>0 then raise exception 'CRM_HARD_DELETE_UNSAFE' using errcode='42501'; end if;
      delete from public.clients where id=c.id and tenant_id=_tenant_id;
      if exists(select 1 from public.clients where id=c.id) then raise exception 'CRM_ABSENCE_READBACK_FAILED' using errcode='P0002'; end if;
      readback:=pg_catalog.jsonb_build_object('id',c.id,'client_ref',c.account_number,'absent',true,'deleted_count',1,'dependency_counts',deps);
    elsif a='contact.merge' then
      select * into c from public.clients where id=(p.target_snapshot->>'survivor_contact_id')::uuid and tenant_id=_tenant_id for update;
      select * into loser from public.clients where id=(p.target_snapshot->>'loser_contact_id')::uuid and tenant_id=_tenant_id for update;
      if c.id is null or loser.id is null or c.updated_at is distinct from (p.target_snapshot->>'survivor_updated_at')::timestamptz or loser.updated_at is distinct from (p.target_snapshot->>'loser_updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      if c.status is distinct from 'active' or loser.status is distinct from 'active' or c.merged_into_contact_id is not null or loser.merged_into_contact_id is not null then raise exception 'CRM_MERGE_TARGET_INACTIVE' using errcode='42501'; end if;
      perform 1 from public.deals dependency_deal where dependency_deal.contact_client_id=loser.id for update;
      perform 1 from public.client_notes dependency_note where dependency_note.contact_id=loser.id for update;
      deps:=public.crm_contact_dependency_snapshot(loser.id);
      if deps is distinct from p.target_snapshot->'dependency_snapshot' then raise exception 'CRM_DEPENDENCY_CONFLICT' using errcode='40001'; end if;
      if (deps->>'unsupported')::bigint<>0 then raise exception 'CRM_MERGE_DEPENDENCIES_UNSUPPORTED' using errcode='42501'; end if;
      if c.linked_user_id is not null and loser.linked_user_id is not null and c.linked_user_id<>loser.linked_user_id then raise exception 'CRM_MERGE_IDENTITY_CONFLICT' using errcode='42501'; end if;
      resolutions:=p.target_snapshot->'resolutions';
      v_transfer_email:=coalesce(resolutions->>'email'='loser',false) or (not (resolutions ? 'email') and c.email is null);
      -- Selection (v_transfer_email) applies the chosen email even when it is null; the durable clearing
      -- receipt is a distinct fact -- an existing loser email was actually erased. Capture it from the
      -- pre-mutation loser row before the release update below nulls loser.email, so the readback matches
      -- the preview (loser selected AND the loser actually had an email), never conflating the two.
      v_loser_email_cleared:=v_transfer_email and loser.email is not null;
      owner_id:=case when resolutions->>'assigned_coach_user_id'='loser' or (not (resolutions ? 'assigned_coach_user_id') and c.assigned_coach_user_id is null) then loser.assigned_coach_user_id else c.assigned_coach_user_id end;
      if owner_id is not null then
        perform 1 from public.tenant_members tm
         where tm.tenant_id=_tenant_id and tm.user_id=owner_id and tm.status='active'
           and tm.role in ('owner','admin','coach') for update;
        if not found then raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode='42501'; end if;
      end if;
      -- §9/§59 security: a merge must never assign a TRANSFERRED lead_owner_user_id that is not an active
      -- member of the contact's tenant. can_access_contact() gates financial RLS on this field, so an
      -- inherited stale/removed/cross-tenant owner would silently regain financial access. Reuse the coach
      -- guard's membership predicate (lock + require active same-tenant membership; else refuse the whole
      -- merge before any write -- fail-closed, atomic), scoped to the TRANSFERRED value per the invariant: a
      -- value RETAINED from the survivor grants no new access via the merge and is out of this fix's scope
      -- (the broader can_access_contact membership-staleness hardening is a separate follow-up). Roles are
      -- intentionally unrestricted -- lead owners are legitimately reps, not only coaches; active
      -- same-tenant membership is the invariant.
      v_lead_owner_transferred:=resolutions->>'lead_owner_user_id'='loser' or (not (resolutions ? 'lead_owner_user_id') and c.lead_owner_user_id is null);
      v_lead_owner_id:=case when v_lead_owner_transferred then loser.lead_owner_user_id else c.lead_owner_user_id end;
      if v_lead_owner_transferred and v_lead_owner_id is not null then
        perform 1 from public.tenant_members tm
         where tm.tenant_id=_tenant_id and tm.user_id=v_lead_owner_id and tm.status='active' for update;
        if not found then raise exception 'CRM_LEAD_OWNER_FORBIDDEN' using errcode='42501'; end if;
      end if;
      -- Release the losing row's unique portal identity before transferring it. The loaded row
      -- variable retains the exact preview-bound value used below; the whole transaction rolls back on failure.
      update public.clients set
        linked_user_id=null,
        email=case when v_transfer_email then null else email end
       where id=loser.id;
      perform pg_catalog.set_config('app.suppress_contact_assignment_notification','on',true);
      v_prior_auto_stub:=pg_catalog.current_setting('app.suppress_contact_auto_stub',true);
      perform pg_catalog.set_config('app.suppress_contact_auto_stub','on',true);
      update public.clients set
        email=case when v_transfer_email then loser.email else c.email end,
        phone=case when resolutions->>'phone'='loser' or (not (resolutions ? 'phone') and c.phone is null) then loser.phone else c.phone end,
        entity_name=case when resolutions->>'entity_name'='loser' or (not (resolutions ? 'entity_name') and c.entity_name is null) then loser.entity_name else c.entity_name end,
        title=case when resolutions->>'title'='loser' or (not (resolutions ? 'title') and c.title is null) then loser.title else c.title end,
        linked_user_id=case when resolutions->>'linked_user_id'='loser' or (not (resolutions ? 'linked_user_id') and c.linked_user_id is null) then loser.linked_user_id else c.linked_user_id end,
        primary_business_id=case when resolutions->>'primary_business_id'='loser' or (not (resolutions ? 'primary_business_id') and c.primary_business_id is null) then loser.primary_business_id else c.primary_business_id end,
        assigned_coach_user_id=owner_id,
        lead_owner_user_id=v_lead_owner_id,
        tags=coalesce((select pg_catalog.array_agg(distinct x order by x) from pg_catalog.unnest(coalesce(c.tags,array[]::text[])||coalesce(loser.tags,array[]::text[])) x),array[]::text[]),
        updated_at=pg_catalog.clock_timestamp() where id=c.id returning * into c;
      perform pg_catalog.set_config('app.suppress_contact_auto_stub',coalesce(v_prior_auto_stub,''),true);
      update public.deals set contact_client_id=c.id,updated_at=pg_catalog.clock_timestamp() where contact_client_id=loser.id;
      update public.client_notes set contact_id=c.id,updated_at=pg_catalog.clock_timestamp() where contact_id=loser.id;
      perform pg_catalog.set_config('app.crm_merge_lineage_write','on',true);
      update public.clients set status='archived',merged_into_contact_id=c.id,merged_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp() where id=loser.id returning * into loser;
      readback:=pg_catalog.jsonb_build_object('id',c.id,'client_ref',c.account_number,'merged_contact_id',loser.id,'loser_archived',loser.status='archived','loser_email_cleared',v_loser_email_cleared,'dependency_counts',deps,'updated_at',c.updated_at,'external_effect',false,'notification_sent',false);
    elsif a='contact.bulk_update' then
      if p.target_snapshot->'patch' ? 'assigned_coach_user_id' and nullif(p.target_snapshot->'patch'->>'assigned_coach_user_id','') is not null then
        perform 1 from public.tenant_members tm
         where tm.tenant_id=_tenant_id and tm.user_id=(p.target_snapshot->'patch'->>'assigned_coach_user_id')::uuid
           and tm.status='active' and tm.role in ('owner','admin','coach') for update;
        if not found then raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode='42501'; end if;
      end if;
      if p.target_snapshot->'patch' ? 'tags' and not public.crm_tags_are_valid(p.target_snapshot->'patch'->'tags') then
        raise exception 'CRM_TAGS_INVALID' using errcode='22023';
      end if;
      select count(*) into target_count from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets');
      perform 1 from public.clients target_client
       join pg_catalog.jsonb_array_elements(p.target_snapshot->'targets') x on target_client.id=(x->>'id')::uuid
       where target_client.tenant_id=_tenant_id order by target_client.id for update of target_client;
      select count(*) into changed from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets') x
       left join public.clients target_client on target_client.id=(x->>'id')::uuid and target_client.tenant_id=_tenant_id
       where target_client.id is null or target_client.updated_at is distinct from (x->>'updated_at')::timestamptz;
      if changed>0 then raise exception 'CRM_BULK_TARGET_VERSION_CONFLICT:%',changed using errcode='40001'; end if;
      if p.target_snapshot->'patch' ? 'assigned_coach_user_id' then
        perform pg_catalog.set_config('app.suppress_contact_assignment_notification','on',true);
      end if;
      update public.clients target_client set
        lifecycle_stage=case when p.target_snapshot->'patch' ? 'lifecycle_stage' then p.target_snapshot->'patch'->>'lifecycle_stage' else target_client.lifecycle_stage end,
        tags=case when p.target_snapshot->'patch' ? 'tags' then array(select pg_catalog.jsonb_array_elements_text(p.target_snapshot->'patch'->'tags')) else target_client.tags end,
        do_not_contact=case when p.target_snapshot->'patch' ? 'do_not_contact' then (p.target_snapshot->'patch'->>'do_not_contact')::boolean else target_client.do_not_contact end,
        assigned_coach_user_id=case when p.target_snapshot->'patch' ? 'assigned_coach_user_id' then nullif(p.target_snapshot->'patch'->>'assigned_coach_user_id','')::uuid else target_client.assigned_coach_user_id end,
        updated_at=pg_catalog.clock_timestamp()
      where target_client.tenant_id=_tenant_id and target_client.id in (select (x->>'id')::uuid from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets') x);
      get diagnostics changed=row_count;
      select pg_catalog.jsonb_build_object('updated_count',changed,'changed_since_preview_count',0,'refused_count',(p.preview->>'refused_count')::int,'external_effect',false,'notification_sent',false,'records',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',target_client.id,'client_ref',target_client.account_number,'lifecycle_stage',target_client.lifecycle_stage,'tags',target_client.tags,'do_not_contact',target_client.do_not_contact,'assigned_coach_user_id',target_client.assigned_coach_user_id,'updated_at',target_client.updated_at) order by target_client.id),'[]'::jsonb)) into readback
       from public.clients target_client where target_client.tenant_id=_tenant_id and target_client.id in (select (x->>'id')::uuid from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets') x);
    else raise exception 'CRM_ACTION_UNAVAILABLE' using errcode='0A000'; end if;
  end if;
  run_id:=(pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),1,8)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),9,4)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),13,4)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),17,4)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),21,12))::uuid;
  v_capability:=case a
    when 'contact.assign_coach' then 'crm_assign_coach' when 'contact.assign_owner' then 'crm_assign_contact_owner'
    when 'contact.merge' then 'crm_merge_contacts' when 'contact.hard_delete' then 'crm_hard_delete_contact'
    when 'contact.bulk_update' then 'crm_bulk_update_contacts' when 'task.delete' then 'crm_delete_task'
    when 'deal.assign_owner' then 'crm_assign_deal_owner' when 'deal.assign_contact' then 'crm_assign_deal_contact'
    when 'deal.delete' then 'crm_delete_deal' else null end;
  if v_capability is null then raise exception 'CRM_RECEIPT_CAPABILITY_MISSING' using errcode='XX000'; end if;
  perform public.record_capability_run(_tenant_id,_actor_id,v_capability,'capability_succeeded',run_id,null,null,null,null,
    pg_catalog.jsonb_build_object('action',a,'record_id',readback->>'id','idempotency_key',_idempotency_key,'preview_id',_command->>'preview_id'));
  v_result:=pg_catalog.jsonb_build_object('ok',true,'action',a,'outcome','succeeded','readback',readback,'receipt_recorded',true,'correlation_id',run_id,'replayed',false);
  update public.crm_command_previews cp set result=v_result where cp.id=p.id;
  insert into public.crm_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,action,result)
  values(_tenant_id,_idempotency_key,v_hash,_actor_id,a,v_result);
  return v_result;
exception when unique_violation then
  select r.result into v_result from public.crm_command_results r where r.tenant_id=_tenant_id and r.actor_user_id=_actor_id and r.idempotency_key=_idempotency_key and r.command_hash=v_hash;
  if v_result is null then raise exception 'CRM_IDEMPOTENCY_REUSE' using errcode='22023'; end if;
  return v_result||pg_catalog.jsonb_build_object('replayed',true);
end$$;
revoke all on function public.execute_crm_command(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.execute_crm_command(uuid,uuid,jsonb,text) to service_role;
comment on function public.execute_crm_command(uuid,uuid,jsonb,text) is 'Canonical governed CRM command executor. Service-only, active-membership revalidated, version/idempotency bound, durable readback and receipt required.';
