-- Reusable Solo CSV import: internal staging, immutable batch preview, and one
-- service-only atomic write seam. Chat's canonical gate remains approval authority.
-- No provider calls, sends, campaign enrollment, legacy retirement, or tenant seed.
-- Raw/custom source values NEVER belong in the safe status projection.
create table public.contact_import_runs (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id), actor_user_id uuid not null,
 source_system text not null check(length(source_system) between 1 and 128),
 source_account_key text not null check(length(source_account_key) between 1 and 256),
 snapshot_key text not null check(length(snapshot_key) between 1 and 256),
 source_observed_at timestamptz not null, mapping jsonb not null,
 state text not null default 'preview' check(state in ('preview','partial','completed','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,source_system,source_account_key,snapshot_key), unique(tenant_id,id)
);
create table public.contact_import_rows (
 run_id uuid not null, tenant_id uuid not null, row_number integer not null check(row_number between 1 and 10000),
 staged jsonb not null check(jsonb_typeof(staged)='object'),
 state text not null default 'pending' check(state in ('pending','applied','skipped')),
 client_id uuid references public.clients(id), applied_at timestamptz,
 primary key(run_id,row_number), foreign key(tenant_id,run_id) references public.contact_import_runs(tenant_id,id)
);
create table public.contact_import_batches (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, run_id uuid not null,
 actor_user_id uuid not null, selection jsonb not null check(jsonb_typeof(selection)='array'),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
 issued_in_request text not null, state text not null default 'preview' check(state in ('preview','completed','cancelled')),
 receipt jsonb, foreign key(tenant_id,run_id) references public.contact_import_runs(tenant_id,id)
);
create table public.client_source_records (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 client_id uuid not null references public.clients(id), source_system text not null,
 source_account_key text not null, identity_key text not null, external_id text,
 first_run_id uuid not null, last_run_id uuid not null, source_observed_at timestamptz not null,
 -- Durable source attributes include alternate identities, program/campaign history and
 -- unknown fields. Restricted to import-owned reads; not a generic CRM JSON column.
 source_attributes jsonb not null,
 unique(tenant_id,source_system,source_account_key,identity_key),
 foreign key(tenant_id,first_run_id) references public.contact_import_runs(tenant_id,id),
 foreign key(tenant_id,last_run_id) references public.contact_import_runs(tenant_id,id)
);
-- No browser table grants: the server supplies only explicitly scoped projections.
alter table public.contact_import_runs enable row level security;
alter table public.contact_import_rows enable row level security;
alter table public.contact_import_batches enable row level security;
alter table public.client_source_records enable row level security;
revoke all on public.contact_import_runs,public.contact_import_rows,public.contact_import_batches,public.client_source_records from public,anon,authenticated;
grant select,insert,update on public.contact_import_runs,public.contact_import_rows,public.contact_import_batches,public.client_source_records to service_role;

create function public._contact_import_authority(p_tenant uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_claims text:=current_setting('request.jwt.claims',true); v_sub text:=current_setting('request.jwt.claim.sub',true); v_resolved uuid;
begin
 if auth.uid() is not null or coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','') <> 'service_role' then
  raise exception 'IMPORT_SERVICE_REQUIRED' using errcode='42501';
 end if;
 if p_tenant is null or p_actor is null or not public.is_tenant_admin_as(p_actor,p_tenant) then
  raise exception 'IMPORT_OWNER_REQUIRED' using errcode='42501';
 end if;
 perform 1 from public.profiles where user_id=p_actor for update;
 if not found then raise exception 'IMPORT_ACTOR_UNAVAILABLE' using errcode='42501'; end if;
 perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_actor for share;
 -- The profile lock serializes active-workspace switches with the entire transaction.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 begin
  v_resolved:=public.current_user_tenant_id();
 exception when others then
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  raise exception 'IMPORT_WORKSPACE_UNAVAILABLE' using errcode='42501';
 end;
 perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
 if v_resolved is distinct from p_tenant or not public.is_tenant_admin_as(p_actor,p_tenant) then
  raise exception 'IMPORT_WORKSPACE_CHANGED' using errcode='42501';
 end if;
end $$;
revoke all on function public._contact_import_authority(uuid,uuid) from public,anon,authenticated;
grant execute on function public._contact_import_authority(uuid,uuid) to service_role;

-- Defense against a mistaken service writer linking a foreign client. Never derive
-- tenant from an unverified client reference and thereby silently switch workspaces.
create function public._contact_import_client_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.client_id is not null and not exists(select 1 from public.clients c where c.id=new.client_id and c.tenant_id=new.tenant_id) then
  raise exception 'IMPORT_CLIENT_SCOPE' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public._contact_import_client_scope() from public,anon,authenticated;
create trigger import_source_client_scope before insert or update on public.client_source_records for each row execute function public._contact_import_client_scope();
create trigger import_row_client_scope before insert or update on public.contact_import_rows for each row execute function public._contact_import_client_scope();

-- p_preview is produced by contact-import-contract.ts in the authenticated server,
-- not accepted verbatim from a browser. SQL still checks structural bounds.
create function public.stage_contact_import(p_tenant uuid,p_actor uuid,p_source jsonb,p_preview jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_existing public.contact_import_runs; v_row jsonb; v_n integer:=0;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 if jsonb_typeof(p_preview->'rows') is distinct from 'array' or jsonb_array_length(p_preview->'rows') not between 1 and 10000
    or octet_length(p_preview::text)>10000000 or jsonb_typeof(p_preview->'mapping') is distinct from 'object'
    or jsonb_typeof(p_source) is distinct from 'object' then raise exception 'IMPORT_INVALID_PREVIEW' using errcode='22023'; end if;
 -- Serialize identical snapshot submissions without changing an already reviewed run.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text || p_source::text,0));
 select * into v_existing from public.contact_import_runs where tenant_id=p_tenant and source_system=p_source->>'system'
  and source_account_key=p_source->>'accountKey' and snapshot_key=p_source->>'snapshotKey';
 if found then
  if v_existing.actor_user_id<>p_actor or v_existing.mapping is distinct from p_preview->'mapping'
     or (select jsonb_agg(staged order by row_number) from public.contact_import_rows where run_id=v_existing.id) is distinct from p_preview->'rows' then
   raise exception 'IMPORT_SNAPSHOT_CHANGED' using errcode='23514';
  end if;
  return v_existing.id;
 end if;
 insert into public.contact_import_runs(tenant_id,actor_user_id,source_system,source_account_key,snapshot_key,source_observed_at,mapping)
 values(p_tenant,p_actor,p_source->>'system',p_source->>'accountKey',p_source->>'snapshotKey',(p_source->>'observedAt')::timestamptz,p_preview->'mapping') returning id into v_id;
 for v_row in select value from jsonb_array_elements(p_preview->'rows') loop
  v_n:=v_n+1;
  if jsonb_typeof(v_row->'fields') is distinct from 'object' or jsonb_typeof(v_row->'consent') is distinct from 'object'
    or (v_row->'consent'->>'email') not in ('unknown','granted','denied') or (v_row->'consent'->>'sms') not in ('unknown','granted','denied')
    or v_row->'consent'->>'email' is null or v_row->'consent'->>'sms' is null then raise exception 'IMPORT_INVALID_ROW' using errcode='22023'; end if;
  insert into public.contact_import_rows(run_id,tenant_id,row_number,staged) values(v_id,p_tenant,v_n,v_row);
 end loop;
 return v_id;
end $$;

-- Explicit review choices: create (mapped patch), retain (existing contact unchanged),
-- or skip. The selection is the immutable preview, NOT an approval queue.
create function public.select_contact_import_batch(p_tenant uuid,p_actor uuid,p_run uuid,p_selection jsonb,p_request_nonce text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_run public.contact_import_runs; v_item jsonb; v_row public.contact_import_rows; v_id uuid; v_patch jsonb; v_seen integer[]:='{}'; v_no integer; v_client public.clients; v_key text; v_value jsonb; v_expected text;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 select * into v_run from public.contact_import_runs where id=p_run and tenant_id=p_tenant and actor_user_id=p_actor for update;
 if not found or v_run.state in ('cancelled','completed') then raise exception 'IMPORT_RUN_UNAVAILABLE' using errcode='42501'; end if;
 if nullif(btrim(p_request_nonce),'') is null or length(p_request_nonce)>256 or jsonb_typeof(p_selection) is distinct from 'array'
    or jsonb_array_length(p_selection) not between 1 and 100 then raise exception 'IMPORT_INVALID_SELECTION' using errcode='22023'; end if;
 for v_item in select value from jsonb_array_elements(p_selection) loop
  v_no:=(v_item->>'row_number')::integer;
  if v_no=any(v_seen) then raise exception 'IMPORT_DUPLICATE_SELECTION' using errcode='22023'; end if;
  v_seen:=array_append(v_seen,v_no);
  select * into v_row from public.contact_import_rows where run_id=p_run and tenant_id=p_tenant and row_number=v_no and state='pending';
  if not found or v_item->>'disposition' is null or v_item->>'disposition' not in ('create','retain','skip') then raise exception 'IMPORT_ROW_UNAVAILABLE' using errcode='22023'; end if;
  if v_item->>'disposition'='create' then
   v_patch:=v_item->'patch';
   if jsonb_typeof(v_patch) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v_patch) k where k not in ('first_name','last_name','email','phone','tags','lifecycle_stage','notes','assigned_coach_user_id')) then raise exception 'IMPORT_PATCH_FORBIDDEN' using errcode='22023'; end if;
   -- Values are copied from the staged source, never invented by a client patch.
   for v_key,v_value in select key,value from jsonb_each(v_patch) loop
    v_expected:=v_row.staged->'fields'->>case v_key when 'assigned_coach_user_id' then 'owner' else v_key end;
    if v_key='tags' then
     -- Tags require explicit JSON-array source representation; no delimiter guessing.
     begin
      if v_value is distinct from v_expected::jsonb then raise exception 'IMPORT_PATCH_SOURCE_MISMATCH' using errcode='22023'; end if;
     exception when invalid_text_representation then raise exception 'IMPORT_TAG_MAPPING_REQUIRED' using errcode='22023'; end;
    elsif v_key='email' then
     if lower(btrim(v_value#>>'{}')) is distinct from lower(btrim(v_expected)) then raise exception 'IMPORT_PATCH_SOURCE_MISMATCH' using errcode='22023'; end if;
    elsif btrim(v_value#>>'{}') is distinct from btrim(v_expected) then
     raise exception 'IMPORT_PATCH_SOURCE_MISMATCH' using errcode='22023';
    end if;
   end loop;
   if nullif(btrim(v_patch->>'email'),'') is null and nullif(btrim(v_patch->>'phone'),'') is null then raise exception 'IMPORT_IDENTITY_REQUIRED' using errcode='22023'; end if;
   if nullif(btrim(v_patch->>'email'),'') is not null and btrim(v_patch->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'IMPORT_EMAIL_INVALID' using errcode='22023'; end if;
   if nullif(btrim(v_patch->>'phone'),'') is not null and btrim(v_patch->>'phone') !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'IMPORT_PHONE_INVALID' using errcode='22023'; end if;
   if v_patch ? 'tags' and (jsonb_typeof(v_patch->'tags') is distinct from 'array' or jsonb_array_length(v_patch->'tags')>100 or exists(select 1 from jsonb_array_elements(v_patch->'tags') x where jsonb_typeof(x)<>'string')) then raise exception 'IMPORT_TAGS_INVALID' using errcode='22023'; end if;
   if v_patch ? 'lifecycle_stage' and v_patch->>'lifecycle_stage' not in ('new_lead','qualified','nurturing','hot_lead','negotiating','won','client_active','client_paused','client_churned','client_funded','client_alumni') then raise exception 'IMPORT_LIFECYCLE_INVALID' using errcode='22023'; end if;
   if nullif(v_patch->>'assigned_coach_user_id','') is not null and not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=(v_patch->>'assigned_coach_user_id')::uuid and status='active') then raise exception 'IMPORT_ASSIGNEE_SCOPE' using errcode='42501'; end if;
  elsif v_item->>'disposition'='retain' then
   select * into v_client from public.clients where id=(v_item->>'client_id')::uuid and tenant_id=p_tenant;
   if not found or v_item->>'expected_updated_at' is null or v_client.updated_at is distinct from (v_item->>'expected_updated_at')::timestamptz or coalesce(v_item->'patch','{}')<>'{}'::jsonb then raise exception 'IMPORT_MATCH_STALE' using errcode='23514'; end if;
  end if;
 end loop;
 insert into public.contact_import_batches(tenant_id,run_id,actor_user_id,selection,issued_in_request)
 values(p_tenant,p_run,p_actor,p_selection,p_request_nonce) returning id into v_id;
 return v_id;
end $$;

-- NO browser grant. Runtime calls only after the canonical Chat gate claims the
-- stored crm_import_commit_batch call. Request nonce is a preview-age precondition,
-- never evidence of approval. Declined consumed confirmations are NOT consulted.
create or replace function public.commit_contact_import_batch(p_tenant uuid,p_actor uuid,p_batch uuid,p_request_nonce text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_batch public.contact_import_batches; v_run public.contact_import_runs; v_item jsonb; v_row public.contact_import_rows;
 v_patch jsonb; v_client public.clients; v_id uuid; v_identity text; v_external text; v_source public.client_source_records;
 v_ch text; v_address text; v_consent text; v_created integer:=0; v_retained integer:=0; v_skipped integer:=0; v_result jsonb;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 -- Single tenant import writer, then fixed run/batch/row lock order. Unique email
 -- still catches a concurrent ordinary CRM writer; the whole batch rolls back.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contact-import:'||p_tenant::text,0));
 select * into v_batch from public.contact_import_batches where id=p_batch and tenant_id=p_tenant and actor_user_id=p_actor for update;
 if not found then raise exception 'IMPORT_BATCH_UNAVAILABLE' using errcode='42501'; end if;
 select * into v_run from public.contact_import_runs where id=v_batch.run_id and tenant_id=p_tenant and actor_user_id=p_actor for update;
 if v_batch.state='completed' then return v_batch.receipt; end if;
 if v_batch.state<>'preview' or v_run.state='cancelled' or v_batch.expires_at<=clock_timestamp()
   or nullif(p_request_nonce,'') is null or p_request_nonce=v_batch.issued_in_request then raise exception 'IMPORT_PREVIEW_STALE' using errcode='23514'; end if;
 for v_item in select value from jsonb_array_elements(v_batch.selection) loop
  select * into v_row from public.contact_import_rows where run_id=v_run.id and tenant_id=p_tenant and row_number=(v_item->>'row_number')::integer for update;
  if not found or v_row.state<>'pending' then raise exception 'IMPORT_ROW_ALREADY_PROCESSED' using errcode='23514'; end if;
  if v_item->>'disposition'='skip' then
   update public.contact_import_rows set state='skipped',applied_at=now() where run_id=v_run.id and row_number=v_row.row_number;
   v_skipped:=v_skipped+1; continue;
  end if;
  v_external:=nullif(btrim(v_row.staged->'fields'->>'external_id'),'');
  v_identity:=case when v_external is not null then 'external:'||v_external else 'snapshot:'||v_run.snapshot_key||':'||v_row.row_number::text end;
  select * into v_source from public.client_source_records where tenant_id=p_tenant and source_system=v_run.source_system and source_account_key=v_run.source_account_key and identity_key=v_identity for update;
  if v_item->>'disposition'='retain' then
   select * into v_client from public.clients where id=(v_item->>'client_id')::uuid and tenant_id=p_tenant for update;
   if not found or v_client.updated_at is distinct from (v_item->>'expected_updated_at')::timestamptz then raise exception 'IMPORT_MATCH_STALE' using errcode='23514'; end if;
   v_id:=v_client.id; v_retained:=v_retained+1;
   if v_source.id is not null and v_source.client_id<>v_id then raise exception 'IMPORT_SOURCE_CONFLICT' using errcode='23514'; end if;
  else
   if v_source.id is not null then raise exception 'IMPORT_SOURCE_ALREADY_EXISTS_REVIEW' using errcode='23514'; end if;
   v_patch:=v_item->'patch';
   if nullif(v_patch->>'assigned_coach_user_id','') is not null and not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=(v_patch->>'assigned_coach_user_id')::uuid and status='active') then raise exception 'IMPORT_ASSIGNEE_SCOPE' using errcode='42501'; end if;
   if exists(select 1 from public.clients where tenant_id=p_tenant and ((nullif(v_patch->>'email','') is not null and lower(btrim(email))=lower(btrim(v_patch->>'email'))) or (nullif(v_patch->>'phone','') is not null and phone=v_patch->>'phone'))) then raise exception 'IMPORT_IDENTITY_CHANGED_REVIEW' using errcode='23514'; end if;
   -- Import-specific bulk seam: fixed columns + audit + tenant gate. Legacy tier is
   -- deliberately NULL: its assignment trigger is global. Program context is retained.
   insert into public.clients(tenant_id,created_by,first_name,last_name,email,phone,tags,lifecycle_stage,current_notes,assigned_coach_user_id,status,source,created_by_channel_type,last_mirrored_at)
   values(p_tenant,p_actor,coalesce(nullif(btrim(v_patch->>'first_name'),''),'New'),coalesce(nullif(btrim(v_patch->>'last_name'),''),'Contact'),nullif(lower(btrim(v_patch->>'email')),''),nullif(btrim(v_patch->>'phone'),''),array(select jsonb_array_elements_text(coalesce(v_patch->'tags','[]'))),coalesce(v_patch->>'lifecycle_stage','new_lead'),nullif(v_patch->>'notes',''),nullif(v_patch->>'assigned_coach_user_id','')::uuid,'active','import','import',v_run.source_observed_at) returning id into v_id;
   v_created:=v_created+1;
  end if;
  -- Preserve the original snapshot as source evidence. Updating provenance never
  -- overwrites the contact or silently upgrades consent based on a later import.
  insert into public.client_source_records(tenant_id,client_id,source_system,source_account_key,identity_key,external_id,first_run_id,last_run_id,source_observed_at,source_attributes)
  values(p_tenant,v_id,v_run.source_system,v_run.source_account_key,v_identity,v_external,v_run.id,v_run.id,v_run.source_observed_at,v_row.staged)
  on conflict(tenant_id,source_system,source_account_key,identity_key) do update set last_run_id=excluded.last_run_id;
  for v_ch in select unnest(array['email','sms']) loop
   select case when v_ch='email' then lower(btrim(email)) else phone end into v_address from public.clients where id=v_id and tenant_id=p_tenant;
   if v_ch='email' and v_address is not null then v_address:=split_part(split_part(v_address,'@',1),'+',1)||'@'||split_part(v_address,'@',2); end if;
   v_consent:=v_row.staged->'consent'->>v_ch;
   -- New contacts remain held even with imported grants. Existing contact grants
   -- are never replaced with an imported grant. Denials only tighten suppression.
   if v_item->>'disposition'='create' or v_consent='denied' then
    insert into public.paige_suppressions(tenant_id,contact_id,address_normalized,channel,reason,source)
    values(p_tenant,v_id,v_address,v_ch,'manual','api') on conflict do nothing;
   end if;
   if v_consent='denied' then
    insert into public.paige_consent_events(tenant_id,contact_id,address_normalized,channel,action,source,evidence_ref)
    values(p_tenant,v_id,v_address,v_ch,'revoked','api','contact-import:'||v_run.id::text||':'||v_row.row_number::text);
   -- Imported grants remain in the source record. Snapshot freshness is NOT the
   -- date of consent, and must never replace a newer address-level revocation.
   end if;
  end loop;
  update public.contact_import_rows set state='applied',client_id=v_id,applied_at=now() where run_id=v_run.id and row_number=v_row.row_number;
  insert into public.audit_logs(user_id,entity,action,entity_id,data) values(p_actor,'client','import_contact',v_id,jsonb_build_object('tenant_id',p_tenant,'run_id',v_run.id,'row_number',v_row.row_number,'disposition',v_item->>'disposition'));
 end loop;
 v_result:=jsonb_build_object('status','completed','created',v_created,'retained',v_retained,'skipped',v_skipped,'messages_sent',0);
 update public.contact_import_batches set state='completed',receipt=v_result where id=p_batch;
 update public.contact_import_runs set state=case when exists(select 1 from public.contact_import_rows where run_id=v_run.id and state='pending') then 'partial' else 'completed' end,updated_at=now() where id=v_run.id;
 insert into public.audit_logs(user_id,entity,action,entity_id,data) values(p_actor,'contact_import','import_batch_completed',p_batch,v_result||jsonb_build_object('tenant_id',p_tenant,'run_id',v_run.id));
 return v_result;
end $$;

create function public.cancel_contact_import(p_tenant uuid,p_actor uuid,p_run uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contact-import:'||p_tenant::text,0));
 update public.contact_import_runs set state='cancelled',updated_at=now() where id=p_run and tenant_id=p_tenant and actor_user_id=p_actor and state in ('preview','partial');
 if not found then raise exception 'IMPORT_RUN_UNAVAILABLE' using errcode='42501'; end if;
 update public.contact_import_batches set state='cancelled' where run_id=p_run and tenant_id=p_tenant and state='preview';
end $$;

create function public.contact_import_status(p_tenant uuid,p_actor uuid,p_run uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.contact_import_runs; v_counts jsonb;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 select * into v_run from public.contact_import_runs where id=p_run and tenant_id=p_tenant and actor_user_id=p_actor;
 if not found then raise exception 'IMPORT_RUN_UNAVAILABLE' using errcode='42501'; end if;
 select jsonb_build_object('total',count(*),'applied',count(*) filter(where state='applied'),'skipped',count(*) filter(where state='skipped'),'pending',count(*) filter(where state='pending')) into v_counts from public.contact_import_rows where run_id=p_run and tenant_id=p_tenant;
 return jsonb_build_object('state',v_run.state,'counts',v_counts,'source_observed_at',v_run.source_observed_at,'updated_at',v_run.updated_at);
end $$;

revoke all on function public.stage_contact_import(uuid,uuid,jsonb,jsonb),public.select_contact_import_batch(uuid,uuid,uuid,jsonb,text),public.commit_contact_import_batch(uuid,uuid,uuid,text),public.cancel_contact_import(uuid,uuid,uuid),public.contact_import_status(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.stage_contact_import(uuid,uuid,jsonb,jsonb),public.select_contact_import_batch(uuid,uuid,uuid,jsonb,text),public.commit_contact_import_batch(uuid,uuid,uuid,text),public.cancel_contact_import(uuid,uuid,uuid),public.contact_import_status(uuid,uuid,uuid) to service_role;


-- Internal owner preview: never forwarded to the model or normal Spine projection.
create function public.read_contact_import_preview(p_tenant uuid,p_actor uuid,p_run uuid,p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.contact_import_runs; v_rows jsonb;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 if p_offset<0 or p_limit not between 1 and 100 then raise exception 'IMPORT_PAGE_INVALID' using errcode='22023'; end if;
 select * into v_run from public.contact_import_runs where id=p_run and tenant_id=p_tenant and actor_user_id=p_actor;
 if not found then raise exception 'IMPORT_RUN_UNAVAILABLE' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('row_number',r.row_number,'state',r.state,'staged',r.staged,'client_id',r.client_id) order by r.row_number),'[]') into v_rows
 from(select * from public.contact_import_rows where run_id=p_run and tenant_id=p_tenant order by row_number offset p_offset limit p_limit) r;
 return jsonb_build_object('run_id',p_run,'mapping',v_run.mapping,'source',jsonb_build_object('system',v_run.source_system,'accountKey',v_run.source_account_key,'snapshotKey',v_run.snapshot_key,'observedAt',v_run.source_observed_at),'rows',v_rows,'preview_summary',public.contact_import_preview_summary(p_tenant,p_actor,p_run),'unmapped_headers',(select coalesce(jsonb_agg(distinct k),'[]') from public.contact_import_rows r cross join lateral jsonb_object_keys(coalesce(r.staged->'customFields','{}')) k where r.run_id=p_run and r.tenant_id=p_tenant),'status',public.contact_import_status(p_tenant,p_actor,p_run));
end $$;
-- Bounded paginated identity loader, tenant pin enforced before both joins.
create function public.contact_import_identities(p_tenant uuid,p_actor uuid,p_offset integer default 0,p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 if p_offset<0 or p_limit not between 1 and 1000 then raise exception 'IMPORT_PAGE_INVALID' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('contactKey',c.id,'email',c.email,'phone',c.phone,'updated_at',c.updated_at,'fields',jsonb_build_object('first_name',c.first_name,'last_name',c.last_name),'sources',coalesce((select jsonb_agg(jsonb_build_object('externalId',s.external_id,'sourceSystem',s.source_system,'sourceAccountKey',s.source_account_key)) from public.client_source_records s where s.tenant_id=p_tenant and s.client_id=c.id),'[]')) order by c.id),'[]') into v_result
 from(select id,email,phone,first_name,last_name,updated_at from public.clients where tenant_id=p_tenant order by id offset p_offset limit p_limit)c;
 return v_result;
end $$;
revoke all on function public.read_contact_import_preview(uuid,uuid,uuid,integer,integer),public.contact_import_identities(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.read_contact_import_preview(uuid,uuid,uuid,integer,integer),public.contact_import_identities(uuid,uuid,integer,integer) to service_role;



create function public.contact_import_preview_summary(p_tenant uuid,p_actor uuid,p_run uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_counts jsonb; v_batch integer;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 if not exists(select 1 from public.contact_import_runs where id=p_run and tenant_id=p_tenant and actor_user_id=p_actor) then raise exception 'IMPORT_RUN_UNAVAILABLE' using errcode='42501'; end if;
 select jsonb_build_object('total',count(*),'valid',count(*) filter(where jsonb_array_length(coalesce(staged->'errors','[]'))=0),'probableDuplicates',count(*) filter(where jsonb_array_length(coalesce(staged->'matches','[]'))>0 or coalesce(staged->'decisions','[]') ? 'duplicate_in_file'),'missingUsableIdentity',count(*) filter(where coalesce(staged->'decisions','[]') ? 'missing_usable_identity'),'consentRecords',count(*) filter(where staged->'consent'->>'email'<>'unknown' or staged->'consent'->>'sms'<>'unknown'),'optOutRecords',count(*) filter(where staged->'consent'->>'email'='denied' or staged->'consent'->>'sms'='denied'),'requiresDecision',count(*) filter(where jsonb_array_length(coalesce(staged->'decisions','[]'))>0 or jsonb_array_length(coalesce(staged->'errors','[]'))>0),'invalid',count(*) filter(where jsonb_array_length(coalesce(staged->'errors','[]'))>0)),least(100,count(*) filter(where state='pending' and jsonb_array_length(coalesce(staged->'errors','[]'))=0 and jsonb_array_length(coalesce(staged->'decisions','[]'))=0))::integer into v_counts,v_batch from public.contact_import_rows where run_id=p_run and tenant_id=p_tenant;
 return jsonb_build_object('counts',v_counts,'proposedBatchSize',v_batch,'writesPerformed',0,'messagesSent',0,'status','preview');
end $$;
create or replace function public.list_contact_imports(p_tenant uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public._contact_import_authority(p_tenant,p_actor);
 select coalesce(jsonb_agg(jsonb_build_object('run_id',r.id,'state',r.state,'created_at',r.created_at,'status',public.contact_import_status(p_tenant,p_actor,r.id),'batches',coalesce((select jsonb_agg(jsonb_build_object('batch_id',b.id,'state',b.state,'selected_count',jsonb_array_length(b.selection),'expires_at',b.expires_at,'created_at',b.created_at) order by b.created_at desc) from public.contact_import_batches b where b.tenant_id=p_tenant and b.run_id=r.id and b.actor_user_id=p_actor),'[]')) order by r.created_at desc),'[]') into v_result from(select * from public.contact_import_runs where tenant_id=p_tenant and actor_user_id=p_actor order by created_at desc limit 20)r;
 return v_result;
end $$;
revoke all on function public.contact_import_preview_summary(uuid,uuid,uuid),public.list_contact_imports(uuid,uuid) from public,anon,authenticated;
grant execute on function public.contact_import_preview_summary(uuid,uuid,uuid),public.list_contact_imports(uuid,uuid) to service_role;

-- A service path may change lifecycle state, never the data a person reviewed.
create function public._contact_import_immutable_preview()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='contact_import_batches' then
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id or new.run_id is distinct from old.run_id or new.actor_user_id is distinct from old.actor_user_id or new.selection is distinct from old.selection or new.issued_in_request is distinct from old.issued_in_request or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then raise exception 'IMPORT_PREVIEW_IMMUTABLE' using errcode='23514'; end if;
 elsif tg_table_name='contact_import_rows' then
  if new.run_id is distinct from old.run_id or new.tenant_id is distinct from old.tenant_id or new.row_number is distinct from old.row_number or new.staged is distinct from old.staged then raise exception 'IMPORT_SOURCE_IMMUTABLE' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function public._contact_import_immutable_preview() from public,anon,authenticated;
create trigger import_batch_immutable before update on public.contact_import_batches for each row execute function public._contact_import_immutable_preview();
create trigger import_staged_immutable before update on public.contact_import_rows for each row execute function public._contact_import_immutable_preview();
