-- INT-140 (20270411000000): one canonical identity projection for governed CRM replay hashing.
--
-- The authenticated Edge action door constructs __paige_canonical_identity_v1 only after its
-- strict request parser and canonical command boundary. The executable command keeps the display
-- spelling; this function exposes only the server-derived identity spelling to idempotency hashes.
-- A malformed or mismatched internal projection is ignored and the actual command remains the hash
-- source, so even a trusted internal caller cannot accidentally alias a different action.
create or replace function public.crm_effective_command(_command jsonb)
returns jsonb language sql immutable set search_path='' as $$
  with source as (
    select case
      when pg_catalog.jsonb_typeof(_command->'__paige_canonical_identity_v1')='object'
        and _command->'__paige_canonical_identity_v1'->>'action'=_command->>'action'
      then (_command->'__paige_canonical_identity_v1')
        || case when _command ? 'approval_channel'
          then pg_catalog.jsonb_build_object('approval_channel',_command->'approval_channel')
          else '{}'::jsonb end
      else _command-'__paige_canonical_identity_v1'
    end as command
  )
  select case when command->>'action' in ('deal.assign_owner','deal.assign_contact') then
    pg_catalog.jsonb_build_object(
      'action','deal.update','deal_id',command->>'deal_id','expected_version',command->'expected_version',
      'receipt_action',command->>'action','approval_channel',command->>'approval_channel'
    )
    || case when command->>'action'='deal.assign_owner' then pg_catalog.jsonb_build_object('owner_user_id',command->'owner_user_id') else '{}'::jsonb end
    || case when command->>'action'='deal.assign_contact' then pg_catalog.jsonb_build_object('contact_id',command->'contact_id') else '{}'::jsonb end
  else command end
  from source
$$;
revoke all on function public.crm_effective_command(jsonb) from public,anon,authenticated,service_role;

-- execute_crm_command already hashes crm_effective_command and read_crm_command_result already
-- checks both governed approval channels through it. The lower reversible executor is the one
-- remaining raw-command hash. Patch exactly that expression in the latest installed definition so
-- this forward migration cannot overwrite unrelated security hardening in the function body. Fail
-- closed if the expected predecessor is absent or appears more than once.
do $migration$
declare
  definition text;
  rewritten text;
  old_expression constant text := 'v_hash := encode(extensions.digest(convert_to(_command::text, ''UTF8''), ''sha256''), ''hex'');';
  new_expression constant text := 'v_hash := encode(extensions.digest(convert_to(public.crm_effective_command(_command)::text, ''UTF8''), ''sha256''), ''hex'');';
begin
  select pg_catalog.pg_get_functiondef('public.execute_crm_command_reversible(uuid,uuid,jsonb,text)'::pg_catalog.regprocedure)
    into definition;
  if definition is null
    or (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_expression,'')))
      / pg_catalog.length(old_expression) <> 1 then
    raise exception 'CRM_IDEMPOTENCY_HASH_PATCH_DRIFT';
  end if;
  rewritten := pg_catalog.replace(definition,old_expression,new_expression);
  execute rewritten;
end
$migration$;

comment on function public.crm_effective_command(jsonb) is
  'Server-only effective CRM command projection used by readback and execution idempotency hashes. Preserves executable display values while hashing the action-door-derived canonical identity.';
